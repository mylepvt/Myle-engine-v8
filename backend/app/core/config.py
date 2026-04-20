from pathlib import Path
from typing import Literal, Optional

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _normalize_database_url(url: str) -> str:
    """Normalize DSN for ``create_async_engine`` — must use an async driver (``asyncpg``)."""
    if url.startswith("postgresql+asyncpg://"):
        return url
    # Docs / copy-paste often use sync drivers; async engine cannot use psycopg2.
    if url.startswith("postgresql+psycopg2://"):
        return "postgresql+asyncpg://" + url[len("postgresql+psycopg2://") :]
    if url.startswith("postgresql+psycopg://"):
        return "postgresql+asyncpg://" + url[len("postgresql+psycopg://") :]
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = (
        "postgresql+asyncpg://myle:myle@localhost:5432/myle"
    )
    backend_cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173"
    )
    secret_key: str = Field(
        default="myle-vl2-dev-secret-change-with-SECRET_KEY-env",
        validation_alias=AliasChoices("SECRET_KEY", "NEW_SECRET"),
        description="JWT signing + future session crypto (Render: prefer SECRET_KEY; NEW_SECRET accepted)",
    )
    auth_dev_login_enabled: bool = Field(
        default=False,
        validation_alias="AUTH_DEV_LOGIN_ENABLED",
    )
    session_cookie_secure: bool = Field(
        default=False,
        validation_alias=AliasChoices("SESSION_COOKIE_SECURE", "session_cookie_secure"),
    )
    auth_cookie_samesite: Literal["lax", "strict", "none"] = Field(
        default="lax",
        validation_alias=AliasChoices("AUTH_COOKIE_SAMESITE", "auth_cookie_samesite"),
        description="JWT cookie SameSite. Use ``none`` when the SPA and API are on different sites (requires Secure).",
    )
    jwt_access_minutes: int = Field(
        default=480,
        validation_alias="JWT_ACCESS_MINUTES",
        description="Access JWT lifetime (minutes).",
    )
    jwt_refresh_days: int = Field(
        default=14,
        validation_alias="JWT_REFRESH_DAYS",
        description="Refresh JWT lifetime (days).",
    )
    jwt_refresh_days_remember: int = Field(
        default=60,
        validation_alias="JWT_REFRESH_DAYS_REMEMBER",
        description="Refresh JWT lifetime when “remember me” is checked (days).",
    )
    auth_login_rate_limit_per_minute: int = Field(
        default=30,
        validation_alias="AUTH_LOGIN_RATE_LIMIT_PER_MINUTE",
        description="Max POSTs per client IP per minute on auth login paths; 0 disables.",
    )
    app_environment: str = Field(
        default="development",
        validation_alias="APP_ENV",
        description="Label for clients (development | staging | production).",
    )
    frontend_dist: Optional[str] = Field(
        default=None,
        validation_alias="FRONTEND_DIST",
        description="If set to a directory containing index.html, serve the Vite SPA from the API (same-origin auth).",
    )
    upload_dir: str = Field(
        default_factory=lambda: str(
            (Path(__file__).resolve().parents[2] / "data" / "uploads")
        ),
        validation_alias="MYLE_UPLOAD_DIR",
        description="Local directory for user uploads (e.g. profile photos).",
    )
    recharge_upi_id: str = Field(
        default="",
        validation_alias="RECHARGE_UPI_ID",
        description="UPI ID shown to team/leader for wallet recharge transfers.",
    )
    recharge_qr_image_url: str = Field(
        default="",
        validation_alias="RECHARGE_QR_IMAGE_URL",
        description="Public QR image URL shown on wallet recharge page.",
    )

    # --- Call-to-close (CTCS) ---
    ctcs_whatsapp_webhook_url: str = Field(
        default="",
        validation_alias="CTCS_WHATSAPP_WEBHOOK_URL",
        description="If set, POST JSON on CTCS “interested” (worker / BSP / n8n). Empty = log-only stub.",
    )
    ctcs_whatsapp_webhook_secret: str = Field(
        default="",
        validation_alias="CTCS_WHATSAPP_WEBHOOK_SECRET",
        description="Optional Bearer token for CTCS WhatsApp webhook.",
    )
    ctcs_whatsapp_template: str = Field(
        default="enrollment_video_v1",
        validation_alias="CTCS_WHATSAPP_TEMPLATE",
        description="Template id/name included in webhook payload for downstream routing.",
    )
    ctcs_whatsapp_timeout_seconds: float = Field(
        default=10.0,
        ge=1.0,
        le=120.0,
        validation_alias="CTCS_WHATSAPP_TIMEOUT_SECONDS",
    )
    ctcs_whatsapp_async: bool = Field(
        default=True,
        validation_alias="CTCS_WHATSAPP_ASYNC",
        description="When true, CTCS “interested” WhatsApp/webhook runs after HTTP response (BackgroundTasks). When false, await inline (debug / scripts).",
    )
    ctcs_heat_hot_threshold: int = Field(
        default=40,
        ge=0,
        le=100,
        validation_alias="CTCS_HEAT_HOT_THRESHOLD",
        description="Minimum heat_score for GET /leads?ctcs_filter=hot",
    )
    ctcs_heat_decay_points: int = Field(
        default=3,
        ge=0,
        le=50,
        validation_alias="CTCS_HEAT_DECAY_POINTS",
    )
    ctcs_heat_decay_interval_hours: int = Field(
        default=24,
        ge=1,
        le=168,
        validation_alias="CTCS_HEAT_DECAY_INTERVAL_HOURS",
    )
    ctcs_heat_interested_bonus: int = Field(
        default=20,
        ge=0,
        le=100,
        validation_alias="CTCS_HEAT_INTERESTED_BONUS",
    )
    ctcs_heat_not_picked_penalty: int = Field(
        default=5,
        ge=0,
        le=100,
        validation_alias="CTCS_HEAT_NOT_PICKED_PENALTY",
    )
    ctcs_heat_paid_bonus: int = Field(
        default=25,
        ge=0,
        le=100,
        validation_alias="CTCS_HEAT_PAID_BONUS",
    )

    # --- CRM microservice ---
    crm_api_url: str = Field(
        default="http://localhost:4000",
        validation_alias="CRM_API_URL",
        description="Base URL of the CRM Fastify microservice (e.g. http://crm-api:4000 in Docker).",
    )
    crm_internal_secret: str = Field(
        default="",
        validation_alias="CRM_INTERNAL_SECRET",
        description="Shared secret for CRM internal endpoints (x-internal-secret header).",
    )

    @field_validator("database_url", mode="before")
    @classmethod
    def coerce_database_url(cls, v: object) -> object:
        if isinstance(v, str):
            return _normalize_database_url(v)
        return v

    @model_validator(mode="after")
    def none_samesite_requires_secure(self) -> "Settings":
        if self.auth_cookie_samesite == "none" and not self.session_cookie_secure:
            raise ValueError(
                "AUTH_COOKIE_SAMESITE=none requires SESSION_COOKIE_SECURE=true",
            )
        return self

    @property
    def database_url_sync(self) -> str:
        if "+asyncpg" in self.database_url:
            return self.database_url.replace("+asyncpg", "+psycopg2", 1)
        return self.database_url

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.backend_cors_origins.split(",") if o.strip()]

settings = Settings()
