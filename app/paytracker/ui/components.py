from __future__ import annotations

import flet as ft

CARD_RADIUS = 16
CHIP_RADIUS = 20
BUTTON_RADIUS = 12

_SOFT_SHADOW = ft.BoxShadow(
    spread_radius=0,
    blur_radius=16,
    color=ft.Colors.with_opacity(0.08, ft.Colors.SHADOW),
    offset=ft.Offset(0, 4),
)


def soft_card(content: ft.Control, *, accent: str | None = None) -> ft.Control:
    """A layered, softly-shadowed surface — the base visual unit for rows
    across the app, replacing Material's flat default Card."""
    border = None
    if accent:
        border = ft.Border(left=ft.BorderSide(4, accent))
    return ft.Container(
        bgcolor=ft.Colors.SURFACE_CONTAINER,
        border_radius=CARD_RADIUS,
        border=border,
        padding=ft.Padding(left=18 if accent else 16, right=16, top=14, bottom=14),
        shadow=_SOFT_SHADOW,
        content=content,
    )


def page_header(icon: str, title: str, subtitle: str | None = None) -> ft.Control:
    children = [
        ft.Row(
            [
                ft.Container(
                    width=44,
                    height=44,
                    border_radius=13,
                    alignment=ft.Alignment.CENTER,
                    gradient=ft.LinearGradient(
                        begin=ft.Alignment.TOP_LEFT,
                        end=ft.Alignment.BOTTOM_RIGHT,
                        colors=[ft.Colors.PRIMARY, ft.Colors.TERTIARY],
                    ),
                    content=ft.Icon(icon, color=ft.Colors.WHITE, size=22),
                ),
                ft.Text(title, size=26, weight=ft.FontWeight.BOLD),
            ],
            spacing=14,
        ),
    ]
    if subtitle:
        children.append(ft.Text(subtitle, size=13, color=ft.Colors.ON_SURFACE_VARIANT))
    return ft.Column(children, spacing=6)


def stat_card(icon: str, label: str, value: str, color: str) -> ft.Control:
    return ft.Container(
        expand=True,
        padding=18,
        border_radius=CARD_RADIUS,
        shadow=_SOFT_SHADOW,
        gradient=ft.LinearGradient(
            begin=ft.Alignment.TOP_LEFT,
            end=ft.Alignment.BOTTOM_RIGHT,
            colors=[ft.Colors.with_opacity(0.16, color), ft.Colors.with_opacity(0.04, color)],
        ),
        content=ft.Column(
            [
                ft.Row(
                    [
                        ft.Container(
                            width=30,
                            height=30,
                            bgcolor=ft.Colors.with_opacity(0.9, color),
                            border_radius=9,
                            alignment=ft.Alignment.CENTER,
                            content=ft.Icon(icon, size=16, color=ft.Colors.WHITE),
                        ),
                        ft.Text(label, size=12, color=ft.Colors.ON_SURFACE_VARIANT),
                    ],
                    spacing=8,
                ),
                ft.Text(value, size=24, weight=ft.FontWeight.BOLD),
            ],
            spacing=10,
        ),
    )


def section_title(icon: str, title: str, color: str | None = None) -> ft.Control:
    return ft.Row(
        [
            ft.Icon(icon, size=18, color=color or ft.Colors.PRIMARY),
            ft.Text(title, weight=ft.FontWeight.BOLD, size=15),
        ],
        spacing=8,
    )


def rounded_button_style() -> ft.ButtonStyle:
    return ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=BUTTON_RADIUS))


_INPUT_RADIUS = 12


def _input_chrome() -> dict:
    """Shared filled/borderless chrome for text fields and dropdowns —
    flat Material outline inputs read as dated; this reads as a modern
    filled input with a brand-colored focus ring instead."""
    return dict(
        filled=True,
        fill_color=ft.Colors.SURFACE_CONTAINER_HIGHEST,
        border_radius=_INPUT_RADIUS,
        border_color=ft.Colors.TRANSPARENT,
        border_width=1,
        focused_border_color=ft.Colors.PRIMARY,
        focused_bgcolor=ft.Colors.SURFACE_CONTAINER_HIGHEST,
        content_padding=ft.Padding(left=14, right=14, top=10, bottom=10),
        text_size=14,
    )


def styled_text_field(**kwargs) -> ft.TextField:
    return ft.TextField(**_input_chrome(), **kwargs)


def styled_dropdown(**kwargs) -> ft.Dropdown:
    chrome = _input_chrome()
    del chrome["focused_bgcolor"]  # Dropdown has no focused_bgcolor field
    return ft.Dropdown(**chrome, **kwargs)


def form_section_label(text: str) -> ft.Control:
    return ft.Text(text.upper(), size=11, weight=ft.FontWeight.BOLD, color=ft.Colors.ON_SURFACE_VARIANT)


def no_divider_shape() -> ft.OutlinedBorder:
    """ExpansionTile draws a top/bottom divider line by default (Material's
    stock look) — pass this as both shape= and collapsed_shape= to suppress
    it for a cleaner, borderless section header."""
    return ft.RoundedRectangleBorder(side=ft.BorderSide(width=0, color=ft.Colors.TRANSPARENT))
