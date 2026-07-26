from __future__ import annotations

import subprocess
from pathlib import Path

_LABEL = "com.paytracker.app"
_PLIST_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/open</string>
        <string>-a</string>
        <string>{app_path}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
"""


def _default_launch_agents_dir() -> Path:
    return Path.home() / "Library" / "LaunchAgents"


def _plist_path(launch_agents_dir: Path) -> Path:
    return launch_agents_dir / f"{_LABEL}.plist"


def install_login_item(app_path: str, launch_agents_dir: Path | None = None) -> Path:
    """Write a LaunchAgent plist that opens the packaged .app at login.

    Only meaningful once Phase 5 packaging produces a stable .app bundle path
    — during `flet run` dev, app_path won't be a real installed app. Never
    called automatically; only from an explicit Settings toggle.
    """
    launch_agents_dir = launch_agents_dir or _default_launch_agents_dir()
    launch_agents_dir.mkdir(parents=True, exist_ok=True)

    plist_path = _plist_path(launch_agents_dir)
    plist_path.write_text(_PLIST_TEMPLATE.format(label=_LABEL, app_path=app_path))

    # Idempotent: unload first (ignore failure if not currently loaded), then load.
    subprocess.run(["launchctl", "unload", str(plist_path)], capture_output=True)
    subprocess.run(["launchctl", "load", str(plist_path)], capture_output=True)

    return plist_path


def uninstall_login_item(launch_agents_dir: Path | None = None) -> bool:
    """Remove the LaunchAgent plist, if present. Returns True if it existed."""
    launch_agents_dir = launch_agents_dir or _default_launch_agents_dir()
    plist_path = _plist_path(launch_agents_dir)

    if not plist_path.exists():
        return False

    subprocess.run(["launchctl", "unload", str(plist_path)], capture_output=True)
    plist_path.unlink()
    return True


def is_installed(launch_agents_dir: Path | None = None) -> bool:
    launch_agents_dir = launch_agents_dir or _default_launch_agents_dir()
    return _plist_path(launch_agents_dir).exists()
