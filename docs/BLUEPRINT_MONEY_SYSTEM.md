# Money System Blueprint - P0/P1 Implementation

**Scope:** Payment truth, lead ownership, audit trail, deduplication, state machine  
**Goal:** Trust-proof system that scales to 10K+ users without fraud/conflicts  
**Status:** Ready for implementation

---

## 🔴 P0 — SECURITY + MONEY TRUTH

---

### 1. Payment Truth System (Highest Priority)

#### Database Schema Additions

```sql
-- Payment truth table (immutable record)
CREATE TABLE payment_verifications (
    id SERIAL PRIMARY KEY,
    payment_id VARCHAR(255) UNIQUE NOT NULL,  -- Razorpay/Stripe ID
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    user_id INTEGER NOT NULL REFERENCES users(id),  -- Who initiated
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    
    -- Status flow: initiated → pending → success → verified → locked
    status VARCHAR(50) NOT NULL DEFAULT 'initiated',
    
    -- Gateway response (immutable snapshot)
    gateway_response JSONB,
    webhook_payload JSONB,
    
    -- Verification
    verified_at TIMESTAMP,
    verified_by INTEGER REFERENCES users(id),  -- Admin/system
    
    -- Lock (no further changes allowed)
    locked_at TIMESTAMP,
    locked_by INTEGER REFERENCES users(id),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN (
        'initiated', 'pending', 'success', 'failed', 
        'verified', 'locked', 'disputed', 'refunded'
    )),
    CONSTRAINT amount_positive CHECK (amount > 0)
);

-- Prevent duplicate payments (same lead + same amount + 24hr window)
CREATE UNIQUE INDEX idx_duplicate_payment_guard 
ON payment_verifications (lead_id, amount, currency) 
WHERE status IN ('initiated', 'pending', 'success', 'verified', 'locked')
AND created_at > NOW() - INTERVAL '24 hours';

-- Fast lookups
CREATE INDEX idx_payment_lead ON payment_verifications(lead_id);
CREATE INDEX idx_payment_user ON payment_verifications(user_id);
CREATE INDEX idx_payment_status ON payment_verifications(status);
CREATE INDEX idx_payment_gateway_id ON payment_verifications(payment_id);
```

#### API Endpoints

```python
# POST /api/v1/payments/initiate
# Initiates payment, returns Razorpay order ID

# POST /api/v1/payments/webhook/razorpay  
# Webhook handler - updates status based on gateway response

# GET /api/v1/payments/{payment_id}/status
# Check payment status (real-time from gateway)

# POST /api/v1/payments/{payment_id}/verify  
# Admin verification step (optional for high-value)

# POST /api/v1/payments/{payment_id}/lock
# Final lock - no further changes allowed
```

#### Business Rules (Hardcoded)

```python
PAYMENT_RULES = {
    "no_manual_mark_paid": True,  # Only webhook can mark success
    "verification_required_above": 5000,  # INR
    "auto_lock_after_verification": True,
    "duplicate_window_hours": 24,
    "refund_window_days": 7,
}
```

---

### 2. Lead Ownership Lock System

#### Database Schema

```sql
-- Lead ownership (single source of truth)
CREATE TABLE lead_ownership (
    lead_id INTEGER PRIMARY KEY REFERENCES leads(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    
    -- Lock metadata
    assigned_at TIMESTAMP DEFAULT NOW(),
    assigned_by INTEGER REFERENCES users(id),  -- Who assigned (leader/admin)
    
    -- Reclaim rules
    reclaimable_at TIMESTAMP,  -- Optional: auto-reclaim after N days
    
    -- Transfer history reference
    transfer_count INTEGER DEFAULT 0,
    
    -- Lock status
    is_locked BOOLEAN DEFAULT FALSE,
    locked_reason VARCHAR(255),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Ownership history (append-only)
CREATE TABLE lead_ownership_history (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    
    -- Previous owner
    previous_owner_id INTEGER REFERENCES users(id),
    
    -- New owner  
    new_owner_id INTEGER NOT NULL REFERENCES users(id),
    
    -- Transfer details
    transferred_at TIMESTAMP DEFAULT NOW(),
    transferred_by INTEGER NOT NULL REFERENCES users(id),
    transfer_reason VARCHAR(255),
    
    -- Reclaim info
    is_reclaim BOOLEAN DEFAULT FALSE,
    reclaim_basis VARCHAR(50),  -- 'time_based', 'manual', 'system'
    
    -- Indexes
    INDEX idx_history_lead (lead_id),
    INDEX idx_history_previous_owner (previous_owner_id),
    INDEX idx_history_new_owner (new_owner_id),
    INDEX idx_history_transferred_at (transferred_at)
);
```

#### Assignment Rules (Business Logic)

```python
ASSIGNMENT_RULES = {
    "first_claim": "immediate_lock",  # First person to assign gets lock
    "reassign_allowed_by": ["leader", "admin"],  # Who can override
    "auto_reclaim_days": 7,  # Inactive leads auto-reclaimed
    "no_shared_ownership": True,  # 1 lead = 1 owner always
    "claim_cooldown_hours": 1,  # Can't reclaim immediately after transfer
}
```

#### API Endpoints

```python
# POST /api/v1/leads/{lead_id}/claim
# Claim ownership (first-come-first-served)

# POST /api/v1/leads/{lead_id}/reassign
# Leader/admin reassign to another user

# POST /api/v1/leads/{lead_id}/reclaim
# Reclaim inactive lead (time-based or manual)

# GET /api/v1/leads/{lead_id}/ownership
# Get current ownership + history

# GET /api/v1/users/my-locked-leads
# Get all leads owned by current user
```

---

### 3. Conflict-Safe Writes (Race Condition Prevention)

#### Option A: Optimistic Locking (Versioning)

```sql
-- Add to existing leads table
ALTER TABLE leads ADD COLUMN version_number INTEGER DEFAULT 1;
ALTER TABLE leads ADD COLUMN last_modified_at TIMESTAMP DEFAULT NOW();
ALTER TABLE leads ADD COLUMN last_modified_by INTEGER REFERENCES users(id);

-- Index for fast version checks
CREATE INDEX idx_leads_version ON leads(id, version_number);
```

```python
# Update logic
def update_lead_safe(lead_id: int, user_id: int, data: dict, expected_version: int):
    # Try to update only if version matches
    result = await session.execute(
        update(Lead)
        .where(Lead.id == lead_id, Lead.version_number == expected_version)
        .values(
            **data,
            version_number=Lead.version_number + 1,
            last_modified_at=datetime.utcnow(),
            last_modified_by=user_id
        )
        .returning(Lead.id)
    )
    
    if result.rowcount == 0:
        raise ConflictError("Lead modified by another user. Refresh and retry.")
```

#### Option B: Row-Level Locking (Postgres)

```python
# For critical operations
def update_lead_with_lock(lead_id: int, user_id: int, data: dict):
    # Acquire lock, block others
    lead = await session.execute(
        select(Lead)
        .where(Lead.id == lead_id)
        .with_for_update(nowait=False)  # Wait for lock
    )
    
    # Update within lock
    lead.update(**data)
    await session.commit()
    # Lock released on commit
```

#### Recommendation

- **Use Optimistic Locking** for most operations (better performance)
- **Use Row-Level Locking** for payment/ownership changes (critical)

---

### 4. Audit Log (Tamper-Proof)

#### Database Schema

```sql
-- Immutable audit log (append-only, never delete)
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    
    -- What changed
    entity_type VARCHAR(50) NOT NULL,  -- 'lead', 'payment', 'user', etc.
    entity_id INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,  -- 'create', 'update', 'delete', 'transfer', 'verify'
    
    -- Who did it
    actor_id INTEGER NOT NULL REFERENCES users(id),
    actor_role VARCHAR(50),
    
    -- Change details
    previous_state JSONB,
    new_state JSONB,
    change_summary JSONB,  -- Human-readable diff
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(255),  -- For tracing
    
    -- Immutable timestamp
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Partition by month for performance
    ) PARTITION BY RANGE (created_at);

-- Create partitions
CREATE TABLE audit_logs_2024_01 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
-- ... etc

-- Indexes
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
```

#### Audit Triggers (Auto-Log)

```python
# Decorator for audited operations
@audit_action(entity_type="lead", action="update")
def update_lead(lead_id: int, data: dict, user_id: int):
    # Normal update logic
    pass

# This automatically:
# 1. Fetches previous state
# 2. Applies update
# 3. Logs both states to audit_logs
```

---

## 🟠 P1 — DATA MODEL ENGINE

---

### 5. Deduplication Engine

#### Phone Normalization

```python
import re

def normalize_phone(phone: str) -> str:
    """Normalize phone for deduplication."""
    # Remove all non-digits
    digits = re.sub(r'\D', '', phone)
    
    # Handle country codes
    if digits.startswith('91') and len(digits) == 12:
        # Indian number with country code
        return digits[2:]  # Remove 91 prefix
    elif digits.startswith('0') and len(digits) == 11:
        # Indian number with 0 prefix
        return digits[1:]  # Remove 0
    elif len(digits) == 10:
        # Standard 10-digit Indian number
        return digits
    
    return digits  # Return as-is if doesn't match patterns
```

#### Duplicate Detection

```sql
-- Add normalized phone to leads
ALTER TABLE leads ADD COLUMN phone_normalized VARCHAR(20);
ALTER TABLE leads ADD COLUMN is_duplicate BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN duplicate_of_id INTEGER REFERENCES leads(id);

-- Unique constraint on normalized phone
CREATE UNIQUE INDEX idx_leads_phone_normalized 
ON leads(phone_normalized) 
WHERE is_duplicate = FALSE;

-- Fuzzy match index (for similar names)
CREATE INDEX idx_leads_name_trgm ON leads USING gin(name gin_trgm_ops);
```

#### Deduplication Rules

```python
DUPLICATE_RULES = {
    "exact_match": "auto_merge",  # Same phone = auto merge
    "fuzzy_match_threshold": 0.8,  # Name similarity
    "manual_review_required": True,  # For fuzzy matches
    "merge_priority": "earliest_created",  # Which record wins
}
```

#### API Endpoints

```python
# POST /api/v1/leads/deduplicate/check
# Check if phone already exists

# POST /api/v1/leads/deduplicate/merge
# Merge duplicate leads (admin only)

# GET /api/v1/leads/duplicates/pending
# List leads flagged for manual review
```

---

### 6. State Machine (Strict Flow)

#### Status Definitions

```python
from enum import Enum

class LeadStatus(str, Enum):
    NEW = "new"
    CONTACTED = "contacted"
    VIDEO_SENT = "video_sent"
    VIDEO_WATCHED = "video_watched"
    INTERESTED = "interested"
    PAYMENT_INITIATED = "payment_initiated"
    PAID = "paid"
    DAY1 = "day1"
    DAY2 = "day2"
    DAY3 = "day3"
    COMPLETED = "completed"
    DROPPED = "dropped"
    RETARGET = "retarget"

# Valid transitions
VALID_TRANSITIONS = {
    LeadStatus.NEW: [LeadStatus.CONTACTED, LeadStatus.DROPPED],
    LeadStatus.CONTACTED: [LeadStatus.VIDEO_SENT, LeadStatus.DROPPED, LeadStatus.RETARGET],
    LeadStatus.VIDEO_SENT: [LeadStatus.VIDEO_WATCHED, LeadStatus.DROPPED, LeadStatus.RETARGET],
    LeadStatus.VIDEO_WATCHED: [LeadStatus.INTERESTED, LeadStatus.DROPPED],
    LeadStatus.INTERESTED: [LeadStatus.PAYMENT_INITIATED, LeadStatus.DROPPED],
    LeadStatus.PAYMENT_INITIATED: [LeadStatus.PAID, LeadStatus.DROPPED],
    LeadStatus.PAID: [LeadStatus.DAY1, LeadStatus.DROPPED],
    LeadStatus.DAY1: [LeadStatus.DAY2, LeadStatus.DROPPED],
    LeadStatus.DAY2: [LeadStatus.DAY3, LeadStatus.DROPPED],
    LeadStatus.DAY3: [LeadStatus.COMPLETED, LeadStatus.DROPPED],
}

# Backward transitions (with reason)
BACKWARD_TRANSITIONS = {
    LeadStatus.PAID: [LeadStatus.PAYMENT_INITIATED],  # Refund
    LeadStatus.DAY1: [LeadStatus.PAID],
    LeadStatus.DAY2: [LeadStatus.DAY1],
    LeadStatus.DAY3: [LeadStatus.DAY2],
}
```

#### Transition Rules

```python
TRANSITION_RULES = {
    "require_reason_for_backward": True,
    "require_reason_for_drop": True,
    "auto_transition_on_payment": True,  # payment_success → PAID
    "time_limits": {
        LeadStatus.NEW: {"max_days": 3, "auto": LeadStatus.RETARGET},
        LeadStatus.CONTACTED: {"max_days": 2, "auto": LeadStatus.RETARGET},
        LeadStatus.VIDEO_SENT: {"max_days": 3, "auto": LeadStatus.RETARGET},
        LeadStatus.PAYMENT_INITIATED: {"max_days": 1, "auto": LeadStatus.DROPPED},
    }
}
```

#### Database Schema

```sql
-- Status transitions log
CREATE TABLE status_transitions (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    
    from_status VARCHAR(50) NOT NULL,
    to_status VARCHAR(50) NOT NULL,
    
    -- Who triggered
    actor_id INTEGER NOT NULL REFERENCES users(id),
    
    -- Context
    reason VARCHAR(255),  -- Required for backward/drop
    metadata JSONB,  -- Additional context
    
    -- Timing
    transitioned_at TIMESTAMP DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_transitions_lead (lead_id),
    INDEX idx_transitions_actor (actor_id),
    INDEX idx_transitions_from (from_status),
    INDEX idx_transitions_to (to_status),
    INDEX idx_transitions_time (transitioned_at)
);
```

---

## 🚀 Implementation Order

### Week 1-2: P0 Core (Money + Ownership)

1. **Day 1-2**: Payment truth schema + webhook handlers
2. **Day 3-4**: Lead ownership lock system
3. **Day 5-7**: Audit log + conflict-safe writes

### Week 3: P1 Data Engine

4. **Day 8-10**: Deduplication engine
5. **Day 11-14**: State machine strict flow

### Week 4: Polish + Scale Prep

6. **Day 15-17**: UX improvements (P2)
7. **Day 18-21**: Indexing + API optimization

---

## 🧪 Testing Strategy

```python
# Critical test cases
def test_duplicate_payment_blocked():
    """Same lead + amount within 24hr should fail."""
    
def test_ownership_race_condition():
    """Two users claim same lead simultaneously - only one wins."""
    
def test_payment_webhook_only():
    """Manual 'mark paid' should fail - only webhook succeeds."""
    
def test_audit_immutable():
    """Audit logs should never be deletable/updatable."""
    
def test_version_conflict():
    """Stale version update should be rejected."""
```

---

## 💰 Business Impact

| System | Fraud Prevented | Scale Enabler |
|--------|----------------|---------------|
| Payment Truth | Fake conversions | Trust in data |
| Ownership Lock | Credit disputes | Team clarity |
| Audit Log | Tampering | Compliance |
| Deduplication | Data pollution | Clean analytics |
| State Machine | Skipped steps | Predictable flow |

**Result:** System becomes *trust-proof* → scales without chaos.

---

*Blueprint ready for implementation. Start with Payment Truth (P0-1).*
