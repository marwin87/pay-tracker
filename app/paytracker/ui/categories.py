import flet as ft

from paytracker.data.models import BillCategory
from paytracker.ui.i18n import t

# Grouping/display order for category-grouped lists — ported from
# frontend/src/lib/categories.ts (CATEGORY_ORDER).
CATEGORY_ORDER: list[BillCategory] = [
    BillCategory.education,
    BillCategory.entertainment,
    BillCategory.healthcare,
    BillCategory.housing,
    BillCategory.insurance,
    BillCategory.subscriptions,
    BillCategory.transport,
    BillCategory.utilities,
    BillCategory.other,
]

_CATEGORY_KEYS: dict[BillCategory, str] = {
    BillCategory.education: "Categories.education",
    BillCategory.entertainment: "Categories.entertainment",
    BillCategory.healthcare: "Categories.healthcare",
    BillCategory.housing: "Categories.housing",
    BillCategory.insurance: "Categories.insurance",
    BillCategory.subscriptions: "Categories.subscriptions",
    BillCategory.transport: "Categories.transport",
    BillCategory.utilities: "Categories.utilities",
    BillCategory.other: "Categories.other",
}


# Accent colors — ported from frontend/src/lib/categories.ts (CATEGORY_BORDER),
# using the same Tailwind hex values so this reads as "the same app" as the
# old PWA rather than a generic Material palette.
CATEGORY_COLORS: dict[BillCategory, str] = {
    BillCategory.education: "#60A5FA",  # blue-400
    BillCategory.entertainment: "#C084FC",  # purple-400
    BillCategory.healthcare: "#FB7185",  # rose-400
    BillCategory.housing: "#FB923C",  # orange-400
    BillCategory.insurance: "#94A3B8",  # slate-400
    BillCategory.subscriptions: "#A78BFA",  # violet-400
    BillCategory.transport: "#06B6D4",  # cyan-500
    BillCategory.utilities: "#34D399",  # emerald-400
    BillCategory.other: "#CBD5E1",  # slate-300
}

CATEGORY_ICONS: dict[BillCategory, str] = {
    BillCategory.education: ft.Icons.SCHOOL,
    BillCategory.entertainment: ft.Icons.MOVIE,
    BillCategory.healthcare: ft.Icons.LOCAL_HOSPITAL,
    BillCategory.housing: ft.Icons.HOME,
    BillCategory.insurance: ft.Icons.SHIELD,
    BillCategory.subscriptions: ft.Icons.SUBSCRIPTIONS,
    BillCategory.transport: ft.Icons.DIRECTIONS_CAR,
    BillCategory.utilities: ft.Icons.BOLT,
    BillCategory.other: ft.Icons.CATEGORY,
}


def category_color(category: BillCategory) -> str:
    return CATEGORY_COLORS[category]


def category_icon(category: BillCategory) -> str:
    return CATEGORY_ICONS[category]


def category_label(category: BillCategory) -> str:
    """Resolved fresh on every call (not cached) so it always reflects the
    current language — CATEGORY_LABELS as a static dict would freeze at
    import time, before any language preference is even loaded."""
    return t(_CATEGORY_KEYS[category])


def empty_state(icon: str, message: str) -> ft.Control:
    return ft.Container(
        padding=ft.Padding(left=0, right=0, top=48, bottom=48),
        alignment=ft.Alignment.CENTER,
        content=ft.Column(
            [
                ft.Icon(icon, size=40, color=ft.Colors.OUTLINE),
                ft.Text(message, size=13, color=ft.Colors.ON_SURFACE_VARIANT, italic=True),
            ],
            horizontal_alignment=ft.CrossAxisAlignment.CENTER,
            spacing=8,
        ),
    )


def group_by_category(items: list, category_of) -> dict[BillCategory, list]:
    """Group items by category, in CATEGORY_ORDER, dropping empty groups."""
    buckets: dict[BillCategory, list] = {c: [] for c in CATEGORY_ORDER}
    for item in items:
        buckets[category_of(item)].append(item)
    return {c: v for c, v in buckets.items() if v}
