from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation

import flet as ft
from sqlalchemy.orm import sessionmaker

from paytracker.data.models import BillCategory, PaymentStatus
from paytracker.services import payments as payments_service
from paytracker.services import xlsx_export
from paytracker.ui.categories import (
    CATEGORY_ORDER,
    category_color,
    category_icon,
    category_label,
    empty_state,
    group_by_category,
)
from paytracker.ui.components import (
    CARD_RADIUS,
    no_divider_shape,
    page_header,
    rounded_button_style,
    soft_card,
    stat_card,
)
from paytracker.ui.i18n import t

_STATUS_COLORS = {
    PaymentStatus.upcoming: ft.Colors.BLUE_GREY,
    PaymentStatus.overdue: ft.Colors.RED,
    PaymentStatus.paid: ft.Colors.GREEN,
}

_STATUS_ICONS = {
    PaymentStatus.upcoming: ft.Icons.SCHEDULE,
    PaymentStatus.overdue: ft.Icons.WARNING_AMBER,
    PaymentStatus.paid: ft.Icons.CHECK_CIRCLE,
}

_STATUS_KEYS = {
    PaymentStatus.upcoming: "Status.upcoming",
    PaymentStatus.overdue: "Status.overdue",
    PaymentStatus.paid: "Status.paid",
}


def _border_all(width: int, color: str) -> ft.Border:
    side = ft.BorderSide(width, color)
    return ft.Border(top=side, right=side, bottom=side, left=side)


def _shift_month(period: str, delta: int) -> str:
    year, month = map(int, period.split("-"))
    month += delta
    while month > 12:
        month -= 12
        year += 1
    while month < 1:
        month += 12
        year -= 1
    return f"{year:04d}-{month:02d}"


class PaymentsView(ft.Column):
    def __init__(self, page: ft.Page, session_factory: sessionmaker):
        super().__init__(expand=True, spacing=20, scroll=ft.ScrollMode.AUTO)
        self._isolated = True  # this control calls self.update() from its own methods
        self._page = page
        self._mounted = False
        self.session_factory = session_factory
        self.current_period = date.today().strftime("%Y-%m")
        # Category collapse state persists for the life of the running app
        # (not across restarts) — reset lets a category start expanded the
        # first time it's seen, matching the old web app's default.
        self._collapsed: set[BillCategory] = set()

        # FilePicker is a self-registering Service control (see
        # flet.controls.services.service.Service.init) — it attaches itself
        # to the current page automatically on construction. It must NOT be
        # added to page.overlay (that's for visual controls only).
        self.save_picker = ft.FilePicker()

        self.header = page_header(ft.Icons.PAYMENTS, t("Nav.payments"))
        self.export_button = ft.ElevatedButton(
            content=ft.Text(""),
            icon=ft.Icons.TABLE_CHART,
            on_click=self._export_xlsx,
            style=rounded_button_style(),
        )
        self.stats_row = ft.Row(spacing=16)
        self.year_label = ft.Text(size=16, weight=ft.FontWeight.BOLD)
        self.month_strip = ft.Row(spacing=4, scroll=ft.ScrollMode.AUTO)
        self.list_container = ft.Column(spacing=14)

        self.controls = [
            ft.Row(
                [self.header, self.export_button],
                alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                vertical_alignment=ft.CrossAxisAlignment.START,
            ),
            self.stats_row,
            ft.Container(
                padding=16,
                border_radius=CARD_RADIUS,
                bgcolor=ft.Colors.SURFACE_CONTAINER,
                content=ft.Column(
                    [
                        ft.Row(
                            [
                                ft.IconButton(icon=ft.Icons.CHEVRON_LEFT, on_click=lambda e: self._change_year(-1)),
                                self.year_label,
                                ft.IconButton(icon=ft.Icons.CHEVRON_RIGHT, on_click=lambda e: self._change_year(1)),
                            ],
                            alignment=ft.MainAxisAlignment.CENTER,
                        ),
                        self.month_strip,
                    ],
                    spacing=4,
                ),
            ),
            self.list_container,
        ]

    def did_mount(self):
        self._mounted = True
        self.refresh()

    def will_unmount(self):
        self._mounted = False

    def _change_year(self, delta: int):
        year, month = map(int, self.current_period.split("-"))
        self.current_period = f"{year + delta:04d}-{month:02d}"
        self.refresh()

    def _select_month(self, month: int):
        year, _ = map(int, self.current_period.split("-"))
        self.current_period = f"{year:04d}-{month:02d}"
        self.refresh()

    def _toggle_category(self, category: BillCategory, expanded: bool):
        if expanded:
            self._collapsed.discard(category)
        else:
            self._collapsed.add(category)

    def _build_month_strip(self):
        year, selected_month = map(int, self.current_period.split("-"))
        today = date.today()
        chips = []
        for month in range(1, 13):
            is_selected = month == selected_month
            is_current = year == today.year and month == today.month
            chips.append(
                ft.Container(
                    content=ft.Text(
                        t(f"Months.short.{month}"),
                        size=12,
                        weight=ft.FontWeight.BOLD if is_selected else ft.FontWeight.NORMAL,
                        color=ft.Colors.WHITE if is_selected else None,
                    ),
                    bgcolor=ft.Colors.PRIMARY if is_selected else None,
                    border=_border_all(1, ft.Colors.PRIMARY) if is_current and not is_selected else None,
                    padding=ft.Padding(left=12, right=12, top=8, bottom=8),
                    border_radius=10,
                    on_click=lambda e, m=month: self._select_month(m),
                )
            )
        self.month_strip.controls = chips

    def _build_stats(self, instances: list):
        totals: dict[PaymentStatus, Decimal] = {s: Decimal("0") for s in PaymentStatus}
        counts: dict[PaymentStatus, int] = {s: 0 for s in PaymentStatus}
        for inst in instances:
            status = payments_service.effective_status(inst)
            counts[status] += 1
            totals[status] += inst.amount

        self.stats_row.controls = [
            stat_card(
                ft.Icons.WARNING_AMBER,
                t("Status.overdue"),
                f"{counts[PaymentStatus.overdue]} · {totals[PaymentStatus.overdue]}",
                ft.Colors.RED,
            ),
            stat_card(
                ft.Icons.SCHEDULE,
                t("Status.upcoming"),
                f"{counts[PaymentStatus.upcoming]} · {totals[PaymentStatus.upcoming]}",
                ft.Colors.BLUE_GREY,
            ),
            stat_card(
                ft.Icons.CHECK_CIRCLE,
                t("Status.paid"),
                f"{counts[PaymentStatus.paid]} · {totals[PaymentStatus.paid]}",
                ft.Colors.GREEN,
            ),
        ]

    def refresh(self):
        self.header = page_header(ft.Icons.PAYMENTS, t("Nav.payments"))
        self.controls[0].controls[0] = self.header
        self.export_button.content.value = t("PaymentsPage.exportExcel")

        today_period = date.today().strftime("%Y-%m")
        year = self.current_period.split("-")[0]
        self.year_label.value = year + (
            t("PaymentsPage.currentSuffix") if self.current_period == today_period else ""
        )
        self._build_month_strip()

        with self.session_factory() as db:
            if self.current_period >= today_period:
                payments_service.sync_instances(db, self.current_period)
            instances = payments_service.list_payments(db, self.current_period)

            self._build_stats(instances)

            grouped = group_by_category(
                instances, lambda i: BillCategory(i.template.category)
            )
            groups: list[ft.Control] = []
            for category in CATEGORY_ORDER:
                items = grouped.get(category)
                if not items:
                    continue
                groups.append(self._category_section(category, items))

            if not instances:
                groups = [empty_state(ft.Icons.EVENT_AVAILABLE, t("PaymentsPage.empty"))]

            self.list_container.controls = groups
        if self._mounted:
            self.update()

    def _category_section(self, category: BillCategory, items: list) -> ft.Control:
        counts: dict[PaymentStatus, int] = {s: 0 for s in PaymentStatus}
        for inst in items:
            counts[payments_service.effective_status(inst)] += 1

        summary = ft.Row(
            [
                ft.Text(f"{counts[s]} {t(_STATUS_KEYS[s])}", size=11, color=_STATUS_COLORS[s])
                for s in (PaymentStatus.overdue, PaymentStatus.upcoming, PaymentStatus.paid)
                if counts[s]
            ],
            spacing=8,
        )

        color = category_color(category)
        return ft.ExpansionTile(
            shape=no_divider_shape(),
            collapsed_shape=no_divider_shape(),
            leading=ft.Container(
                width=10,
                height=10,
                bgcolor=color,
                border_radius=5,
            ),
            title=ft.Row(
                [
                    ft.Icon(category_icon(category), size=16, color=color),
                    ft.Text(category_label(category), size=14, weight=ft.FontWeight.BOLD),
                ],
                spacing=8,
            ),
            subtitle=summary,
            expanded=category not in self._collapsed,
            on_change=lambda e, c=category: self._toggle_category(c, e.control.expanded),
            controls=[self._payment_row(inst) for inst in items],
        )

    def _payment_row(self, inst) -> ft.Control:
        status = payments_service.effective_status(inst)
        due_today = inst.due_date == date.today() and status == PaymentStatus.upcoming
        badge_text = t("Status.dueToday") if due_today else t(_STATUS_KEYS[status])
        badge_icon = ft.Icons.TODAY if due_today else _STATUS_ICONS[status]
        badge_color = ft.Colors.ORANGE if due_today else _STATUS_COLORS[status]
        accent_color = category_color(BillCategory(inst.template.category))

        subtitle_parts = [
            t("PaymentsPage.due", date=inst.due_date.isoformat()),
            f"{inst.amount} {inst.template.currency}",
        ]
        if status == PaymentStatus.paid and inst.paid_amount is not None:
            if inst.paid_amount != inst.amount:
                subtitle_parts.append(
                    t("PaymentsPage.mismatch", paid=inst.paid_amount, expected=inst.amount)
                )
            else:
                subtitle_parts.append(t("PaymentsPage.paidAmount", amount=inst.paid_amount))
        if inst.notes:
            subtitle_parts.append(t("PaymentsPage.note", note=inst.notes))

        actions: list[ft.Control] = []
        if status == PaymentStatus.paid:
            actions.append(
                ft.IconButton(
                    icon=ft.Icons.UNDO,
                    tooltip=t("PaymentsPage.revertTooltip"),
                    on_click=lambda e, i=inst: self._revert(i),
                )
            )
        else:
            actions.append(
                ft.IconButton(
                    icon=ft.Icons.CHECK,
                    tooltip=t("PaymentsPage.markPaidTooltip"),
                    on_click=lambda e, i=inst: self._show_mark_paid(i),
                )
            )
        actions.append(
            ft.IconButton(
                icon=ft.Icons.DELETE,
                tooltip=t("PaymentsPage.deleteTooltip"),
                on_click=lambda e, i=inst: self._show_delete(i),
            )
        )

        row = ft.Row(
            [
                ft.Column(
                    [
                        ft.Text(inst.template.name, weight=ft.FontWeight.BOLD, size=15),
                        ft.Text(" · ".join(subtitle_parts), size=12, color=ft.Colors.ON_SURFACE_VARIANT),
                    ],
                    spacing=2,
                    expand=True,
                ),
                ft.Container(
                    content=ft.Row(
                        [
                            ft.Icon(badge_icon, size=13, color=ft.Colors.WHITE),
                            ft.Text(badge_text, size=11, color=ft.Colors.WHITE, weight=ft.FontWeight.W_600),
                        ],
                        spacing=4,
                        tight=True,
                    ),
                    bgcolor=badge_color,
                    padding=ft.Padding(left=10, right=10, top=6, bottom=6),
                    border_radius=20,
                ),
                ft.Row(actions, spacing=0),
            ],
            alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
        )

        return ft.Container(
            padding=ft.Padding(left=16, right=8, top=4, bottom=4),
            content=soft_card(row, accent=accent_color),
        )

    def _revert(self, inst):
        with self.session_factory() as db:
            from paytracker.data.models import PaymentInstance

            fresh = db.get(PaymentInstance, inst.id)
            payments_service.revert_payment(db, fresh)
        self.refresh()

    async def _export_xlsx(self, e):
        year = int(self.current_period.split("-")[0])
        with self.session_factory() as db:
            data = xlsx_export.export_xlsx_bytes(db, year=year)
        await self.save_picker.save_file(file_name=f"pay-tracker-{year}.xlsx", src_bytes=data)
        self._snack(t("PaymentsPage.excelExported"))

    def _snack(self, message: str):
        if self._page:
            snack = ft.SnackBar(ft.Text(message), open=True)
            self._page.overlay.append(snack)
            self._page.update()

    def _show_mark_paid(self, inst):
        amount_field = ft.TextField(
            label=t("PaymentsPage.paidAmountLabel"), value=str(inst.amount), width=200
        )
        notes_field = ft.TextField(label=t("PaymentsPage.notesOptionalLabel"), multiline=True)
        error_text = ft.Text("", color=ft.Colors.RED)

        def confirm(e):
            try:
                paid_amount = Decimal(amount_field.value) if amount_field.value else None
            except InvalidOperation:
                error_text.value = t("PaymentsPage.amountNotNumber")
                dialog.update()
                return
            with self.session_factory() as db:
                from paytracker.data.models import PaymentInstance

                fresh = db.get(PaymentInstance, inst.id)
                payments_service.mark_paid(
                    db, fresh, paid_amount=paid_amount, notes=notes_field.value or None
                )
            self._page.pop_dialog()
            self.refresh()

        dialog = ft.AlertDialog(
            modal=True,
            shape=ft.RoundedRectangleBorder(radius=CARD_RADIUS),
            title=ft.Text(t("PaymentsPage.markPaidTitle", name=inst.template.name)),
            content=ft.Column([amount_field, notes_field, error_text], tight=True, spacing=8),
            actions=[
                ft.TextButton(t("Common.cancel"), on_click=lambda e: self._page.pop_dialog()),
                ft.ElevatedButton(
                    t("Common.confirm"), on_click=confirm, style=rounded_button_style()
                ),
            ],
        )
        self._page.show_dialog(dialog)

    def _show_delete(self, inst):
        cascade_checkbox = ft.Checkbox(label=t("PaymentsPage.deleteFutureCheckbox"))

        def confirm(e):
            with self.session_factory() as db:
                from paytracker.data.models import PaymentInstance

                fresh = db.get(PaymentInstance, inst.id)
                payments_service.delete_payment(db, fresh, delete_future=cascade_checkbox.value)
            self._page.pop_dialog()
            self.refresh()

        dialog = ft.AlertDialog(
            modal=True,
            shape=ft.RoundedRectangleBorder(radius=CARD_RADIUS),
            title=ft.Text(t("PaymentsPage.deleteTitle", name=inst.template.name)),
            content=ft.Column([cascade_checkbox], tight=True),
            actions=[
                ft.TextButton(t("Common.cancel"), on_click=lambda e: self._page.pop_dialog()),
                ft.ElevatedButton(
                    t("Common.delete"),
                    on_click=confirm,
                    color=ft.Colors.RED,
                    style=rounded_button_style(),
                ),
            ],
        )
        self._page.show_dialog(dialog)
