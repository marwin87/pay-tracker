import time

from paytracker.notification_scheduler import NotificationScheduler


def test_scheduler_runs_check_immediately_on_start():
    calls = []
    scheduler = NotificationScheduler(run_check=lambda: calls.append(1) or 0, interval_seconds=60)
    scheduler.start()
    time.sleep(0.05)
    scheduler.stop()

    assert len(calls) >= 1


def test_scheduler_repeats_on_interval():
    calls = []
    scheduler = NotificationScheduler(
        run_check=lambda: calls.append(1) or 0, interval_seconds=0.02
    )
    scheduler.start()
    time.sleep(0.15)
    scheduler.stop()
    time.sleep(0.05)

    assert len(calls) >= 3


def test_scheduler_survives_run_check_exceptions():
    calls = []

    def flaky():
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("boom")
        return 0

    scheduler = NotificationScheduler(run_check=flaky, interval_seconds=0.02)
    scheduler.start()
    time.sleep(0.1)
    scheduler.stop()

    assert len(calls) >= 2  # survived the first exception and kept ticking
