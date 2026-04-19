"""Integer INR amount → English words (Indian grouping)."""

from __future__ import annotations

_ONES = (
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
)
_TENS = ("", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety")


def _under_hundred(n: int) -> str:
    if n < 20:
        return _ONES[n]
    t, o = n // 10, n % 10
    if o == 0:
        return _TENS[t]
    return f"{_TENS[t]} {_ONES[o]}"


def _under_thousand(n: int) -> str:
    if n < 100:
        return _under_hundred(n)
    h, r = n // 100, n % 100
    parts = [f"{_ONES[h]} Hundred"]
    if r:
        parts.append(_under_hundred(r))
    return " ".join(parts)


def rupees_int_to_words(n: int) -> str:
    if n < 0:
        n = -n
    if n == 0:
        return "Zero Rupees Only"
    parts: list[str] = []
    crore = n // 10_000_000
    n %= 10_000_000
    lakh = n // 100_000
    n %= 100_000
    thousand = n // 1000
    n %= 1000
    if crore:
        parts.append(f"{_under_hundred(crore)} Crore")
    if lakh:
        parts.append(f"{_under_hundred(lakh)} Lakh")
    if thousand:
        parts.append(f"{_under_thousand(thousand)} Thousand")
    if n:
        parts.append(_under_thousand(n))
    body = " ".join(p for p in parts if p).strip()
    return f"{body} Rupees Only"
