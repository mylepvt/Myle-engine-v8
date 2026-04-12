from __future__ import annotations

from sqlalchemy import Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TrainingQuestion(Base):
    __tablename__ = "training_questions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    option_a: Mapped[str] = mapped_column(String(500), nullable=False)
    option_b: Mapped[str] = mapped_column(String(500), nullable=False)
    option_c: Mapped[str] = mapped_column(String(500), nullable=False)
    option_d: Mapped[str] = mapped_column(String(500), nullable=False)
    correct_answer: Mapped[str] = mapped_column(String(1), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"), default=0)
