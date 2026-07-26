"""Tests for services.login_item — LaunchAgent plist install/uninstall.

subprocess.run (launchctl) is mocked throughout: tests must never register a
real job with the developer machine's launchd. The plist directory is always
a pytest tmp_path, never the real ~/Library/LaunchAgents.
"""

from unittest.mock import patch

from paytracker.services import login_item


@patch("paytracker.services.login_item.subprocess.run")
def test_install_writes_plist_with_app_path(mock_run, tmp_path):
    plist_path = login_item.install_login_item("/Applications/PayTracker.app", tmp_path)

    assert plist_path.exists()
    content = plist_path.read_text()
    assert "/Applications/PayTracker.app" in content
    assert "RunAtLoad" in content


@patch("paytracker.services.login_item.subprocess.run")
def test_install_calls_launchctl_load(mock_run, tmp_path):
    login_item.install_login_item("/Applications/PayTracker.app", tmp_path)

    calls = [c.args[0] for c in mock_run.call_args_list]
    assert any(call[:2] == ["launchctl", "unload"] for call in calls)
    assert any(call[:2] == ["launchctl", "load"] for call in calls)


@patch("paytracker.services.login_item.subprocess.run")
def test_is_installed_reflects_plist_presence(mock_run, tmp_path):
    assert login_item.is_installed(tmp_path) is False
    login_item.install_login_item("/Applications/PayTracker.app", tmp_path)
    assert login_item.is_installed(tmp_path) is True


@patch("paytracker.services.login_item.subprocess.run")
def test_uninstall_removes_plist_and_returns_true(mock_run, tmp_path):
    login_item.install_login_item("/Applications/PayTracker.app", tmp_path)

    result = login_item.uninstall_login_item(tmp_path)

    assert result is True
    assert login_item.is_installed(tmp_path) is False


@patch("paytracker.services.login_item.subprocess.run")
def test_uninstall_returns_false_when_nothing_installed(mock_run, tmp_path):
    assert login_item.uninstall_login_item(tmp_path) is False
