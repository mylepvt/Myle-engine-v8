#!/usr/bin/env python3
"""
Sequential latency check — no external tools.
p95 > 300ms → exit(1)
"""
import statistics
import sys
import time
import urllib.request
import urllib.error

BASE_URL = "http://localhost:8000"
ENDPOINTS = [
    "/api/v1/leads",
    "/api/v1/auth/login",
    "/api/v1/payments/proof/pending",
]
N = 10
P95_LIMIT_MS = 300


def measure(url: str) -> list[float]:
    times = []
    for _ in range(N):
        t0 = time.perf_counter()
        try:
            urllib.request.urlopen(url, timeout=5)
        except urllib.error.HTTPError:
            pass  # 4xx/5xx still measures latency
        times.append((time.perf_counter() - t0) * 1000)
    return times


failed = False
for path in ENDPOINTS:
    url = BASE_URL + path
    samples = measure(url)
    avg = statistics.mean(samples)
    p95 = sorted(samples)[int(len(samples) * 0.95) - 1]
    status = "FAIL" if p95 > P95_LIMIT_MS else "OK"
    if p95 > P95_LIMIT_MS:
        failed = True
    print(f"[{status}] {path}  avg={avg:.1f}ms  p95={p95:.1f}ms")

sys.exit(1 if failed else 0)
