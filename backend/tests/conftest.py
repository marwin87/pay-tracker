"""Test fixtures: PostgreSQL via testcontainers + FastAPI TestClient."""

# Import models before app to (a) register them in Base.metadata for create_all
# and (b) avoid shadowing the `app` FastAPI instance with the `app` package name.
import app.models.bill  # noqa: F401
import app.models.user  # noqa: F401

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

from app.core.database import Base, get_db
from app.main import app


@pytest.fixture(scope="session")
def postgres_engine():
    with PostgresContainer("postgres:17") as pg:
        engine = create_engine(pg.get_connection_url(), poolclass=NullPool)
        yield engine


@pytest.fixture()
def db_tables(postgres_engine):
    Base.metadata.create_all(bind=postgres_engine)
    yield
    Base.metadata.drop_all(bind=postgres_engine)


@pytest.fixture()
def db_session(postgres_engine, db_tables):
    Session = sessionmaker(bind=postgres_engine, autocommit=False, autoflush=False)
    db = Session()
    yield db
    db.close()


@pytest.fixture()
def db_sessionmaker(postgres_engine, db_tables):
    return sessionmaker(bind=postgres_engine, autocommit=False, autoflush=False)


@pytest.fixture()
def client(postgres_engine):
    Base.metadata.create_all(bind=postgres_engine)
    _SessionLocal = sessionmaker(
        bind=postgres_engine, autocommit=False, autoflush=False
    )

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
    Base.metadata.drop_all(bind=postgres_engine)


def register_and_login(
    client: TestClient, email: str, password: str = "pw123456"
) -> str:
    """Register a user and return their Bearer token."""
    r = client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
