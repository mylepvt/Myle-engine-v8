from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TrainingCampaign(Base):
    __tablename__ = "training_campaigns"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    webinar_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=func.text("true"), default=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    missions: Mapped[list["CampaignMission"]] = relationship(
        back_populates="campaign", cascade="all, delete-orphan"
    )
    enrollments: Mapped[list["CampaignEnrollment"]] = relationship(
        back_populates="campaign", cascade="all, delete-orphan"
    )


class CampaignMission(Base):
    __tablename__ = "campaign_missions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("training_campaigns.id", ondelete="CASCADE"), nullable=False
    )
    item_key: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    target: Mapped[int] = mapped_column(Integer, nullable=False, server_default=func.text("1"), default=1)
    verification_required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=func.text("false"), default=False
    )
    evidence_instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=func.text("0"), default=0
    )

    campaign: Mapped["TrainingCampaign"] = relationship(back_populates="missions")


class CampaignEnrollment(Base):
    __tablename__ = "campaign_enrollments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("training_campaigns.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=func.text("'enrolled'"), default="enrolled"
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    campaign: Mapped["TrainingCampaign"] = relationship(back_populates="enrollments")
    user: Mapped["User"] = relationship()  # type: ignore[name-defined]
    progress: Mapped[list["CampaignMemberProgress"]] = relationship(
        back_populates="enrollment", cascade="all, delete-orphan"
    )


class CampaignMemberProgress(Base):
    __tablename__ = "campaign_member_progress"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    enrollment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("campaign_enrollments.id", ondelete="CASCADE"), nullable=False
    )
    campaign_mission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("campaign_missions.id", ondelete="CASCADE"), nullable=False
    )
    achieved: Mapped[int] = mapped_column(Integer, nullable=False, server_default=func.text("0"), default=0)
    evidence: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=func.text("'pending'"), default="pending"
    )
    verified_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    enrollment: Mapped["CampaignEnrollment"] = relationship(back_populates="progress")
