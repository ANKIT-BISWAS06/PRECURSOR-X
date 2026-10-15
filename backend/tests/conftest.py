"""
Pytest configuration and test database fixtures for PRECURSOR-X.
Uses an isolated in-memory SQLite database for integration testing.
"""

import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Setup test environment variables
os.environ["APP_ENV"] = "testing"
os.environ["AUTH_SECRET_KEY"] = "test_auth_entropy_key_with_at_least_32_characters_for_fixtures!"
os.environ["DEV_AUTH_SECRET"] = "test_auth_entropy_key_with_at_least_32_characters_for_fixtures!"

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

from app.db.base import Base
from app.db.session import get_db
from app.db.seed import seed_database
from app.main import app


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """
    Creates all database schema tables and seeds canonical CCPS baseline records
    into an isolated in-memory SQLite test database for integration testing.
    """
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    try:
        seed_database(force=True, db=db)
    finally:
        db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
