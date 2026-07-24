"""Test fixtures: SQLite (in-memory) + FastAPI TestClient."""

# Import models before app to (a) register them in Base.metadata for create_all
# and (b) avoid shadowing the `app` FastAPI instance with the `app` package name.
import app.models.bill  # noqa: F401
import app.models.reset_token  # noqa: F401
import app.models.restore_snapshot  # noqa: F401
import app.models.user  # noqa: F401

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import app


@pytest.fixture(scope="session")
def db_engine():
    # In-memory SQLite; StaticPool keeps the same connection (and thus the
    # same database) alive across the session-scoped engine's lifetime.
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    yield engine


@pytest.fixture()
def db_tables(db_engine):
    Base.metadata.create_all(bind=db_engine)
    yield
    Base.metadata.drop_all(bind=db_engine)


@pytest.fixture()
def db_session(db_engine, db_tables):
    Session = sessionmaker(bind=db_engine, autocommit=False, autoflush=False)
    db = Session()
    yield db
    db.close()


@pytest.fixture()
def db_sessionmaker(db_engine, db_tables):
    return sessionmaker(bind=db_engine, autocommit=False, autoflush=False)


@pytest.fixture()
def client(db_engine):
    Base.metadata.create_all(bind=db_engine)
    _SessionLocal = sessionmaker(bind=db_engine, autocommit=False, autoflush=False)

    def _override_get_db():
        db = _SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=db_engine)


@pytest.fixture()
def client_db(db_engine):
    """TestClient + direct DB session sharing the same engine."""
    Base.metadata.create_all(bind=db_engine)
    SessionLocal = sessionmaker(bind=db_engine, autocommit=False, autoflush=False)

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        db = SessionLocal()
        yield c, db
        db.close()
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=db_engine)


def register_and_login(
    client: TestClient, email: str, password: str = "pw123456"
) -> str:
    """Register a user and return their Bearer token."""
    r = client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def sync_payments(client: TestClient, token: str, month: str | None = None) -> None:
    """Seed payment instances for the current month (or a given month), then return."""
    from datetime import date as _date

    target = month or _date.today().strftime("%Y-%m")
    r = client.post(f"/bills/sync-instances?month={target}", headers=auth(token))
    assert r.status_code == 204, r.text
