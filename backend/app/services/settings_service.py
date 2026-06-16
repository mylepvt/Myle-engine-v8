"""Enhanced system settings and configuration business logic services."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting
from app.models.user import User


class SettingsService:
    """Enhanced settings operations with business logic."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_app_settings(self) -> Dict[str, str]:
        """Get all application settings as key-value dictionary."""
        result = await self.session.execute(select(AppSetting.key, AppSetting.value))
        settings = result.all()
        return {key: value or "" for key, value in settings}

    async def get_app_setting(self, key: str) -> Optional[str]:
        """Get a specific application setting by key."""
        result = await self.session.execute(
            select(AppSetting.value).where(AppSetting.key == key)
        )
        value = result.scalar_one_or_none()
        return value

    async def update_app_setting(
        self, key: str, value: str, updated_by_user_id: int
    ) -> Tuple[bool, str]:
        """Update or create an application setting."""
        # Validate key and value
        if not key or len(key.strip()) == 0:
            return False, "Setting key cannot be empty"
        
        if len(key) > 128:
            return False, "Setting key too long (max 128 characters)"
        
        # Check if setting exists
        existing = await self.session.execute(
            select(AppSetting).where(AppSetting.key == key)
        )
        setting = existing.scalar_one_or_none()
        
        if setting:
            setting.value = value
        else:
            setting = AppSetting(key=key, value=value)
            self.session.add(setting)
        
        try:
            await self.session.commit()
            return True, "Setting updated successfully"
        except Exception as e:
            await self.session.rollback()
            return False, f"Failed to update setting: {str(e)}"

    async def delete_app_setting(self, key: str) -> Tuple[bool, str]:
        """Delete an application setting."""
        existing = await self.session.execute(
            select(AppSetting).where(AppSetting.key == key)
        )
        setting = existing.scalar_one_or_none()
        
        if not setting:
            return False, "Setting not found"
        
        await self.session.delete(setting)
        try:
            await self.session.commit()
            return True, "Setting deleted successfully"
        except Exception as e:
            await self.session.rollback()
            return False, f"Failed to delete setting: {str(e)}"

    async def get_user_profile(self, user_id: int) -> Optional[Dict]:
        """Get comprehensive user profile."""
        user = await self.session.get(User, user_id)
        if not user:
            return None
        
        return {
            "id": user.id,
            "fbo_id": user.fbo_id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "phone": user.phone,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "upline_user_id": user.upline_user_id,
            "registration_status": user.registration_status,
            "training_required": user.training_required,
            "training_status": user.training_status,
            "access_blocked": user.access_blocked,
            "discipline_status": user.discipline_status,
            "joining_date": user.joining_date.isoformat() if user.joining_date else None,
            "created_at": user.created_at.isoformat(),
        }

    async def update_user_profile(
        self, user_id: int, updates: dict[str, any], updated_by_user_id: int
    ) -> Tuple[bool, str]:
        """Update user profile with validation."""
        user = await self.session.get(User, user_id)
        if not user:
            return False, "User not found"
        
        # Track what fields are being updated
        updated_fields = []
        
        # Update allowed fields
        allowed_fields = [
            "username", "phone", "name", "registration_status",
            "training_required", "training_status", "access_blocked",
            "discipline_status", "joining_date", "upline_user_id"
        ]
        
        for field, value in updates.items():
            if field not in allowed_fields:
                continue
            
            # Validate field-specific rules
            if field == "username" and value:
                # Check username uniqueness
                existing = await self.session.execute(
                    select(User).where(
                        User.username == value,
                        User.id != user_id
                    )
                )
                if existing.scalar_one_or_none():
                    return False, "Username already taken"
            
            if field == "phone" and value:
                # Check phone uniqueness
                existing = await self.session.execute(
                    select(User).where(
                        User.phone == value,
                        User.id != user_id
                    )
                )
                if existing.scalar_one_or_none():
                    return False, "Phone number already registered"
            
            if field == "email" and value:
                # Email should not be updatable here (separate flow)
                continue
            
            if field == "role":
                # Role changes should be handled separately with proper authorization
                continue
            
            # Update the field
            setattr(user, field, value)
            updated_fields.append(field)
        
        if not updated_fields:
            return False, "No valid fields to update"
        
        try:
            await self.session.commit()
            return True, f"Profile updated: {', '.join(updated_fields)}"
        except Exception as e:
            await self.session.rollback()
            return False, f"Failed to update profile: {str(e)}"

    async def get_system_users_summary(self) -> Dict:
        """Get system-wide user summary for admin."""
        total_users = await self.session.execute(select(func.count(User.id)))
        total_count = total_users.scalar() or 0
        
        # Users by role
        role_counts = await self.session.execute(
            select(User.role, func.count(User.id))
            .group_by(User.role)
        )
        roles = {role: count for role, count in role_counts.all()}
        
        # Users by status
        status_counts = await self.session.execute(
            select(User.registration_status, func.count(User.id))
            .group_by(User.registration_status)
        )
        statuses = {status: count for status, count in status_counts.all()}
        
        # Blocked users
        blocked_count = await self.session.execute(
            select(func.count(User.id)).where(User.access_blocked == True)
        )
        blocked = blocked_count.scalar() or 0
        
        # Training status
        training_counts = await self.session.execute(
            select(User.training_status, func.count(User.id))
            .group_by(User.training_status)
        )
        training = {status: count for status, count in training_counts.all()}
        
        return {
            "total_users": total_count,
            "by_role": roles,
            "by_status": statuses,
            "blocked_users": blocked,
            "by_training_status": training,
        }

    async def get_user_preferences(self, user_id: int) -> Dict:
        """Get user notification preferences and settings — reads from User columns."""
        user = await self.session.get(User, user_id)
        if user is None:
            return {}
        return {
            "email_notifications": True,
            "push_notifications": bool(user.push_notifications_enabled),
            "whatsapp_notifications": bool(user.whatsapp_notifications_enabled),
            "daily_report_reminders": bool(user.daily_report_reminders_enabled),
            "lead_assignment_alerts": bool(user.lead_assignment_alerts_enabled),
            "weekly_summary": bool(user.weekly_summary_enabled),
            "payment_notifications": True,
            "training_reminders": True,
            "language": "en",
            "timezone": "UTC",
            "theme": "light",
        }

    async def update_user_preferences(
        self, user_id: int, preferences: dict[str, any]
    ) -> Tuple[bool, str]:
        """Update user notification preferences — persists to User columns."""
        user = await self.session.get(User, user_id)
        if user is None:
            return False, "User not found"

        # Keys mapped to User columns
        column_map = {
            "push_notifications": "push_notifications_enabled",
            "whatsapp_notifications": "whatsapp_notifications_enabled",
            "daily_report_reminders": "daily_report_reminders_enabled",
            "lead_assignment_alerts": "lead_assignment_alerts_enabled",
            "weekly_summary": "weekly_summary_enabled",
        }
        # Known keys without persistent storage yet
        _accepted_ignored_keys = {
            "email_notifications", "payment_notifications",
            "training_reminders", "language", "timezone", "theme",
        }

        all_valid = set(column_map.keys()) | _accepted_ignored_keys
        for key in preferences:
            if key not in all_valid:
                return False, f"Invalid preference key: {key}"

        updated = []
        for pref_key, col_name in column_map.items():
            if pref_key in preferences:
                value = preferences[pref_key]
                if not isinstance(value, bool):
                    return False, f"Preference {pref_key} must be boolean"
                setattr(user, col_name, value)
                updated.append(pref_key)

        if not updated:
            return True, "No changes needed"

        try:
            await self.session.commit()
            return True, f"Preferences updated: {', '.join(updated)}"
        except Exception as e:
            await self.session.rollback()
            return False, f"Failed to update preferences: {str(e)}"

    async def get_system_configuration(self) -> Dict:
        """Get system configuration and defaults."""
        app_settings = await self.get_app_settings()
        
        return {
            "app_settings": app_settings,
            "system_defaults": {
                "default_role": "team",
                "require_training": False,
                "auto_approve_registrations": True,
                "default_language": "en",
                "default_timezone": "UTC",
                "session_timeout": 3600,  # 1 hour
                "max_upload_size": 10485760,  # 10MB
                "supported_languages": ["en", "hi", "bn", "te", "ta"],
                "supported_timezones": [
                    "UTC", "Asia/Kolkata", "Asia/Dhaka", "Asia/Karachi",
                    "Asia/Rangoon", "Asia/Bangkok", "Asia/Jakarta"
                ],
            },
            "feature_flags": {
                "enable_wallet": app_settings.get("enable_wallet", "true").lower() == "true",
                "enable_training": app_settings.get("enable_training", "true").lower() == "true",
                "enable_reports": app_settings.get("enable_reports", "true").lower() == "true",
                "enable_analytics": app_settings.get("enable_analytics", "true").lower() == "true",
                "enable_notifications": app_settings.get("enable_notifications", "true").lower() == "true",
            },
        }

    async def update_system_configuration(
        self, updates: dict[str, any], updated_by_user_id: int
    ) -> Tuple[bool, str]:
        """Update system configuration."""
        updated_keys = []
        
        for key, value in updates.items():
            success, message = await self.update_app_setting(key, str(value), updated_by_user_id)
            if success:
                updated_keys.append(key)
            else:
                return False, f"Failed to update {key}: {message}"
        
        return True, f"Configuration updated: {', '.join(updated_keys)}"

    async def validate_user_hierarchy(self, user_id: int, upline_user_id: int) -> Tuple[bool, str]:
        """Validate user hierarchy to prevent cycles."""
        if user_id == upline_user_id:
            return False, "User cannot be their own upline"
        
        # Check if this would create a cycle
        current_upline = upline_user_id
        visited = set()
        
        while current_upline and current_upline not in visited:
            visited.add(current_upline)
            
            if current_upline == user_id:
                return False, "This would create a circular hierarchy"
            
            # Get the upline of current user
            upline_user = await self.session.get(User, current_upline)
            current_upline = upline_user.upline_user_id if upline_user else None
        
        return True, "Hierarchy valid"

    async def get_audit_log(self, limit: int = 100, offset: int = 0) -> List[Dict]:
        """Get system audit log (placeholder for future implementation)."""
        # This would typically query an audit_log table
        # For now, return empty list
        return []
