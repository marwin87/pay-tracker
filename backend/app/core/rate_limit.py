import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from app.core.config import settings

# ponytail: per-process memory, resets on restart and isn't shared between workers;
# move to Redis/DB if the backend ever runs more than one worker.
_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()
_PRUNE_ABOVE = 10_000  # keys; bounds memory under a flood of distinct keys


def reset() -> None:
    with _lock:
        _hits.clear()


def _recent(key: str, window: int, now: float) -> deque[float]:
    q = _hits[key]
    while q and q[0] <= now - window:
        q.popleft()
    return q


def _too_many(q: deque[float], window: int, now: float) -> HTTPException:
    retry = max(1, int(q[0] + window - now) + 1)
    return HTTPException(
        status_code=429,
        detail="Too many attempts, try again later",
        headers={"Retry-After": str(retry)},
    )


def _prune(now: float, window: int) -> None:
    if len(_hits) > _PRUNE_ABOVE:
        for k in [k for k, q in _hits.items() if not q or q[-1] <= now - window]:
            del _hits[k]


def check(key: str, limit: int, window: int) -> None:
    """429 if `key` already used up `limit` hits within `window` seconds (no hit recorded)."""
    if not settings.rate_limit_enabled:
        return
    now = time.monotonic()
    with _lock:
        q = _recent(key, window, now)
        if len(q) >= limit:
            raise _too_many(q, window, now)


def record(key: str, window: int) -> None:
    if not settings.rate_limit_enabled:
        return
    now = time.monotonic()
    with _lock:
        _recent(key, window, now).append(now)
        _prune(now, window)


def hit(key: str, limit: int, window: int) -> None:
    """check + record in one step, for endpoints where every call counts."""
    check(key, limit, window)
    record(key, window)


def client_ip(request: Request) -> str:
    # Behind a reverse proxy this is the proxy's address unless uvicorn trusts its
    # X-Forwarded-For (FORWARDED_ALLOW_IPS); see the README.
    return request.client.host if request.client else "unknown"
