"""per_user_categories

Revision ID: c1d2e3f4a5b6
Revises: b6c2cdd3cc82
Create Date: 2026-09-22

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = "b6c2cdd3cc82"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Mirrors app.services.categories.DEFAULT_CATEGORIES — duplicated here (not
# imported) because migrations must stay runnable as a frozen snapshot even
# if the app-code constant changes later.
_DEFAULT_CATEGORIES = [
    ("education", "Education", "blue", 0),
    ("entertainment", "Entertainment", "purple", 1),
    ("healthcare", "Healthcare", "rose", 2),
    ("housing", "Housing", "orange", 3),
    ("insurance", "Insurance", "slate", 4),
    ("subscriptions", "Subscriptions", "violet", 5),
    ("transport", "Transport", "cyan", 6),
    ("utilities", "Utilities", "emerald", 7),
    ("other", "Other", "slate-light", 8),
]


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("slug", sa.String(50), nullable=True),
        sa.Column("color", sa.String(50), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("is_archived", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Seed the starter category set for every existing user.
    values_sql = ",\n".join(
        f"('{slug}', '{name}', '{color}', {sort_order})"
        for slug, name, color, sort_order in _DEFAULT_CATEGORIES
    )
    op.execute(f"""
        INSERT INTO categories (user_id, name, slug, color, sort_order, is_default, is_archived, created_at)
        SELECT u.id, v.name, v.slug, v.color, v.sort_order, true, false, now()
        FROM users u
        CROSS JOIN (VALUES
            {values_sql}
        ) AS v(slug, name, color, sort_order)
        WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.user_id = u.id)
        """)

    op.add_column(
        "bill_templates", sa.Column("category_id", sa.Integer(), nullable=True)
    )
    op.execute("""
        UPDATE bill_templates bt
        SET category_id = COALESCE(
            (SELECT c.id FROM categories c WHERE c.user_id = bt.user_id AND c.slug = bt.category),
            (SELECT c.id FROM categories c WHERE c.user_id = bt.user_id AND c.slug = 'other')
        )
        """)
    op.alter_column("bill_templates", "category_id", nullable=False)
    op.create_foreign_key(
        "fk_bill_templates_category_id",
        "bill_templates",
        "categories",
        ["category_id"],
        ["id"],
    )
    op.drop_column("bill_templates", "category")


def downgrade() -> None:
    # Best-effort: collapses each bill back onto its category's slug (falling
    # back to 'other' for custom/renamed categories with no slug). Any
    # per-user category customization is discarded — this downgrade path is
    # for dev/test use, not for reverting a populated production DB.
    op.add_column("bill_templates", sa.Column("category", sa.String(50), nullable=True))
    op.execute("""
        UPDATE bill_templates bt
        SET category = COALESCE(
            (SELECT c.slug FROM categories c WHERE c.id = bt.category_id),
            'other'
        )
        """)
    op.alter_column("bill_templates", "category", nullable=False)
    op.drop_constraint(
        "fk_bill_templates_category_id", "bill_templates", type_="foreignkey"
    )
    op.drop_column("bill_templates", "category_id")
    op.drop_table("categories")
