from __future__ import annotations

import flet as ft
from sqlalchemy.orm import sessionmaker

from paytracker.data.models import BillCategory, BillFrequency
from paytracker.services import bills as bills_service
from paytracker.ui.categories import (
    CATEGORY_ORDER,
    category_color,
    category_icon,
    category_label,
    empty_state,
    group_by_category,
)
from paytracker.ui.components import no_divider_shape, page_header, soft_card
from paytracker.ui.i18n import t
from paytracker.ui.views.bills_view import frequency_label


class ArchivedBillsView(ft.Column):
    def __init__(self, page: ft.Page, session_factory: sessionmaker):
        super().__init__(expand=True, spacing=20, scroll=ft.ScrollMode.AUTO)
        self._isolated = True  # this control calls self.update() from its own methods
        self._page = page
        self._mounted = False
        self.session_factory = session_factory
        self._collapsed: set[BillCategory] = set()
        self.header = page_header(ft.Icons.ARCHIVE, t("Nav.archived"))
        self.list_container = ft.Column(spacing=14)
        self.controls = [
            self.header,
            self.list_container,
        ]

    def did_mount(self):
        self._mounted = True
        self.refresh()

    def will_unmount(self):
        self._mounted = False

    def _toggle_category(self, category: BillCategory, expanded: bool):
        if expanded:
            self._collapsed.discard(category)
        else:
            self._collapsed.add(category)

    def refresh(self):
        self.header = page_header(ft.Icons.ARCHIVE, t("Nav.archived"))
        self.controls[0] = self.header

        with self.session_factory() as db:
            all_bills = bills_service.list_bills(db, include_archived=True)
            archived = [b for b in all_bills if b.is_archived]
            grouped = group_by_category(archived, lambda tpl: BillCategory(tpl.category))

            groups: list[ft.Control] = []
            for category in CATEGORY_ORDER:
                items = grouped.get(category)
                if not items:
                    continue
                accent_color = category_color(category)
                rows = []
                for bill in items:
                    subtitle = (
                        f"{bill.amount} {bill.currency} · "
                        f"{frequency_label(BillFrequency(bill.frequency))}"
                    )
                    row = ft.Column(
                        [
                            ft.Text(bill.name, weight=ft.FontWeight.BOLD, size=15),
                            ft.Text(subtitle, size=12, color=ft.Colors.ON_SURFACE_VARIANT),
                        ],
                        spacing=2,
                    )
                    rows.append(
                        ft.Container(
                            padding=ft.Padding(left=16, right=8, top=4, bottom=4),
                            opacity=0.65,
                            content=soft_card(row, accent=accent_color),
                        )
                    )
                groups.append(
                    ft.ExpansionTile(
                        shape=no_divider_shape(),
                        collapsed_shape=no_divider_shape(),
                        leading=ft.Container(
                            width=10, height=10, bgcolor=accent_color, border_radius=5
                        ),
                        title=ft.Row(
                            [
                                ft.Icon(category_icon(category), size=16, color=accent_color),
                                ft.Text(category_label(category), size=14, weight=ft.FontWeight.BOLD),
                            ],
                            spacing=8,
                        ),
                        expanded=category not in self._collapsed,
                        on_change=lambda e, c=category: self._toggle_category(c, e.control.expanded),
                        controls=rows,
                    )
                )

            if not archived:
                groups = [empty_state(ft.Icons.ARCHIVE, t("ArchivedPage.empty"))]

            self.list_container.controls = groups
        if self._mounted:
            self.update()
