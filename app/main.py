"""Flet entrypoint.

Run natively (default): uv run python main.py
Run in a browser for quick preview: FLET_VIEW=web uv run python main.py
  (osascript-based notifications will silently no-op off-macOS/off-desktop —
  everything else — Payments, Bills, Archived, Settings, backup/restore — works.)
"""

import os

import flet as ft

from paytracker.data.db import create_db_engine, create_session_factory
from paytracker.notification_scheduler import NotificationScheduler
from paytracker.services.notifications import macos as notifications_macos
from paytracker.ui.app import build_app


def main(page: ft.Page) -> None:
    engine = create_db_engine()
    session_factory = create_session_factory(engine)
    build_app(page, session_factory)

    scheduler = NotificationScheduler(
        run_check=lambda: notifications_macos.run_check(session_factory)
    )
    scheduler.start()


if __name__ == "__main__":
    if os.environ.get("FLET_VIEW") == "web":
        ft.run(main, view=ft.AppView.WEB_BROWSER, port=int(os.environ.get("FLET_PORT", 8550)))
    else:
        ft.run(main)
