"""Public legal pages for external integrations and reviewers."""

from __future__ import annotations

from dataclasses import dataclass
from html import escape

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()

_APP_NAME = "MYLE"
_PRODUCT_NAME = "Myle Community"
_CONTACT_EMAIL = "karanveer125@gmail.com"
_BASE_URL = "https://new-myle-community.onrender.com"
_UPDATED_AT = "May 17, 2026"


@dataclass(frozen=True)
class LegalSection:
    title: str
    paragraphs: tuple[str, ...] = ()
    bullets: tuple[str, ...] = ()


@dataclass(frozen=True)
class LegalDocument:
    key: str
    path: str
    label: str
    title: str
    summary: str
    sections: tuple[LegalSection, ...]


_DOCS: dict[str, LegalDocument] = {
    "privacy": LegalDocument(
        key="privacy",
        path="/privacy",
        label="Privacy Policy",
        title=f"{_APP_NAME} Privacy Policy",
        summary=(
            f"This policy explains how {_PRODUCT_NAME} collects, uses, stores, and "
            "shares information for workspace operations, lead management, training, "
            "reporting, and connected messaging features."
        ),
        sections=(
            LegalSection(
                title="Information we collect",
                paragraphs=(
                    "We collect account details such as name, display name, role, email address, phone number, FBO ID, and login metadata.",
                    "We may also process lead, customer, and operational data that workspace members enter into the app, including contact details, follow-up notes, call status, training activity, payment-proof uploads, reports, and messaging-related records.",
                    "Basic technical data such as IP address, browser type, device identifiers, cookies, request logs, and notification tokens may also be collected for security, troubleshooting, and service reliability.",
                ),
            ),
            LegalSection(
                title="How we use information",
                bullets=(
                    "To create and manage user accounts, sessions, and role-based access.",
                    "To run lead workflows, workboards, follow-ups, reports, and training journeys.",
                    "To support connected communication features, including WhatsApp or other Meta-linked business messaging flows where configured by the workspace.",
                    "To maintain security, investigate misuse, prevent fraud, and keep audit trails for operational accountability.",
                ),
            ),
            LegalSection(
                title="How information may be shared",
                paragraphs=(
                    "Information may be visible to authorized admins, leaders, team members, and support operators within the same workspace according to role and hierarchy rules configured in the app.",
                    "We may share limited data with infrastructure, hosting, analytics, notification, storage, or messaging providers only as needed to operate the service.",
                    "We may also disclose information when required by law, to enforce our terms, or to protect the rights, safety, or security of users, leads, customers, or the platform.",
                ),
            ),
            LegalSection(
                title="Retention and security",
                paragraphs=(
                    "We keep data only for as long as it is reasonably needed for active operations, compliance, support, dispute handling, backup recovery, and legitimate business records.",
                    "We use reasonable administrative and technical safeguards to protect data, but no internet-based service can guarantee absolute security.",
                ),
            ),
            LegalSection(
                title="Your choices and rights",
                paragraphs=(
                    "You may request access, correction, export, or deletion of personal data associated with your account or a connected messaging record, subject to verification and any legal or operational retention duties.",
                    f"For privacy questions or requests, contact us at {_CONTACT_EMAIL}.",
                ),
            ),
        ),
    ),
    "terms": LegalDocument(
        key="terms",
        path="/terms",
        label="Terms of Service",
        title=f"{_APP_NAME} Terms of Service",
        summary=(
            f"These terms govern access to {_PRODUCT_NAME}, including team workflows, "
            "lead operations, training tools, reporting, and optional messaging integrations."
        ),
        sections=(
            LegalSection(
                title="Acceptance and intended use",
                paragraphs=(
                    f"By accessing or using {_PRODUCT_NAME}, you agree to these Terms of Service and our Privacy Policy.",
                    f"{_PRODUCT_NAME} is intended for authorized business, team, training, and operational use only. You may not use the service for unlawful, abusive, deceptive, or unauthorized activity.",
                ),
            ),
            LegalSection(
                title="Accounts and workspace responsibilities",
                bullets=(
                    "You are responsible for keeping login credentials secure and for activity that occurs under your account.",
                    "Workspace owners and operators are responsible for ensuring they have an appropriate lawful basis to collect, store, and contact leads or customers inside the system.",
                    "If you connect WhatsApp or another Meta-linked messaging channel, you are responsible for using approved templates, valid permissions, and compliant recipient consent practices.",
                ),
            ),
            LegalSection(
                title="Prohibited conduct",
                bullets=(
                    "Do not attempt to bypass permissions, scrape restricted data, reverse engineer protected parts of the service, or interfere with system security.",
                    "Do not upload malicious files, impersonate another person, or use the platform to send spam, harassment, or unlawful marketing communications.",
                    "Do not store or transmit information that you are not authorized to handle.",
                ),
            ),
            LegalSection(
                title="Service changes, suspension, and termination",
                paragraphs=(
                    "We may update, suspend, limit, or discontinue any part of the service to improve operations, respond to security issues, or comply with legal or partner requirements.",
                    "We may suspend or terminate access if we reasonably believe a user or workspace has violated these terms, created operational risk, or used the service unlawfully.",
                ),
            ),
            LegalSection(
                title="Disclaimers and liability",
                paragraphs=(
                    "The service is provided on an as-is and as-available basis. We do not guarantee uninterrupted availability, error-free performance, or fitness for a particular purpose.",
                    "To the maximum extent permitted by law, MYLE will not be liable for indirect, incidental, special, consequential, or punitive damages arising from use of the service.",
                ),
            ),
            LegalSection(
                title="Contact",
                paragraphs=(
                    f"For support or legal questions about these terms, contact {_CONTACT_EMAIL}.",
                ),
            ),
        ),
    ),
    "data-deletion": LegalDocument(
        key="data-deletion",
        path="/data-deletion",
        label="User Data Deletion",
        title=f"{_APP_NAME} User Data Deletion Instructions",
        summary=(
            "This page explains how a user, lead, customer, or workspace admin can request "
            "deletion of personal data associated with MYLE systems or connected messaging records."
        ),
        sections=(
            LegalSection(
                title="How to request deletion",
                paragraphs=(
                    f"Send a deletion request to {_CONTACT_EMAIL} from your registered email address, or include enough information for us to verify the request safely.",
                    "If the request is about WhatsApp or another Meta-linked conversation, include the phone number involved and the workspace or business context so we can locate the correct records.",
                ),
            ),
            LegalSection(
                title="What to include",
                bullets=(
                    "Your full name and the phone number or email connected to the record.",
                    "Your workspace name, FBO ID, or other account identifier if available.",
                    "Whether you want account deletion, lead-data deletion, messaging-history deletion, or all applicable records removed.",
                    "Any relevant date range or screenshots that help us identify the record accurately.",
                ),
            ),
            LegalSection(
                title="What happens next",
                paragraphs=(
                    "After verification, we will review the request and delete or anonymize eligible personal data from active systems within a reasonable period, usually within 30 days.",
                    "If some data cannot be removed immediately because of security logs, fraud prevention, billing records, dispute handling, or legal obligations, we will retain only what is necessary for those purposes.",
                ),
            ),
            LegalSection(
                title="Workspace-admin requests",
                paragraphs=(
                    "If you are a workspace admin requesting deletion for a user, lead, or imported contact list, please identify the affected records clearly and confirm that you are authorized to make the request.",
                ),
            ),
            LegalSection(
                title="Need help",
                paragraphs=(
                    f"If you need help submitting or following up on a deletion request, contact {_CONTACT_EMAIL}.",
                ),
            ),
        ),
    ),
}


def _render_doc(doc: LegalDocument) -> str:
    nav_links = []
    for item in _DOCS.values():
        state = "page" if item.key == doc.key else "false"
        nav_links.append(
            (
                f'<a class="nav-link{" is-active" if item.key == doc.key else ""}" '
                f'href="{escape(item.path)}" aria-current="{state}">{escape(item.label)}</a>'
            )
        )

    sections_html: list[str] = []
    for section in doc.sections:
        parts = [f"<section><h2>{escape(section.title)}</h2>"]
        parts.extend(f"<p>{escape(paragraph)}</p>" for paragraph in section.paragraphs)
        if section.bullets:
            bullets = "".join(f"<li>{escape(item)}</li>" for item in section.bullets)
            parts.append(f"<ul>{bullets}</ul>")
        parts.append("</section>")
        sections_html.append("".join(parts))

    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{escape(doc.title)}</title>
    <meta name="description" content="{escape(doc.summary)}" />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="{escape(_BASE_URL + doc.path)}" />
    <style>
      :root {{
        color-scheme: dark;
        --bg: #050816;
        --panel: rgba(8, 13, 29, 0.82);
        --panel-border: rgba(138, 153, 196, 0.18);
        --text: #f3f6ff;
        --muted: #a9b4d0;
        --accent: #6ea8ff;
        --accent-strong: #8ec5ff;
      }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        min-height: 100vh;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(76, 114, 255, 0.24), transparent 32%),
          radial-gradient(circle at bottom right, rgba(67, 168, 255, 0.18), transparent 28%),
          linear-gradient(180deg, #06101f 0%, var(--bg) 100%);
        color: var(--text);
      }}
      main {{
        width: min(920px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }}
      .hero {{
        margin-bottom: 18px;
        padding: 28px;
        border: 1px solid var(--panel-border);
        border-radius: 24px;
        background: linear-gradient(180deg, rgba(13, 22, 47, 0.92), rgba(7, 11, 25, 0.88));
        box-shadow: 0 20px 80px rgba(0, 0, 0, 0.28);
      }}
      .eyebrow {{
        margin: 0 0 10px;
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent-strong);
      }}
      h1 {{
        margin: 0;
        font-size: clamp(2rem, 4vw, 3rem);
        line-height: 1.05;
      }}
      .summary {{
        margin: 14px 0 0;
        max-width: 64ch;
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.7;
      }}
      .meta {{
        margin-top: 18px;
        color: var(--muted);
        font-size: 0.95rem;
      }}
      .nav {{
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 0 0 18px;
      }}
      .nav-link {{
        display: inline-flex;
        align-items: center;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(136, 153, 204, 0.2);
        color: var(--muted);
        text-decoration: none;
        background: rgba(8, 13, 29, 0.56);
      }}
      .nav-link.is-active {{
        color: var(--text);
        border-color: rgba(142, 197, 255, 0.38);
        background: rgba(70, 118, 255, 0.18);
      }}
      article {{
        padding: 28px;
        border: 1px solid var(--panel-border);
        border-radius: 24px;
        background: var(--panel);
        backdrop-filter: blur(16px);
      }}
      section + section {{
        margin-top: 24px;
        padding-top: 24px;
        border-top: 1px solid rgba(138, 153, 196, 0.12);
      }}
      h2 {{
        margin: 0 0 10px;
        font-size: 1.15rem;
      }}
      p, li {{
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.72;
      }}
      p {{
        margin: 0;
      }}
      p + p {{
        margin-top: 12px;
      }}
      ul {{
        margin: 12px 0 0;
        padding-left: 1.25rem;
      }}
      li + li {{
        margin-top: 8px;
      }}
      footer {{
        margin-top: 18px;
        padding: 18px 22px;
        border: 1px solid var(--panel-border);
        border-radius: 20px;
        background: rgba(8, 13, 29, 0.66);
        color: var(--muted);
      }}
      footer a {{
        color: var(--accent-strong);
      }}
      @media (max-width: 640px) {{
        main {{
          width: min(100% - 20px, 920px);
          padding-top: 20px;
          padding-bottom: 28px;
        }}
        .hero, article {{
          padding: 20px;
          border-radius: 20px;
        }}
      }}
    </style>
  </head>
  <body>
    <main>
      <div class="hero">
        <p class="eyebrow">{escape(_APP_NAME)} public legal document</p>
        <h1>{escape(doc.title)}</h1>
        <p class="summary">{escape(doc.summary)}</p>
        <p class="meta">Last updated: {escape(_UPDATED_AT)} | Contact: <a href="mailto:{escape(_CONTACT_EMAIL)}">{escape(_CONTACT_EMAIL)}</a></p>
      </div>
      <nav class="nav" aria-label="Legal pages">
        {"".join(nav_links)}
      </nav>
      <article>
        {"".join(sections_html)}
      </article>
      <footer>
        These pages are intended to stay publicly accessible for app users, reviewers, and integration partners.
        For account, privacy, or data-deletion requests, email
        <a href="mailto:{escape(_CONTACT_EMAIL)}">{escape(_CONTACT_EMAIL)}</a>.
      </footer>
    </main>
  </body>
</html>
"""


def _doc_response(key: str) -> HTMLResponse:
    return HTMLResponse(
        content=_render_doc(_DOCS[key]),
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@router.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
async def privacy_policy() -> HTMLResponse:
    return _doc_response("privacy")


@router.get("/privacy-policy", response_class=HTMLResponse, include_in_schema=False)
async def privacy_policy_alias() -> HTMLResponse:
    return _doc_response("privacy")


@router.get("/terms", response_class=HTMLResponse, include_in_schema=False)
async def terms_of_service() -> HTMLResponse:
    return _doc_response("terms")


@router.get("/terms-of-service", response_class=HTMLResponse, include_in_schema=False)
async def terms_of_service_alias() -> HTMLResponse:
    return _doc_response("terms")


@router.get("/data-deletion", response_class=HTMLResponse, include_in_schema=False)
async def data_deletion() -> HTMLResponse:
    return _doc_response("data-deletion")


@router.get("/user-data-deletion", response_class=HTMLResponse, include_in_schema=False)
async def data_deletion_alias() -> HTMLResponse:
    return _doc_response("data-deletion")
