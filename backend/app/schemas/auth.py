from typing import Optional

from pydantic import BaseModel, Field

from app.constants.roles import Role


class MeResponse(BaseModel):
    """Current session — populated from cookie JWT when present."""

    authenticated: bool = False
    role: Optional[str] = Field(
        default=None,
        description="admin | leader | team when authenticated",
    )
    user_id: Optional[int] = Field(default=None, description="DB user id when JWT sub is numeric")
    fbo_id: Optional[str] = Field(
        default=None,
        description="Unique FBO ID (primary directory / login identifier)",
    )
    username: Optional[str] = Field(default=None, description="Optional display handle when present")
    email: Optional[str] = Field(default=None, description="User email from JWT when present")
    display_name: Optional[str] = Field(
        default=None,
        description="Display label (legacy session display_name / users.name); derived from username or email local-part",
    )
    auth_version: Optional[int] = Field(
        default=None,
        description="JWT claim ver — same idea as legacy AUTH_SESSION_VERSION",
    )


class DevLoginRequest(BaseModel):
    role: Role


class LoginRequest(BaseModel):
    """Password login: **FBO ID or username** (legacy ``/login``) + password."""

    fbo_id: str = Field(
        min_length=1,
        max_length=128,
        description="FBO ID (normalized) or exact username, same as legacy first field",
    )
    password: str = Field(min_length=1, max_length=512)


class DevLoginResponse(BaseModel):
    ok: bool = True
