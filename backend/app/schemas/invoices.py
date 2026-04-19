from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class InvoiceListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    invoice_number: str
    doc_type: str
    user_id: int
    member_name: str = ""
    member_username: Optional[str] = None
    total_cents: int
    currency: str
    issued_at: datetime


class InvoiceListResponse(BaseModel):
    items: list[InvoiceListItem]
    total: int
    limit: int
    offset: int


class InvoiceBulkDownloadBody(BaseModel):
    date_from: Optional[str] = Field(default=None, description="ISO date YYYY-MM-DD (IST day start)")
    date_to: Optional[str] = Field(default=None, description="ISO date YYYY-MM-DD (IST day end)")
    doc_type: Optional[str] = Field(default="all")
    username: Optional[str] = Field(default=None, description="Exact or partial username match; empty = all")
