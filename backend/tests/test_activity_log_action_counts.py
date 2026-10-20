"""Activity log: the filter chips list every action in the range, not just this page's."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.activity_log import ActivityLog
from app.models.user import User


async def test_action_counts_cover_the_whole_range(admin_client, engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    now = datetime.now(timezone.utc)
    async with factory() as s:
        s.add(User(id=9301, email="act-log@test.myle", role="team", name="Act Log", fbo_id="FACTLOG"))
        await s.flush()
        for i in range(3):
            s.add(ActivityLog(user_id=9301, action="test.alpha", created_at=now - timedelta(minutes=i)))
        s.add(ActivityLog(user_id=9301, action="test.beta", created_at=now - timedelta(minutes=5)))
        s.add(ActivityLog(user_id=9301, action="test.old", created_at=now - timedelta(days=40)))
        await s.commit()

    r = await admin_client.get("/api/v1/analytics/activity-log", params={"page_size": 1, "user_id": 9301})
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["items"]) == 1  # one row on the page…
    # …but every action in the 30-day range is offered, with its full count.
    assert body["action_counts"] == [{"action": "test.alpha", "count": 3}, {"action": "test.beta", "count": 1}]

    # With one action selected, the rows narrow and the chips stay.
    r = await admin_client.get("/api/v1/analytics/activity-log", params={"action": "test.beta", "user_id": 9301})
    body = r.json()
    assert [i["action"] for i in body["items"]] == ["test.beta"]
    assert {a["action"] for a in body["action_counts"]} == {"test.alpha", "test.beta"}
