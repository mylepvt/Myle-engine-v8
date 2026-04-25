"""Enhanced settings API endpoints with user profile and system configuration."""

from __future__ import annotations

from typing import Annotated, Dict

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from starlette import status as http_status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.user import User
from app.services.avatar_storage import save_user_avatar_file
from app.schemas.settings import (
    UserProfileResponse,
    UserProfileUpdateRequest,
    UserPreferencesResponse,
    UserPreferencesUpdateRequest,
    SystemConfigurationResponse,
    SystemConfigurationUpdateRequest,
    AppSettingsResponse,
    AppSettingUpdateRequest,
    EnrollmentVideoUploadResponse,
    SystemUsersSummaryResponse,
    AuditLogResponse,
)
from app.services.enrollment_video_uploads import (
    cleanup_replaced_managed_enrollment_video,
    remove_managed_enrollment_video_file,
    save_enrollment_video_file,
)
from app.services.enrollment_video import normalize_video_source_url
from app.services.settings_service import SettingsService

router = APIRouter()


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/profile", response_model=UserProfileResponse)
async def get_user_profile(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> UserProfileResponse:
    """Get current user's profile."""
    service = SettingsService(session)
    try:
        profile = await service.get_user_profile(user.user_id)
        if not profile:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail="User profile not found",
            )
        return UserProfileResponse(**profile)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get user profile: {str(e)}",
        )


@router.patch("/profile", response_model=Dict[str, str])
async def update_user_profile(
    request: UserProfileUpdateRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Dict[str, str]:
    """Update current user's profile."""
    service = SettingsService(session)
    try:
        success, message = await service.update_user_profile(
            user.user_id, request.model_dump(exclude_unset=True), user.user_id
        )
        if not success:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=message,
            )
        return {"message": message}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update user profile: {str(e)}",
        )


class AvatarBase64Request(BaseModel):
    data_url: str  # "data:image/jpeg;base64,..."


@router.post("/profile/avatar", response_model=Dict[str, str])
async def upload_profile_avatar(
    body: AvatarBase64Request,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Dict[str, str]:
    """Set profile picture from a base64 data URL (stored in DB — no disk required)."""
    data_url = body.data_url.strip()
    # Basic validation
    if not data_url.startswith("data:image/"):
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid image data.")
    # Max ~300 KB base64 (~225 KB raw) — covers 200x200 JPEG generously
    if len(data_url) > 400_000:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Image too large (max ~300 KB).")
    u = await session.get(User, user.user_id)
    if u is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")
    u.avatar_url = data_url
    await session.commit()
    return {"avatar_url": data_url, "message": "Profile photo updated"}


@router.get("/preferences", response_model=UserPreferencesResponse)
async def get_user_preferences(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> UserPreferencesResponse:
    """Get current user's notification preferences."""
    service = SettingsService(session)
    try:
        preferences = await service.get_user_preferences(user.user_id)
        return UserPreferencesResponse(**preferences)
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get user preferences: {str(e)}",
        )


@router.patch("/preferences", response_model=Dict[str, str])
async def update_user_preferences(
    request: UserPreferencesUpdateRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Dict[str, str]:
    """Update current user's notification preferences."""
    service = SettingsService(session)
    try:
        success, message = await service.update_user_preferences(
            user.user_id, request.model_dump(exclude_unset=True)
        )
        if not success:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=message,
            )
        return {"message": message}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update user preferences: {str(e)}",
        )


@router.get("/system/configuration", response_model=SystemConfigurationResponse)
async def get_system_configuration(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemConfigurationResponse:
    """Get system configuration (admin only)."""
    _require_admin(user)
    
    service = SettingsService(session)
    try:
        config = await service.get_system_configuration()
        return SystemConfigurationResponse(**config)
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get system configuration: {str(e)}",
        )


@router.patch("/system/configuration", response_model=Dict[str, str])
async def update_system_configuration(
    request: SystemConfigurationUpdateRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Dict[str, str]:
    """Update system configuration (admin only)."""
    _require_admin(user)
    
    service = SettingsService(session)
    try:
        success, message = await service.update_system_configuration(
            request.model_dump(exclude_unset=True), user.user_id
        )
        if not success:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=message,
            )
        return {"message": message}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update system configuration: {str(e)}",
        )


@router.get("/system/app-settings", response_model=AppSettingsResponse)
async def get_app_settings(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AppSettingsResponse:
    """Get all application settings (admin only)."""
    _require_admin(user)
    
    service = SettingsService(session)
    try:
        settings = await service.get_app_settings()
        return AppSettingsResponse(settings=settings)
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get app settings: {str(e)}",
        )


@router.post("/system/app-settings", response_model=Dict[str, str])
async def create_or_update_app_setting(
    request: AppSettingUpdateRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Dict[str, str]:
    """Create or update an application setting (admin only)."""
    _require_admin(user)
    
    service = SettingsService(session)
    try:
        previous_source = None
        value = request.value
        if request.key == "enrollment_video_source_url":
            previous_source = await service.get_app_setting("enrollment_video_source_url")
            value = normalize_video_source_url(request.value)
        success, message = await service.update_app_setting(
            request.key, value, user.user_id
        )
        if not success:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=message,
            )
        if request.key == "enrollment_video_source_url":
            cleanup_replaced_managed_enrollment_video(previous_source, value)
        return {"message": message}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update app setting: {str(e)}",
        )


@router.post("/system/app-settings/enrollment-video/upload", response_model=EnrollmentVideoUploadResponse)
async def upload_enrollment_video(
    file: Annotated[UploadFile, File()],
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollmentVideoUploadResponse:
    """Upload enrollment video into backend/uploads and update the app setting automatically."""
    _require_admin(user)

    service = SettingsService(session)
    previous_source = await service.get_app_setting("enrollment_video_source_url")

    ok, message, source_url = await save_enrollment_video_file(file)
    if not ok or not source_url:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=message)

    success, update_message = await service.update_app_setting(
        "enrollment_video_source_url",
        source_url,
        user.user_id,
    )
    if not success:
        remove_managed_enrollment_video_file(source_url)
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=update_message)

    cleanup_replaced_managed_enrollment_video(previous_source, source_url)

    return EnrollmentVideoUploadResponse(
        source_url=source_url,
        file_name=source_url.rsplit("/", 1)[-1],
        message=message,
    )


@router.delete("/system/app-settings/{key}", response_model=Dict[str, str])
async def delete_app_setting(
    key: str,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Dict[str, str]:
    """Delete an application setting (admin only)."""
    _require_admin(user)
    
    service = SettingsService(session)
    try:
        success, message = await service.delete_app_setting(key)
        if not success:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=message,
            )
        return {"message": message}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete app setting: {str(e)}",
        )


@router.get("/system/users-summary", response_model=SystemUsersSummaryResponse)
async def get_system_users_summary(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemUsersSummaryResponse:
    """Get system-wide user summary (admin only)."""
    _require_admin(user)
    
    service = SettingsService(session)
    try:
        summary = await service.get_system_users_summary()
        return SystemUsersSummaryResponse(**summary)
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get users summary: {str(e)}",
        )


@router.get("/system/audit-log", response_model=AuditLogResponse)
async def get_audit_log(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> AuditLogResponse:
    """Get system audit log (admin only)."""
    _require_admin(user)
    
    service = SettingsService(session)
    try:
        audit_log = await service.get_audit_log(limit, offset)
        return AuditLogResponse(
            entries=audit_log,
            total=len(audit_log),
            limit=limit,
            offset=offset,
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get audit log: {str(e)}",
        )


@router.post("/users/{user_id}/profile", response_model=Dict[str, str])
async def update_user_profile_by_admin(
    user_id: int,
    request: UserProfileUpdateRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Dict[str, str]:
    """Update user profile by admin."""
    _require_admin(user)
    
    service = SettingsService(session)
    try:
        success, message = await service.update_user_profile(
            user_id, request.model_dump(exclude_unset=True), user.user_id
        )
        if not success:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=message,
            )
        return {"message": message}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update user profile: {str(e)}",
        )


@router.get("/users/{user_id}/profile", response_model=UserProfileResponse)
async def get_user_profile_by_admin(
    user_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> UserProfileResponse:
    """Get user profile by admin."""
    _require_admin(user)
    
    service = SettingsService(session)
    try:
        profile = await service.get_user_profile(user_id)
        if not profile:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )
        return UserProfileResponse(**profile)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get user profile: {str(e)}",
        )
