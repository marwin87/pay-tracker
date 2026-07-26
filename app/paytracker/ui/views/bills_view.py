from __future__ import annotations

import calendar
from datetime import date as date_cls
from decimal import Decimal, InvalidOperation

import flet as ft
from sqlalchemy.orm import sessionmaker

from paytracker.data.models import BillCategory, BillFrequency, BillTemplate
from paytracker.services import bills as bills_service
from paytracker.services import payments as payments_service
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
    styled_dropdown,
    styled_text_field,
)
from paytracker.ui.i18n import t

_FREQUENCY_KEYS = {
    BillFrequency.monthly: "Frequency.monthly",
    BillFrequency.every_2_months: "Frequency.every2Months",
    BillFrequency.quarterly: "Frequency.quarterly",
    BillFrequency.annual: "Frequency.annual",
    BillFrequency.one_off: "Frequency.oneOff",
}


def frequency_label(frequency: BillFrequency) -> str:
    return t(_FREQUENCY_KEYS[frequency])


class BillsView(ft.Column):
    def __init__(self, page: ft.Page, session_factory: sessionmaker):
        super().__init__(expand=True, spacing=20, scroll=ft.ScrollMode.AUTO)
        self._isolated = True  # this control calls self.update() from its own methods
        self._page = page
        self._mounted = False
        self.session_factory = session_factory
        self._collapsed: set[BillCategory] = set()
        self.list_container = ft.Column(spacing=14)
        self._editing_id: int | None = None
        self.header = page_header(ft.Icons.RECEIPT_LONG, t("Nav.bills"))
        self.new_bill_button = ft.ElevatedButton(
            content=ft.Text(""),
            icon=ft.Icons.ADD,
            on_click=self._show_create_form,
            style=rounded_button_style(),
        )

        self.controls = [
            ft.Row(
                [self.header, self.new_bill_button],
                alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                vertical_alignment=ft.CrossAxisAlignment.START,
            ),
            self.list_container,
        ]

    def did_mount(self):
        self._mounted = True
        self.refresh()

    def will_unmount(self):
        self._mounted = False

    def refresh(self):
        self.header = page_header(ft.Icons.RECEIPT_LONG, t("Nav.bills"))
        self.controls[0].controls[0] = self.header
        self.new_bill_button.content.value = t("BillsPage.newBill")

        with self.session_factory() as db:
            templates = bills_service.list_bills(db, include_archived=False)
            grouped = group_by_category(templates, lambda tpl: BillCategory(tpl.category))

            groups: list[ft.Control] = []
            for category in CATEGORY_ORDER:
                items = grouped.get(category)
                if not items:
                    continue
                groups.append(
                    ft.ExpansionTile(
                        shape=no_divider_shape(),
                        collapsed_shape=no_divider_shape(),
                        leading=ft.Container(
                            width=10, height=10, bgcolor=category_color(category), border_radius=5
                        ),
                        title=ft.Row(
                            [
                                ft.Icon(category_icon(category), size=16, color=category_color(category)),
                                ft.Text(category_label(category), size=14, weight=ft.FontWeight.BOLD),
                            ],
                            spacing=8,
                        ),
                        expanded=category not in self._collapsed,
                        on_change=lambda e, c=category: self._toggle_category(c, e.control.expanded),
                        controls=[self._bill_row(db, bill) for bill in items],
                    )
                )

            if not templates:
                groups = [empty_state(ft.Icons.RECEIPT_LONG, t("BillsPage.empty"))]

            self.list_container.controls = groups
        if self._mounted:
            self.update()

    def _toggle_category(self, category: BillCategory, expanded: bool):
        if expanded:
            self._collapsed.discard(category)
        else:
            self._collapsed.add(category)

    def _bill_row(self, db, bill) -> ft.Control:
        has_deleted_future = payments_service.has_deleted_future(db, bill.id)
        subtitle = (
            f"{bill.amount} {bill.currency} · {frequency_label(BillFrequency(bill.frequency))}"
            + (t("BillsPage.dueDay", day=bill.due_day) if bill.due_day else "")
            + (t("BillsPage.paused") if bill.is_paused else "")
        )
        actions = [
            ft.IconButton(
                icon=ft.Icons.EDIT,
                tooltip=t("BillsPage.editTooltip"),
                on_click=lambda e, b=bill: self._show_edit_form(b),
            ),
            ft.IconButton(
                icon=ft.Icons.ARCHIVE,
                tooltip=t("BillsPage.archiveTooltip"),
                on_click=lambda e, b=bill: self._archive(b),
            ),
        ]
        if has_deleted_future:
            actions.append(
                ft.IconButton(
                    icon=ft.Icons.RESTORE,
                    tooltip=t("BillsPage.restoreTooltip"),
                    on_click=lambda e, b=bill: self._restore_deleted_future(b),
                )
            )
        accent_color = category_color(BillCategory(bill.category))
        row = ft.Row(
            [
                ft.Column(
                    [
                        ft.Text(bill.name, weight=ft.FontWeight.BOLD, size=15),
                        ft.Text(subtitle, size=12, color=ft.Colors.ON_SURFACE_VARIANT),
                    ],
                    spacing=2,
                    expand=True,
                ),
                ft.Row(actions, spacing=0),
            ],
            alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
        )
        return ft.Container(
            padding=ft.Padding(left=16, right=8, top=4, bottom=4),
            content=soft_card(row, accent=accent_color),
        )

    def _archive(self, bill):
        with self.session_factory() as db:
            b = db.get(type(bill), bill.id)
            bills_service.archive_bill(db, b)
        self.refresh()

    def _restore_deleted_future(self, bill):
        with self.session_factory() as db:
            b = db.get(type(bill), bill.id)
            bills_service.update_bill(db, b, {}, recreate_deleted_future=True)
        self.refresh()
        self._snack(t("BillsPage.futureRestored"))

    def _snack(self, message: str):
        if self._page:
            snack = ft.SnackBar(ft.Text(message), open=True)
            self._page.overlay.append(snack)
            self._page.update()

    def _open_day_picker(self, current: int | None, on_select):
        """Flet's native Material calendar (month grid, weekday headers,
        month/year navigation). due_day itself only stores a day-of-month
        (re-anchored to whatever period a recurring instance falls in, no
        fixed month/year), so only .day from the picked date is kept —
        the calendar is shown for a real month purely as a picking surface."""
        today = date_cls.today()
        if current:
            last_day_of_month = calendar.monthrange(today.year, today.month)[1]
            preview_date = date_cls(today.year, today.month, min(current, last_day_of_month))
        else:
            preview_date = today

        def handle_change(e):
            self._page.pop_dialog()
            picked = e.control.value
            if picked:
                on_select(picked.day)

        picker = ft.DatePicker(
            current_date=preview_date,
            value=preview_date,
            entry_mode=ft.DatePickerEntryMode.CALENDAR_ONLY,
            on_change=handle_change,
        )
        self._page.show_dialog(picker)

    # ── create / edit dialog ─────────────────────────────────────────────

    def _show_create_form(self, e=None):
        self._editing_id = None
        self._open_form_dialog()

    def _show_edit_form(self, bill):
        self._editing_id = bill.id
        self._open_form_dialog(bill)

    def _open_form_dialog(self, bill=None):
        name_field = styled_text_field(
            label=t("BillTemplateForm.name"), value=bill.name if bill else ""
        )
        amount_field = styled_text_field(
            label=t("BillTemplateForm.amount"), value=str(bill.amount) if bill else "", expand=True
        )
        currency_field = styled_text_field(
            label=t("BillTemplateForm.currency"), value=bill.currency if bill else "PLN", width=110
        )
        category_dd = styled_dropdown(
            label=t("BillTemplateForm.category"),
            value=(bill.category if bill else BillCategory.other.value),
            options=[
                ft.DropdownOption(key=c.value, text=category_label(c)) for c in CATEGORY_ORDER
            ],
            expand=True,
        )
        frequency_dd = styled_dropdown(
            label=t("BillTemplateForm.frequency"),
            value=(bill.frequency if bill else BillFrequency.monthly.value),
            options=[
                ft.DropdownOption(key=f.value, text=frequency_label(f))
                for f in _FREQUENCY_KEYS
            ],
            expand=True,
        )
        due_day_state = {"value": bill.due_day if bill else None}
        due_day_field = styled_text_field(
            label=t("BillTemplateForm.dueDay"),
            value=str(due_day_state["value"]) if due_day_state["value"] else "",
            width=160,
            read_only=True,
            suffix_icon=ft.Icons.CALENDAR_MONTH,
        )

        def _on_due_day_selected(day: int | None):
            due_day_state["value"] = day
            due_day_field.value = str(day) if day else ""
            due_day_field.update()

        due_day_field.on_click = lambda e: self._open_day_picker(
            due_day_state["value"], _on_due_day_selected
        )
        notes_field = styled_text_field(
            label=t("BillTemplateForm.notes"),
            value=bill.notes if bill else "",
            multiline=True,
            min_lines=1,
            max_lines=2,
        )
        paused_checkbox = ft.Checkbox(
            label=t("BillTemplateForm.pauseRecurrence"), value=bill.is_paused if bill else False
        )
        error_text = ft.Text("", color=ft.Colors.RED, size=12)

        def save(e):
            try:
                amount = Decimal(amount_field.value or "0")
            except InvalidOperation:
                error_text.value = t("BillTemplateForm.amountNotNumber")
                dialog.update()
                return
            if not name_field.value:
                error_text.value = t("BillTemplateForm.nameRequired")
                dialog.update()
                return
            due_day = due_day_state["value"]

            with self.session_factory() as db:
                if self._editing_id is not None:
                    existing = db.get(BillTemplate, self._editing_id)
                    bills_service.update_bill(
                        db,
                        existing,
                        {
                            "name": name_field.value,
                            "amount": amount,
                            "currency": currency_field.value or "PLN",
                            "category": category_dd.value,
                            "frequency": frequency_dd.value,
                            "due_day": due_day,
                            "notes": notes_field.value or None,
                            "is_paused": paused_checkbox.value,
                        },
                    )
                else:
                    bills_service.create_bill(
                        db,
                        name=name_field.value,
                        category=BillCategory(category_dd.value),
                        frequency=BillFrequency(frequency_dd.value),
                        amount=amount,
                        currency=currency_field.value or "PLN",
                        due_day=due_day,
                        notes=notes_field.value or None,
                        is_paused=paused_checkbox.value,
                    )

            self._page.pop_dialog()
            self.refresh()

        dialog = ft.AlertDialog(
            modal=True,
            shape=ft.RoundedRectangleBorder(radius=CARD_RADIUS + 4),
            title_padding=ft.Padding(left=22, right=22, top=12, bottom=0),
            content_padding=ft.Padding(left=22, right=22, top=18, bottom=0),
            actions_padding=ft.Padding(left=22, right=22, top=0, bottom=10),
            title=ft.Row(
                [
                    ft.Container(
                        width=32,
                        height=32,
                        border_radius=10,
                        alignment=ft.Alignment.CENTER,
                        gradient=ft.LinearGradient(
                            begin=ft.Alignment.TOP_LEFT,
                            end=ft.Alignment.BOTTOM_RIGHT,
                            colors=[ft.Colors.PRIMARY, ft.Colors.TERTIARY],
                        ),
                        content=ft.Icon(ft.Icons.RECEIPT_LONG, color=ft.Colors.WHITE, size=16),
                    ),
                    ft.Text(
                        t("BillTemplateForm.editTitle") if bill else t("BillTemplateForm.newTitle"),
                        weight=ft.FontWeight.BOLD,
                        size=16,
                    ),
                ],
                spacing=10,
            ),
            content=ft.Column(
                [
                    name_field,
                    ft.Row([amount_field, currency_field, due_day_field], spacing=10),
                    ft.Row([category_dd, frequency_dd], spacing=10),
                    notes_field,
                    paused_checkbox,
                    error_text,
                ],
                spacing=8,
                tight=True,
                width=520,
            ),
            actions=[
                ft.TextButton(t("Common.cancel"), on_click=lambda e: self._page.pop_dialog()),
                ft.ElevatedButton(t("Common.save"), on_click=save, style=rounded_button_style()),
            ],
        )
        self._page.show_dialog(dialog)
