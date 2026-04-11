from pydantic import BaseModel, Field


class ClientFeatures(BaseModel):
    """Feature toggles the SPA should read once and cache (single source vs hardcoded UI)."""

    intelligence: bool = Field(
        default=True,
        description="When false, hide Work → Intelligence nav. Not a third-party AI integration flag.",
    )


class MetaResponse(BaseModel):
    name: str
    api_version: int
    environment: str = Field(description="From APP_ENV — for badges, support, client logging.")
    auth_dev_login_enabled: bool = Field(
        description="When true, SPA may show dev quick-login UI; production should be false.",
    )
    features: ClientFeatures
