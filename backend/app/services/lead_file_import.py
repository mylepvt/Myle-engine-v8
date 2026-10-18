"""Parse PDF or Excel (.xlsx) for team & leader personal lead imports (calling board).

PDF table / text extraction matches legacy ``myle_dashboard`` ``_extract_leads_from_pdf``.
Excel imports read a header row (Name / Phone / Email / City in any column order).
"""

from __future__ import annotations

import asyncio
import io
import re
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.schemas.leads import LeadCreate
from app.services.auto_handoff import AutoHandoffService
from app.services.crm_outbox import enqueue_lead_shadow_upsert

_PHONE_RE = re.compile(r"(?:(?:\+|0{0,2})91[-\s]?)?([6-9]\d{9})\b")
_MAX_BYTES = 5 * 1024 * 1024
_SOURCE_OK = frozenset({"facebook", "instagram", "referral", "walk_in", "other"})


def normalize_phone_digits(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) >= 10:
        return digits[-10:]
    return None


# Indian mobile written as one block or split 5+5 ("95178 18551", "95178-18551"), optional +91.
_SPLIT_PHONE_RE = re.compile(r"(?<!\d)(?:(?:\+|0{0,2})91[-\s]?)?([6-9]\d{4})[\s-]?(\d{5})(?!\d)")
# Lead-sheet line pieces after the phone ("WA 19 to 21 Female Delhi 18 Oct, 11:55 am G5/J/PM-3").
_WA_MARK_RE = re.compile(r"^(?:WA|WhatsApp)\b\s*", re.IGNORECASE)
_AGE_RE = re.compile(r"^(\d{1,2}\s*(?:to|-)\s*\d{1,2}|\d{1,2}\+?)(?=\s|$)\s*", re.IGNORECASE)
_GENDER_RE = re.compile(r"^(female|male|other)\b\s*", re.IGNORECASE)
_RECEIVED_RE = re.compile(
    r"\b(\d{1,2}\s+[A-Za-z]{3,9},?(?:\s+\d{4})?,?\s+\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?)",
    re.IGNORECASE,
)
_ROW_NUMBER_RE = re.compile(r"^\d{1,4}[.)]?\s+")


def _clean_cut(text: str) -> str:
    """Trim separators and the ellipsis PDFs add to clipped cells ("anshika mishra mis…")."""
    return text.strip().rstrip("…").rstrip(".").strip(" -|,;:\t")


def _parse_pdf_text_line(line: str) -> dict[str, str | None] | None:
    """One lead per text line: ``[#] name phone [WA] [age] [gender] [city] [received] [ad]``.

    Works for plain "Name 9876543210" lines and for the Myle lead-sheet PDFs, whose numbers are
    printed split ("95178 18551") and which carry age / gender / city / received time / ad code.
    """
    m = _SPLIT_PHONE_RE.search(line)
    if not m:
        return None
    phone = m.group(1) + m.group(2)
    before = _ROW_NUMBER_RE.sub("", line[: m.start()].strip(), count=1)
    name = _clean_cut(before)

    rest = _WA_MARK_RE.sub("", line[m.end() :].strip(), count=1)
    age = gender = city = received = ad = None
    am = _AGE_RE.match(rest)
    if am:
        age = am.group(1)
        rest = rest[am.end() :]
    gm = _GENDER_RE.match(rest)
    if gm:
        gender = gm.group(1).capitalize()
        rest = rest[gm.end() :]
    if age or gender:
        rm = _RECEIVED_RE.search(rest)
        if rm:
            city = _clean_cut(rest[: rm.start()]) or None
            received = rm.group(1).strip()
            ad = _clean_cut(rest[rm.end() :]) or None
        else:
            city = _clean_cut(rest) or None

    details = [
        f"{label}: {value}"
        for label, value in (("Age", age), ("Gender", gender), ("Received", received), ("Ad", ad))
        if value
    ]
    return {
        "name": name,
        "phone": phone,
        "email": None,
        "city": city[:100] if city else None,
        "source": None,
        "extra_notes": " · ".join(details) or None,
    }


def _leads_from_pdf_table(table: list[list[object]]) -> list[dict[str, str | None]]:
    """Rows from a real table with a Name / Phone header; [] when the table isn't one."""
    if not table:
        return []
    header_row = [str(c or "").lower().strip() for c in table[0]]
    name_col = next((i for i, h in enumerate(header_row) if "name" in h), None)
    phone_col = next(
        (
            i
            for i, h in enumerate(header_row)
            if any(k in h for k in ("phone", "mobile", "contact", "number"))
        ),
        None,
    )
    if name_col is None and phone_col is None:
        return []
    email_col = next((i for i, h in enumerate(header_row) if "email" in h or "mail" in h), None)
    city_col = next((i for i, h in enumerate(header_row) if "city" in h or "location" in h), None)

    leads: list[dict[str, str | None]] = []
    for row in table[1:]:
        if not row:
            continue
        cells = [str(c or "").strip() for c in row]

        def safe(i: int | None) -> str:
            if i is None or i >= len(cells):
                return ""
            return cells[i]

        name = safe(name_col)
        phone = safe(phone_col)
        m = _SPLIT_PHONE_RE.search(phone)
        if m:
            phone = m.group(1) + m.group(2)
        if name or phone:
            leads.append(
                {
                    "name": name,
                    "phone": phone,
                    "email": safe(email_col) or None,
                    "city": safe(city_col) or None,
                    "source": None,
                    "extra_notes": None,
                }
            )
    return leads


def extract_leads_from_pdf_bytes(content: bytes) -> tuple[list[dict[str, str | None]], str | None]:
    """Return (rows, error_message). Each row: name, phone, email, city, source=None, extra_notes.

    Uses a page's table when it has a Name/Phone header; otherwise (no table, or a decorative /
    empty one like the Myle lead sheets have) reads the page line by line.
    """
    try:
        import pdfplumber
    except ImportError:
        return [], "PDF parsing is not available on this server (pdfplumber not installed)."

    leads: list[dict[str, str | None]] = []
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                page_leads: list[dict[str, str | None]] = []
                for table in page.extract_tables() or []:
                    page_leads.extend(_leads_from_pdf_table(table))
                if not page_leads:
                    for line in (page.extract_text() or "").split("\n"):
                        row = _parse_pdf_text_line(line)
                        if row:
                            page_leads.append(row)
                leads.extend(page_leads)
    except Exception as exc:
        return [], f"Could not parse PDF: {exc}"

    return leads, None


# Header keyword -> semantic field for spreadsheet (xlsx) imports. First keyword
# that appears in a header cell wins for that column.
_XLSX_FIELD_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("email", ("email", "mail")),
    ("phone", ("phone", "mobile", "contact", "number", "calling")),
    ("city", ("city", "location")),
    ("name", ("name",)),
)


def _cell_text(val: object) -> str:
    if val is None:
        return ""
    if isinstance(val, bool):
        return ""
    if isinstance(val, float) and val == int(val):
        return str(int(val))
    return str(val).strip()


def extract_leads_from_xlsx_bytes(content: bytes) -> tuple[list[dict[str, str | None]], str | None]:
    """Return (rows, error_message) from an .xlsx workbook.

    Rows match the PDF extractor shape: name, phone, email, city, source=None, extra_notes=None.
    Headers are matched by keyword so column order does not matter.
    """
    try:
        from openpyxl import load_workbook
    except ImportError:
        return [], "Excel parsing is not available on this server (openpyxl not installed)."

    leads: list[dict[str, str | None]] = []
    try:
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:
        return [], f"Could not parse Excel file: {exc}"
    try:
        ws = wb.active
        if ws is None:
            return [], "The Excel file has no readable sheet."
        rows_iter = ws.iter_rows(values_only=True)
        header_row = next(rows_iter, None)
        if not header_row:
            return [], "The Excel file is empty."

        colmap: dict[str, int] = {}
        for col_i, cell in enumerate(header_row):
            h = _cell_text(cell).lower()
            if not h:
                continue
            for field, keywords in _XLSX_FIELD_KEYWORDS:
                if field in colmap:
                    continue
                if any(k in h for k in keywords):
                    colmap[field] = col_i
                    break

        if "name" not in colmap and "phone" not in colmap:
            return [], (
                "Could not find a Name or Phone column. Use a header row like: Name, Phone, Email, City."
            )

        for row in rows_iter:
            if not row:
                continue

            def cell(field: str) -> str:
                j = colmap.get(field)
                if j is None or j >= len(row):
                    return ""
                return _cell_text(row[j])

            name = cell("name")
            phone = cell("phone")
            email = cell("email") or None
            city = cell("city") or None
            m = _PHONE_RE.search(phone)
            if m:
                phone = m.group(1)
            if name or phone:
                leads.append(
                    {
                        "name": name,
                        "phone": phone,
                        "email": email,
                        "city": city,
                        "source": None,
                        "extra_notes": None,
                    }
                )
    finally:
        wb.close()

    return leads, None


def _resolve_source(row_src: str | None, fallback_tag: str) -> str:
    s = (row_src or "").strip().lower()
    if s in _SOURCE_OK:
        return s
    t = fallback_tag.strip().lower()
    if t in _SOURCE_OK:
        return t
    return "other"


def _build_notes(filename: str, tag: str, extra: str | None) -> str | None:
    parts = [f"Imported from {filename}"]
    if tag.strip():
        parts.append(f"Tag: {tag.strip()}")
    if extra:
        parts.append(extra)
    joined = " — ".join(parts)
    return joined[:5000] if joined else None


@dataclass
class LeadImportResult:
    imported: int
    skipped: int
    warnings: list[str]
    duplicates: int = 0  # phone already in Myle, or repeated in the same file
    invalid: int = 0  # missing / bad phone number


# One lock id for "new leads are being written" — imports and manual adds take it so
# two people uploading the same number at the same moment can't both get through.
LEAD_PHONE_LOCK_ID = 7_011_001


async def lock_lead_phones(session: AsyncSession) -> None:
    """Serialize duplicate-phone checks for the rest of this transaction (Postgres only)."""
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        await session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": LEAD_PHONE_LOCK_ID})


async def run_personal_lead_import(
    session: AsyncSession,
    *,
    user_id: int,
    file_bytes: bytes,
    filename: str,
    source_tag: str,
) -> LeadImportResult:
    """Insert leads for ``user_id`` (creator + assignee). Skip duplicates by normalized phone."""
    if len(file_bytes) > _MAX_BYTES:
        return LeadImportResult(0, 0, [f"File too large (max {_MAX_BYTES // (1024 * 1024)} MB)."])

    fname = (filename or "").lower()
    warnings: list[str] = []

    if fname.endswith(".pdf"):
        rows, err = await asyncio.to_thread(extract_leads_from_pdf_bytes, file_bytes)
    elif fname.endswith(".xlsx"):
        rows, err = await asyncio.to_thread(extract_leads_from_xlsx_bytes, file_bytes)
    else:
        return LeadImportResult(0, 0, ["Only .pdf and .xlsx files are allowed."])

    if err:
        return LeadImportResult(0, 0, [err])

    await lock_lead_phones(session)
    phones_db = (
        await session.execute(select(Lead.phone).where(Lead.deleted_at.is_(None)))
    ).scalars().all()
    existing: set[str] = set()
    for p in phones_db:
        n = normalize_phone_digits(p or "")
        if n and len(n) == 10:
            existing.add(n)

    imported = 0
    skipped = 0
    duplicates = 0
    invalid = 0
    seen_in_file: set[str] = set()

    for row in rows:
        name = (row.get("name") or "").strip()
        phone_raw = (row.get("phone") or "").strip()
        norm = normalize_phone_digits(phone_raw)
        if not name and not phone_raw:
            skipped += 1
            invalid += 1
            continue
        if not norm or len(norm) != 10:
            skipped += 1
            invalid += 1
            continue
        if norm in existing or norm in seen_in_file:
            skipped += 1
            duplicates += 1
            continue
        seen_in_file.add(norm)
        if not name:
            name = norm
        src = _resolve_source(row.get("source"), source_tag)
        extra = row.get("extra_notes")
        if isinstance(extra, str):
            extra = extra.strip() or None
        notes = _build_notes(filename or "upload", source_tag, extra)
        body = LeadCreate(
            name=name[:255],
            status="new_lead",
            phone=norm,
            email=(row.get("email") or None),
            city=(row.get("city") or None),
            source=src,
            notes=notes,
        )
        lead = Lead(
            name=body.name,
            status=body.status,
            created_by_user_id=user_id,
            owner_user_id=user_id,
            assigned_to_user_id=user_id,
            phone=body.phone,
            email=body.email,
            city=body.city,
            source=body.source,
            notes=body.notes,
        )
        session.add(lead)
        await session.flush()
        handoff = AutoHandoffService(session)
        await handoff.on_lead_created(lead=lead, actor_user_id=user_id)
        session.add(
            ActivityLog(
                user_id=user_id,
                action="lead.created",
                entity_type="lead",
                entity_id=lead.id,
                meta={"name": lead.name, "status": lead.status, "via": "file_import"},
            ),
        )
        enqueue_lead_shadow_upsert(session, lead)
        existing.add(norm)
        imported += 1

    await session.commit()
    if imported == 0 and not warnings:
        warnings.append("No new leads were imported (empty file, bad phone numbers, or all duplicates).")
    return LeadImportResult(
        imported=imported, skipped=skipped, warnings=warnings, duplicates=duplicates, invalid=invalid
    )
