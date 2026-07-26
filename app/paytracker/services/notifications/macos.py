from __future__ import annotations

import logging
import subprocess

from sqlalchemy.orm import sessionmaker

from paytracker.services import notifications

logger = logging.getLogger(__name__)

_KIND_LABELS = {
    "2_days_before": "due in 2 days",
    "upcoming": "due tomorrow",
    "on_day": "due today",
    "overdue": "overdue",
}


def _escape_applescript_string(value: str) -> str:
    """Escape a string for safe interpolation into an AppleScript string
    literal (double-quoted). Backslash and double-quote are the only
    characters that need escaping inside an AppleScript "..." literal."""
    return value.replace("\\", "\\\\").replace('"', '\\"')


def fire_notification(title: str, message: str) -> bool:
    """Fire a native macOS notification via osascript. Returns True on success."""
    script = (
        f'display notification "{_escape_applescript_string(message)}" '
        f'with title "{_escape_applescript_string(title)}"'
    )
    try:
        subprocess.run(
            ["osascript", "-e", script],
            check=True,
            capture_output=True,
            timeout=5,
        )
        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as exc:
        logger.warning("Failed to fire macOS notification: %s", exc)
        return False


def run_check(session_factory: sessionmaker, force: bool = False) -> int:
    """Run the due-bill + monthly-summary check once, firing notifications for
    anything due and flagging it sent. Returns the number of notifications fired.

    By default (force=False, used by the automatic background timer) this is
    idempotent via the reminder_sent_*/monthly_summary_last_sent flags, so it's
    safe to call every 15 minutes without duplicate notifications. force=True
    (used by the manual "Check Now" button) bypasses those flags and re-fires
    everything currently due, every time it's called."""
    fired = 0
    with session_factory() as db:
        for reminder in notifications.check_due_bills(db, force=force):
            label = _KIND_LABELS.get(reminder.kind, reminder.kind)
            title = f"{reminder.bill_name} — {label}"
            message = f"{reminder.amount} {reminder.currency}, due {reminder.due_date.isoformat()}"
            if fire_notification(title, message):
                notifications.mark_reminder_sent(db, reminder.instance_id, reminder.flag_attr)
                fired += 1

        summary = notifications.check_monthly_summary(db, force=force)
        if summary is not None:
            total_paid = sum((row["paid_amount"] or 0) for row in summary.paid)
            title = f"Monthly summary — {summary.month}"
            message = (
                f"{len(summary.paid)} paid ({total_paid}), "
                f"{len(summary.unpaid)} unpaid/missed"
            )
            if fire_notification(title, message):
                notifications.mark_monthly_summary_sent(db, summary.month)
                fired += 1

    return fired
