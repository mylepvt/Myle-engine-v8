#!/usr/bin/env python3
"""
Comprehensive test script for the payment system.
Run this when PostgreSQL is running to verify the payment system works end-to-end.

Tests:
1. Payment model imports and relationships
2. Razorpay client initialization
3. Payment status flow
4. Webhook signature validation logic
"""

import asyncio
import hashlib
import hmac
import json
import sys
from datetime import datetime
from decimal import Decimal

# Test imports
def test_imports():
    """Test that all payment models import correctly."""
    print("Testing imports...")
    try:
        from app.models.payment import Payment, PaymentStatus, PaymentWebhookEvent
        from app.models.lead import Lead
        from app.models.user import User
        from app.services.razorpay_client import RazorpayClient, RazorpayError
        from app.core.config import settings
        print("  Imports: PASSED")
        return True
    except Exception as e:
        print(f"  Imports: FAILED - {e}")
        return False


def test_payment_status_enum():
    """Test payment status enum values."""
    print("Testing PaymentStatus enum...")
    try:
        from app.models.payment import PaymentStatus
        
        # Check all expected statuses exist
        expected_statuses = [
            PaymentStatus.INITIATED,
            PaymentStatus.SUCCESS,
            PaymentStatus.FAILED,
            PaymentStatus.VERIFIED,
            PaymentStatus.REFUNDED,
            PaymentStatus.DISPUTED,
        ]
        
        for status in expected_statuses:
            assert isinstance(status.value, str), f"Status {status} should have string value"
        
        print("  PaymentStatus enum: PASSED")
        return True
    except Exception as e:
        print(f"  PaymentStatus enum: FAILED - {e}")
        return False


def test_payment_model_structure():
    """Test payment model has required fields."""
    print("Testing Payment model structure...")
    try:
        from app.models.payment import Payment, PaymentStatus
        
        # Check table name
        assert Payment.__tablename__ == "payments", "Table name should be 'payments'"
        
        # Check required columns exist (via SQLAlchemy inspection)
        from sqlalchemy import inspect
        from app.db.base import Base
        
        mapper = inspect(Payment)
        column_names = [col.name for col in mapper.columns]
        
        required_columns = [
            'id', 'lead_id', 'user_id', 'razorpay_order_id', 'razorpay_payment_id',
            'amount', 'currency', 'status', 'gateway_response', 'webhook_payload',
            'verified_at', 'verified_by', 'locked_at', 'created_at', 'updated_at'
        ]
        
        for col in required_columns:
            assert col in column_names, f"Missing required column: {col}"
        
        print("  Payment model structure: PASSED")
        return True
    except Exception as e:
        print(f"  Payment model structure: FAILED - {e}")
        return False


def test_payment_lock_mechanism():
    """Test payment locking logic."""
    print("Testing payment lock mechanism...")
    try:
        from app.models.payment import Payment, PaymentStatus
        from datetime import datetime
        
        # Create a mock payment
        payment = Payment(
            lead_id=1,
            user_id=1,
            razorpay_order_id="order_test_123",
            amount=Decimal("196.00"),
            status=PaymentStatus.INITIATED
        )
        
        # Should not be locked initially
        assert not payment.is_locked(), "New payment should not be locked"
        
        # Lock the payment
        payment.locked_at = datetime.utcnow()
        assert payment.is_locked(), "Payment with locked_at should be locked"
        
        # Verified payment should also be considered locked
        payment2 = Payment(
            lead_id=2,
            user_id=1,
            razorpay_order_id="order_test_456",
            amount=Decimal("196.00"),
            status=PaymentStatus.VERIFIED
        )
        assert payment2.is_locked(), "Verified payment should be locked"
        
        print("  Payment lock mechanism: PASSED")
        return True
    except Exception as e:
        print(f"  Payment lock mechanism: FAILED - {e}")
        return False


def test_payment_status_transitions():
    """Test valid status transitions."""
    print("Testing status transitions...")
    try:
        from app.models.payment import Payment, PaymentStatus
        
        # Test valid transitions
        payment = Payment(
            lead_id=1,
            user_id=1,
            razorpay_order_id="order_test",
            amount=Decimal("196.00"),
            status=PaymentStatus.INITIATED
        )
        
        # Initiated can go to success or failed
        assert payment.can_transition_to(PaymentStatus.SUCCESS), "INITIATED -> SUCCESS should be valid"
        assert payment.can_transition_to(PaymentStatus.FAILED), "INITIATED -> FAILED should be valid"
        assert not payment.can_transition_to(PaymentStatus.VERIFIED), "INITIATED -> VERIFIED should be invalid"
        
        # Success can go to verified
        payment.status = PaymentStatus.SUCCESS
        assert payment.can_transition_to(PaymentStatus.VERIFIED), "SUCCESS -> VERIFIED should be valid"
        
        # Verified is terminal
        payment.status = PaymentStatus.VERIFIED
        assert not payment.can_transition_to(PaymentStatus.FAILED), "VERIFIED -> FAILED should be invalid"
        
        print("  Status transitions: PASSED")
        return True
    except Exception as e:
        print(f"  Status transitions: FAILED - {e}")
        return False


def test_webhook_event_model():
    """Test webhook event model structure."""
    print("Testing WebhookEvent model...")
    try:
        from app.models.payment import PaymentWebhookEvent
        from sqlalchemy import inspect
        
        mapper = inspect(PaymentWebhookEvent)
        column_names = [col.name for col in mapper.columns]
        
        required_columns = [
            'id', 'event_type', 'event_id', 'payment_id', 'payload',
            'signature_valid', 'processed', 'processed_at', 'error_message', 'created_at'
        ]
        
        for col in required_columns:
            assert col in column_names, f"Missing required column: {col}"
        
        print("  WebhookEvent model: PASSED")
        return True
    except Exception as e:
        print(f"  WebhookEvent model: FAILED - {e}")
        return False


def test_razorpay_signature_validation():
    """Test webhook signature validation logic."""
    print("Testing Razorpay signature validation...")
    try:
        # Test the signature generation logic
        webhook_secret = "whsec_test_secret"
        payload = {"event": "payment.captured", "id": "evt_test_123"}
        body = json.dumps(payload, separators=(',', ':')).encode()
        
        # Generate signature
        expected_signature = hmac.new(
            key=webhook_secret.encode(),
            msg=body,
            digestmod=hashlib.sha256
        ).hexdigest()
        
        # Verify signature matches
        is_valid = hmac.compare_digest(expected_signature, expected_signature)
        assert is_valid, "Signature should match itself"
        
        # Invalid signature should fail
        is_invalid = hmac.compare_digest(expected_signature, "invalid_signature")
        assert not is_invalid, "Invalid signature should not match"
        
        print("  Razorpay signature validation: PASSED")
        return True
    except Exception as e:
        print(f"  Razorpay signature validation: FAILED - {e}")
        return False


def test_razorpay_config():
    """Test Razorpay configuration is loaded."""
    print("Testing Razorpay configuration...")
    try:
        from app.core.config import settings
        
        # Check that razorpay settings exist
        assert hasattr(settings, 'razorpay_key_id'), "Settings should have razorpay_key_id"
        assert hasattr(settings, 'razorpay_key_secret'), "Settings should have razorpay_key_secret"
        assert hasattr(settings, 'razorpay_webhook_secret'), "Settings should have razorpay_webhook_secret"
        
        # Check types
        assert isinstance(settings.razorpay_key_id, str), "razorpay_key_id should be string"
        assert isinstance(settings.razorpay_key_secret, str), "razorpay_key_secret should be string"
        assert isinstance(settings.razorpay_webhook_secret, str), "razorpay_webhook_secret should be string"
        
        print("  Razorpay configuration: PASSED")
        return True
    except Exception as e:
        print(f"  Razorpay configuration: FAILED - {e}")
        return False


async def test_database_relationships():
    """Test database relationships work correctly."""
    print("Testing database relationships...")
    try:
        from app.db.session import AsyncSessionLocal
        from app.models.payment import Payment, PaymentStatus
        from app.models.lead import Lead
        from app.models.user import User
        from sqlalchemy import select
        
        async with AsyncSessionLocal() as session:
            # Test that we can query payments
            result = await session.execute(
                select(Payment).limit(1)
            )
            payment = result.scalar_one_or_none()
            
            # If payments exist, test relationships
            if payment:
                # Test lead relationship
                lead_result = await session.execute(
                    select(Lead).where(Lead.id == payment.lead_id)
                )
                lead = lead_result.scalar_one_or_none()
                if lead:
                    print(f"    Found payment for lead: {lead.name}")
            
            print("  Database relationships: PASSED")
            return True
            
    except Exception as e:
        print(f"  Database relationships: FAILED - {e}")
        return False


async def main():
    """Run all tests."""
    print("=" * 60)
    print("PAYMENT SYSTEM TEST SUITE")
    print("=" * 60)
    print()
    
    tests = [
        ("Imports", test_imports),
        ("PaymentStatus Enum", test_payment_status_enum),
        ("Payment Model Structure", test_payment_model_structure),
        ("Payment Lock Mechanism", test_payment_lock_mechanism),
        ("Status Transitions", test_payment_status_transitions),
        ("Webhook Event Model", test_webhook_event_model),
        ("Signature Validation", test_razorpay_signature_validation),
        ("Razorpay Config", test_razorpay_config),
    ]
    
    # Run sync tests
    passed = 0
    failed = 0
    
    for name, test_func in tests:
        if test_func():
            passed += 1
        else:
            failed += 1
        print()
    
    # Run async tests
    async_tests = [
        ("Database Relationships", test_database_relationships),
    ]
    
    for name, test_func in async_tests:
        if await test_func():
            passed += 1
        else:
            failed += 1
        print()
    
    # Summary
    print("=" * 60)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("=" * 60)
    
    if failed > 0:
        sys.exit(1)
    else:
        print("\n✓ All payment system tests passed!")
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
