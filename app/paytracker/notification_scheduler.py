from __future__ import annotations

import logging
import threading
from typing import Callable

logger = logging.getLogger(__name__)

DEFAULT_INTERVAL_SECONDS = 15 * 60  # 15 minutes


class NotificationScheduler:
    """Runs a due-bill check immediately, then repeatedly on a timer, for as
    long as the app process is alive. Foreground-only (see Phase 4 plan note:
    this Flet version has no tray/background-process API, so there is no way
    to keep checking after the window/process closes — the scheduler thread
    is a daemon thread that dies with the process)."""

    def __init__(
        self,
        run_check: Callable[[], int],
        interval_seconds: int = DEFAULT_INTERVAL_SECONDS,
    ):
        self._run_check = run_check
        self._interval_seconds = interval_seconds
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()

    def _loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                fired = self._run_check()
                if fired:
                    logger.info("Notification check fired %d notification(s)", fired)
            except Exception:
                logger.exception("Notification check failed")
            if self._stop_event.wait(self._interval_seconds):
                break
