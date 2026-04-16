# Socket.io rooms — Lead Execution CRM

## Security (production)

- Set `CRM_REQUIRE_SOCKET_AUTH=true` (default in `.env.example`) and `CRM_JWT_SECRET`.
- Handshake must send `auth.token` = **HS256 JWT** whose payload includes **`sub`** (user id). Unsigned or wrong-signature tokens are rejected.
- For local dev only, set `CRM_REQUIRE_SOCKET_AUTH=false` to allow handshake without JWT (not for production).

Connections authenticate via `auth.token` (JWT) when required, or optional dev bypass above.

| Room pattern | Members | Use |
|--------------|---------|-----|
| `user:{userId}` | Single user | Lead updates for handler/owner, wallet claim ack |
| `team:{teamId}` | Team scope (JWT `team_id` or `"default"`) | Team-wide activity / funnel fan-out |
| `admin` | Users with `role === "admin"` | System alerts, mandatory escalations (`emitToAdmin`) |
| `lead:{leadId}` | Join when opening lead detail (client should call `socket.emit('join:lead', leadId)` — wire in app) | Lead-level updates |
| `pipeline:{personal\|team}` | Users subscribed to that pipeline feed | Broadcast funnel events |
| `role:{admin\|leader\|team}` | Role bucket | Optional fan-out |

## Events (minimal contract)

- `crm:ready` — server ack after connect
- `lead.updated` — payload `{ leadId, stage?, claimed?, reassign?, closed? }`
- `wallet.claimed` — `{ leadId, duplicate? }`
- `escalation.new` — `{ id, leadId }`
- `lead.assigned` — `{ leadId, handlerId }`

**Policy:** persist to PostgreSQL first in API/worker, then emit. For multi-instance API, add Redis adapter + `@socket.io/redis-emitter` from workers.
