from __future__ import annotations

import flet as ft
from sqlalchemy.orm import sessionmaker

from paytracker.services import settings as settings_service
from paytracker.ui import i18n
from paytracker.ui.i18n import t
from paytracker.ui.views.archived_bills_view import ArchivedBillsView
from paytracker.ui.views.bills_view import BillsView
from paytracker.ui.views.payments_view import PaymentsView
from paytracker.ui.views.settings_view import SettingsView

# Matches the old web app's emerald-green brand accent (Tailwind emerald-600).
_BRAND_SEED_COLOR = "#059669"

_THEME_MODES = {
    "light": ft.ThemeMode.LIGHT,
    "dark": ft.ThemeMode.DARK,
    "system": ft.ThemeMode.SYSTEM,
}


def _apply_theme(page: ft.Page, theme_mode: str) -> None:
    page.theme = ft.Theme(color_scheme_seed=_BRAND_SEED_COLOR, use_material3=True)
    page.dark_theme = ft.Theme(color_scheme_seed=_BRAND_SEED_COLOR, use_material3=True)
    page.theme_mode = _THEME_MODES.get(theme_mode, ft.ThemeMode.SYSTEM)

    page.window.width = 1800
    page.window.height = 1200
    page.window.min_width = 1400
    page.window.min_height = 800
    page.run_task(page.window.center)


def _nav_icon(icon: str, *, active: bool) -> ft.Control:
    """Muted gray when inactive, white-on-brand-pill when active — replaces
    Flutter's flat default (near-black) unselected icon color."""
    if active:
        return ft.Container(
            width=32,
            height=32,
            border_radius=10,
            bgcolor=ft.Colors.PRIMARY,
            alignment=ft.Alignment.CENTER,
            content=ft.Icon(icon, size=18, color=ft.Colors.ON_PRIMARY),
        )
    return ft.Icon(icon, size=20, color=ft.Colors.ON_SURFACE_VARIANT)


def build_app(page: ft.Page, session_factory: sessionmaker) -> None:
    page.title = "Pay Tracker"
    page.padding = 0
    page.bgcolor = ft.Colors.SURFACE_CONTAINER_LOWEST

    with session_factory() as db:
        settings_row = settings_service.get_settings(db)
        i18n.set_language(settings_row.language_preference)
        _apply_theme(page, settings_row.theme_mode)

    payments_view = PaymentsView(page, session_factory)
    bills_view = BillsView(page, session_factory)
    archived_view = ArchivedBillsView(page, session_factory)

    nav_labels = [ft.Text(t("Nav.payments"), size=11), ft.Text(t("Nav.bills"), size=11), ft.Text(t("Nav.archived"), size=11)]
    nav_icons = [ft.Icons.PAYMENTS_ROUNDED, ft.Icons.RECEIPT_LONG_ROUNDED, ft.Icons.ARCHIVE_ROUNDED]

    def refresh_other_views():
        payments_view.refresh()
        bills_view.refresh()
        archived_view.refresh()
        for label, key in zip(nav_labels, ["Nav.payments", "Nav.bills", "Nav.archived"]):
            label.value = t(key)
        settings_label.value = t("Nav.settings")
        page.update()

    settings_view = SettingsView(page, session_factory, on_language_change=refresh_other_views)

    body = ft.Container(
        content=payments_view, expand=True, padding=28, alignment=ft.Alignment.TOP_LEFT
    )

    views = {0: payments_view, 1: bills_view, 2: archived_view}
    active_index = {"value": 0}  # 0-2 = main views, "settings" = settings page

    nav_buttons: list[ft.Container] = []

    def _select(index_or_settings):
        active_index["value"] = index_or_settings
        for i, btn in enumerate(nav_buttons):
            btn.content.controls[0] = _nav_icon(nav_icons[i], active=index_or_settings == i)
        settings_button.content.controls[0] = _nav_icon(
            ft.Icons.SETTINGS_ROUNDED, active=index_or_settings == "settings"
        )
        if index_or_settings == "settings":
            body.content = settings_view
        else:
            body.content = views[index_or_settings]
        page.update()

    _RAIL_WIDTH = 100

    def _nav_button(index: int) -> ft.Container:
        return ft.Container(
            width=_RAIL_WIDTH,
            alignment=ft.Alignment.CENTER,
            padding=ft.Padding(left=0, right=0, top=8, bottom=8),
            on_click=lambda e, i=index: _select(i),
            content=ft.Column(
                [_nav_icon(nav_icons[index], active=index == 0), nav_labels[index]],
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                alignment=ft.MainAxisAlignment.CENTER,
                spacing=4,
                tight=True,
            ),
        )

    for i in range(3):
        nav_buttons.append(_nav_button(i))

    settings_label = ft.Text(t("Nav.settings"), size=11, text_align=ft.TextAlign.CENTER)
    settings_button = ft.Container(
        width=_RAIL_WIDTH,
        alignment=ft.Alignment.CENTER,
        padding=ft.Padding(left=0, right=0, top=8, bottom=20),
        on_click=lambda e: _select("settings"),
        content=ft.Column(
            [_nav_icon(ft.Icons.SETTINGS_ROUNDED, active=False), settings_label],
            horizontal_alignment=ft.CrossAxisAlignment.CENTER,
            alignment=ft.MainAxisAlignment.CENTER,
            spacing=4,
            tight=True,
        ),
    )

    rail = ft.Container(
        width=_RAIL_WIDTH,
        bgcolor=ft.Colors.SURFACE_CONTAINER_LOW,
        content=ft.Column(
            [
                ft.Container(
                    width=_RAIL_WIDTH,
                    alignment=ft.Alignment.CENTER,
                    padding=ft.Padding(left=0, right=0, top=20, bottom=24),
                    content=ft.Column(
                        [
                            ft.Image(
                                src="pt-logo.png",
                                width=44,
                                height=44,
                                fit=ft.BoxFit.COVER,
                                border_radius=13,
                            ),
                            ft.Text(
                                "Pay Tracker",
                                size=11,
                                weight=ft.FontWeight.BOLD,
                                color=_BRAND_SEED_COLOR,
                                text_align=ft.TextAlign.CENTER,
                            ),
                        ],
                        horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                        alignment=ft.MainAxisAlignment.CENTER,
                        spacing=6,
                        tight=True,
                    ),
                ),
                ft.Column(nav_buttons, spacing=4),
                ft.Container(expand=True),
                settings_button,
            ],
            expand=True,
        ),
    )

    page.add(
        ft.Row(
            [rail, body],
            expand=True,
            spacing=0,
        )
    )
    page.update()
