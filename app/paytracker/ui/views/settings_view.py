from __future__ import annotations

from datetime import date
from typing import Callable

import flet as ft
from sqlalchemy.orm import sessionmaker

from paytracker.services import backup as backup_service
from paytracker.services import login_item
from paytracker.services import settings as settings_service
from paytracker.services.notifications import macos as notifications_macos
from paytracker.ui import i18n
from paytracker.ui.components import page_header, rounded_button_style, soft_card
from paytracker.ui.i18n import t

_LANGUAGES = [("en", "English"), ("pl", "Polski"), ("de", "Deutsch")]
_THEME_MODES = {
    "light": ft.ThemeMode.LIGHT,
    "dark": ft.ThemeMode.DARK,
    "system": ft.ThemeMode.SYSTEM,
}


class SettingsView(ft.Column):
    def __init__(
        self,
        page: ft.Page,
        session_factory: sessionmaker,
        on_language_change: Callable[[], None] | None = None,
    ):
        super().__init__(expand=True, spacing=18, scroll=ft.ScrollMode.AUTO)
        self._isolated = True  # this control calls self.update() from its own methods
        self._page = page
        self._mounted = False
        self.session_factory = session_factory
        self.on_language_change = on_language_change

        # FilePicker is a self-registering Service control (see
        # flet.controls.services.service.Service.init) — it attaches itself
        # to the current page automatically on construction. It must NOT be
        # added to page.overlay (that's for visual controls only; doing so
        # makes the client reject it as an unknown control type).
        self.save_picker = ft.FilePicker()
        self.pick_picker = ft.FilePicker()

        self.header = page_header(ft.Icons.SETTINGS, t("Nav.settings"))

        self.language_title = ft.Text(weight=ft.FontWeight.BOLD, size=15)
        self.language_dd = ft.Dropdown(
            options=[ft.DropdownOption(key=code, text=label) for code, label in _LANGUAGES],
            on_select=self._on_language_change,
            width=200,
        )
        self.theme_title = ft.Text(weight=ft.FontWeight.BOLD, size=15)
        self.theme_dd = ft.Dropdown(
            options=[
                ft.DropdownOption(key=code, text=t(f"Theme.{code}")) for code in _THEME_MODES
            ],
            on_select=self._on_theme_change,
            width=200,
        )
        self.status_text = ft.Text("")
        self.snapshot_section = ft.Container(visible=False)

        self.notifications_title = ft.Text(weight=ft.FontWeight.BOLD, size=15)
        self.notifications_hint = ft.Text(size=11, italic=True)
        self.notifications_enabled_cb = ft.Checkbox(on_change=self._on_notification_pref_change)
        self.notify_2_days_cb = ft.Checkbox(on_change=self._on_notification_pref_change)
        self.notify_1_day_cb = ft.Checkbox(on_change=self._on_notification_pref_change)
        self.notify_on_day_cb = ft.Checkbox(on_change=self._on_notification_pref_change)
        self.notify_1_day_after_cb = ft.Checkbox(on_change=self._on_notification_pref_change)
        self.monthly_summary_cb = ft.Checkbox(on_change=self._on_notification_pref_change)
        self.check_now_button = ft.ElevatedButton(
            content=ft.Text(""),
            icon=ft.Icons.NOTIFICATIONS_ACTIVE,
            on_click=self._check_now,
            style=rounded_button_style(),
        )
        self.notification_status_text = ft.Text("")

        self.startup_title = ft.Text(weight=ft.FontWeight.BOLD, size=15)
        self.launch_at_login_cb = ft.Checkbox(on_change=self._on_launch_at_login_change)
        self.startup_status_text = ft.Text("")

        self.backup_title = ft.Text(weight=ft.FontWeight.BOLD, size=15)
        self.download_backup_button = ft.ElevatedButton(
            content=ft.Text(""),
            icon=ft.Icons.DOWNLOAD,
            on_click=self._download_backup,
            style=rounded_button_style(),
        )
        self.restore_backup_button = ft.ElevatedButton(
            content=ft.Text(""),
            icon=ft.Icons.UPLOAD,
            on_click=self._restore_backup,
            style=rounded_button_style(),
        )

        self.controls = [
            self.header,
            soft_card(
                ft.Row(
                    [
                        ft.Icon(ft.Icons.TRANSLATE, color=ft.Colors.PRIMARY),
                        ft.Column([self.language_title, self.language_dd], spacing=8),
                    ],
                    spacing=14,
                )
            ),
            soft_card(
                ft.Row(
                    [
                        ft.Icon(ft.Icons.PALETTE, color=ft.Colors.PRIMARY),
                        ft.Column([self.theme_title, self.theme_dd], spacing=8),
                    ],
                    spacing=14,
                )
            ),
            soft_card(
                ft.Column(
                    [
                        ft.Row(
                            [ft.Icon(ft.Icons.NOTIFICATIONS, color=ft.Colors.PRIMARY), self.notifications_title],
                            spacing=10,
                        ),
                        self.notifications_hint,
                        self.notifications_enabled_cb,
                        ft.Row(
                            [
                                self.notify_2_days_cb,
                                self.notify_1_day_cb,
                                self.notify_on_day_cb,
                                self.notify_1_day_after_cb,
                            ],
                            wrap=True,
                        ),
                        self.monthly_summary_cb,
                        ft.Row([self.check_now_button]),
                        self.notification_status_text,
                    ],
                    spacing=8,
                )
            ),
            soft_card(
                ft.Column(
                    [
                        ft.Row(
                            [
                                ft.Icon(ft.Icons.LOGIN, color=ft.Colors.PRIMARY),
                                ft.Column([self.startup_title, self.launch_at_login_cb], spacing=8),
                            ],
                            spacing=14,
                        ),
                        self.startup_status_text,
                    ],
                    spacing=8,
                )
            ),
            soft_card(
                ft.Column(
                    [
                        ft.Row(
                            [ft.Icon(ft.Icons.CLOUD_SYNC, color=ft.Colors.PRIMARY), self.backup_title],
                            spacing=10,
                        ),
                        ft.Row(
                            [
                                self.download_backup_button,
                                self.restore_backup_button,
                            ],
                            wrap=True,
                        ),
                        self.status_text,
                    ],
                    spacing=8,
                )
            ),
            self.snapshot_section,
        ]

    def did_mount(self):
        self._mounted = True
        self.refresh()

    def will_unmount(self):
        self._mounted = False

    def refresh(self):
        self.header = page_header(ft.Icons.SETTINGS, t("Nav.settings"))
        self.controls[0] = self.header
        self.language_title.value = t("SettingsPage.language")
        self.theme_title.value = t("SettingsPage.theme")
        self.theme_dd.options = [
            ft.DropdownOption(key=code, text=t(f"Theme.{code}")) for code in _THEME_MODES
        ]
        self.notifications_title.value = t("SettingsPage.notifications")
        self.notifications_hint.value = t("SettingsPage.notificationsHint")
        self.notifications_enabled_cb.label = t("SettingsPage.notificationsEnabled")
        self.notify_2_days_cb.label = t("SettingsPage.notify2DaysBefore")
        self.notify_1_day_cb.label = t("SettingsPage.notify1DayBefore")
        self.notify_on_day_cb.label = t("SettingsPage.notifyOnDay")
        self.notify_1_day_after_cb.label = t("SettingsPage.notify1DayAfter")
        self.monthly_summary_cb.label = t("SettingsPage.monthlySummary")
        self.check_now_button.content.value = t("SettingsPage.checkNow")
        self.startup_title.value = t("SettingsPage.startup")
        self.launch_at_login_cb.label = t("SettingsPage.openAtLogin")
        self.backup_title.value = t("SettingsPage.backupRestore")
        self.download_backup_button.content.value = t("SettingsPage.downloadBackup")
        self.restore_backup_button.content.value = t("SettingsPage.restoreFromBackup")

        with self.session_factory() as db:
            row = settings_service.get_settings(db)
            self.language_dd.value = row.language_preference or "en"
            self.theme_dd.value = row.theme_mode

            self.notifications_enabled_cb.value = row.notifications_enabled
            self.notify_2_days_cb.value = row.notify_2_days_before
            self.notify_1_day_cb.value = row.notify_1_day_before
            self.notify_on_day_cb.value = row.notify_on_day
            self.notify_1_day_after_cb.value = row.notify_1_day_after
            self.monthly_summary_cb.value = row.monthly_summary_enabled
            self.launch_at_login_cb.value = login_item.is_installed()

            snapshot = backup_service.active_snapshot(db)
            if snapshot:
                self.snapshot_section.content = soft_card(
                    ft.Column(
                        [
                            ft.Row(
                                [
                                    ft.Icon(ft.Icons.HISTORY, color=ft.Colors.AMBER),
                                    ft.Text(
                                        t("SettingsPage.recoverSnapshotTitle"),
                                        weight=ft.FontWeight.BOLD,
                                        size=15,
                                    ),
                                ],
                                spacing=10,
                            ),
                            ft.Text(
                                t(
                                    "SettingsPage.recoverSnapshotBody",
                                    date=snapshot.created_at.strftime("%Y-%m-%d %H:%M"),
                                )
                            ),
                            ft.ElevatedButton(
                                t("SettingsPage.restoreSnapshotButton"),
                                on_click=self._restore_snapshot,
                                style=rounded_button_style(),
                            ),
                        ],
                        spacing=8,
                    ),
                    accent=ft.Colors.AMBER,
                )
                self.snapshot_section.visible = True
            else:
                self.snapshot_section.visible = False
        if self._mounted:
            self.update()

    def _on_language_change(self, e):
        with self.session_factory() as db:
            settings_service.update_settings(db, language_preference=self.language_dd.value)
        i18n.set_language(self.language_dd.value)
        self.refresh()
        if self.on_language_change:
            self.on_language_change()

    def _on_theme_change(self, e):
        with self.session_factory() as db:
            settings_service.update_settings(db, theme_mode=self.theme_dd.value)
        if self._page:
            self._page.theme_mode = _THEME_MODES[self.theme_dd.value]
            self._page.update()

    def _on_notification_pref_change(self, e):
        with self.session_factory() as db:
            settings_service.update_settings(
                db,
                notifications_enabled=self.notifications_enabled_cb.value,
                notify_2_days_before=self.notify_2_days_cb.value,
                notify_1_day_before=self.notify_1_day_cb.value,
                notify_on_day=self.notify_on_day_cb.value,
                notify_1_day_after=self.notify_1_day_after_cb.value,
                monthly_summary_enabled=self.monthly_summary_cb.value,
            )

    def _packaged_app_path(self) -> str | None:
        """The .app bundle path when running from a packaged build, else None
        (e.g. during `flet run` dev — see login_item.install_login_item)."""
        import sys

        exe = sys.executable
        marker = ".app/Contents/MacOS"
        if marker in exe:
            return exe.split(marker)[0] + ".app"
        return None

    def _on_launch_at_login_change(self, e):
        with self.session_factory() as db:
            settings_service.update_settings(
                db, launch_at_login=self.launch_at_login_cb.value
            )

        app_path = self._packaged_app_path()
        if app_path is None:
            self._set_startup_status(t("SettingsPage.loginItemNeedsPackagedApp"))
            return

        if self.launch_at_login_cb.value:
            login_item.install_login_item(app_path)
            self._set_startup_status(t("SettingsPage.loginItemEnabled"))
        else:
            login_item.uninstall_login_item()
            self._set_startup_status(t("SettingsPage.loginItemDisabled"))

    def _check_now(self, e):
        fired = notifications_macos.run_check(self.session_factory, force=True)
        self.notification_status_text.value = (
            t("SettingsPage.checkedFired", count=fired)
            if fired
            else t("SettingsPage.checkedNothingDue")
        )
        if self._mounted:
            self.notification_status_text.update()

    def _set_status(self, message: str):
        self.status_text.value = message
        if self._mounted:
            self.status_text.update()

    def _set_startup_status(self, message: str):
        self.startup_status_text.value = message
        if self._mounted:
            self.startup_status_text.update()

    async def _download_backup(self, e):
        with self.session_factory() as db:
            payload = backup_service.export_json_payload(db)
        import json

        data = json.dumps(payload, indent=2).encode()
        file_name = f"pay-tracker-backup-{date.today().isoformat()}.json"
        await self.save_picker.save_file(file_name=file_name, src_bytes=data)
        self._set_status(t("SettingsPage.backupDownloaded"))

    async def _restore_backup(self, e):
        files = await self.pick_picker.pick_files(
            allowed_extensions=["json"], with_data=True
        )
        if not files:
            return
        content = files[0].bytes
        if content is None:
            self._set_status(t("SettingsPage.couldNotReadFile"))
            return

        try:
            with self.session_factory() as db:
                templates, instances = backup_service.restore_from_json(db, content)
        except backup_service.BackupValidationError as err:
            self._set_status(t("SettingsPage.restoreFailed", error=err))
            return

        self._set_status(t("SettingsPage.restored", templates=templates, instances=instances))
        self.refresh()

    def _restore_snapshot(self, e):
        try:
            with self.session_factory() as db:
                templates, instances = backup_service.restore_from_snapshot(db)
        except backup_service.BackupValidationError as err:
            self._set_status(t("SettingsPage.restoreFailed", error=err))
            return
        self._set_status(
            t("SettingsPage.restoredFromSnapshot", templates=templates, instances=instances)
        )
        self.refresh()
