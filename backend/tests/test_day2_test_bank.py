"""Day 2 question bank must not leak the answer through option length / shape."""

from __future__ import annotations

from collections import Counter

from app.core.day2_test_bank import DAY2_TEST_QUESTIONS, PASS_MARK, QUESTIONS_PER_ATTEMPT


def _length_rank(q: dict) -> int:
    order = sorted(q["options"], key=lambda k: -len(q["options"][k]))
    return order.index(q["correct"]) + 1


def test_bank_shape():
    ids = [q["id"] for q in DAY2_TEST_QUESTIONS]
    assert len(ids) == len(set(ids)) >= QUESTIONS_PER_ATTEMPT
    for q in DAY2_TEST_QUESTIONS:
        assert set(q["options"]) == {"A", "B", "C", "D"}
        assert q["correct"] in q["options"]
        assert len(set(q["options"].values())) == 4, q["id"]


def test_no_length_strategy_beats_the_pass_mark():
    """'Always pick the longest (or 2nd/3rd/shortest) option' must stay far below 80%."""
    total = len(DAY2_TEST_QUESTIONS)
    ranks = Counter(_length_rank(q) for q in DAY2_TEST_QUESTIONS)
    pass_share = PASS_MARK / QUESTIONS_PER_ATTEMPT
    for rank in (1, 2, 3, 4):
        share = ranks.get(rank, 0) / total
        assert share <= 0.45, (rank, share)
        assert share < pass_share - 0.3, (rank, share)
