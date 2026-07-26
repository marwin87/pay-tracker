from __future__ import annotations

from sqlalchemy.orm import Session

from paytracker.data.models import Settings

_SINGLETON_ID = 1


def get_settings(db: Session) -> Settings:
    """Get-or-create the single settings row."""
    row = db.get(Settings, _SINGLETON_ID)
    if row is None:
        row = Settings(id=_SINGLETON_ID)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def update_settings(db: Session, **fields) -> Settings:
    row = get_settings(db)
    for key, value in fields.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row
