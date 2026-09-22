from datetime import datetime

from pydantic import BaseModel


class CategoryOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    slug: str | None
    color: str
    sort_order: int
    is_default: bool
    is_archived: bool


class CategoryCreate(BaseModel):
    name: str
    color: str


class CategoryUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
