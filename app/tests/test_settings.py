from paytracker.services import settings as settings_service


def test_get_settings_creates_row_on_first_access(db_session):
    row = settings_service.get_settings(db_session)
    assert row.id == 1
    assert row.language_preference is None
    assert row.notifications_enabled is True


def test_get_settings_returns_same_row_on_second_access(db_session):
    first = settings_service.get_settings(db_session)
    second = settings_service.get_settings(db_session)
    assert first.id == second.id


def test_update_settings_persists_changes(db_session):
    settings_service.update_settings(db_session, language_preference="pl", reminder_time="09:30")
    row = settings_service.get_settings(db_session)
    assert row.language_preference == "pl"
    assert row.reminder_time == "09:30"
