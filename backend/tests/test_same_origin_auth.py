"""
Authentication acceptance tests for the same-origin architecture:

    Browser -> same-origin Express server -> FastAPI -> PostgreSQL

The Express proxy forwards the browser's Cookie header and returns FastAPI's Set-Cookie
unchanged, so what matters on the FastAPI side is: the cookie is issued correctly, a
*protected* request succeeds with it (not merely a 200 from /login), the session survives a
page reload, logout invalidates it in the browser, unauthenticated access is refused, and
cross-origin state-changing requests are rejected.
"""

import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, settings
from app.main import app

PASSWORD = "Str0ng#Passw0rd!x"
STRONG_SECRET = "s" * 40

PROTECTED_GETS = [
    "/api/v1/auth/me",
    "/api/v1/facilities",
    "/api/v1/dashboard/summary",
    "/api/v1/reviews",
]


def _email() -> str:
    return f"sameorigin.{uuid.uuid4().hex[:10]}@precursorx.internal"


def _register(client: TestClient, email: str):
    return client.post(
        "/api/v1/auth/register",
        json={"full_name": "Same Origin User", "email": email, "password": PASSWORD},
    )


# 1. successful registration ------------------------------------------------------------------
def test_registration_succeeds_and_issues_session_cookie():
    c = TestClient(app)
    res = _register(c, _email())
    assert res.status_code == 201
    assert c.cookies.get(settings.AUTH_COOKIE_NAME)
    assert settings.AUTH_COOKIE_NAME not in res.text  # the token never appears in the body


# 2/3. login + invalid credentials ------------------------------------------------------------
def test_invalid_credentials_are_refused_without_a_cookie():
    email = _email()
    _register(TestClient(app), email)
    c = TestClient(app)
    res = c.post("/api/v1/auth/login", json={"email": email, "password": "WrongPassword#1"})
    assert res.status_code == 401
    assert settings.AUTH_COOKIE_NAME not in res.headers.get("set-cookie", "")
    assert c.get("/api/v1/auth/me").status_code == 401


# 4. cookie issuance and attributes ------------------------------------------------------------
def test_login_cookie_is_httponly_lax_and_scoped_to_root():
    email = _email()
    _register(TestClient(app), email)
    res = TestClient(app).post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200
    header = " ".join(res.headers.get_list("set-cookie")).lower()
    assert f"{settings.AUTH_COOKIE_NAME}=" in header
    assert "httponly" in header
    assert "samesite=lax" in header
    assert "path=/" in header
    assert "max-age=" in header
    assert "domain=" not in header, "host-only cookie: the proxy must not need a Domain attribute"
    assert "partitioned" not in header, "no Partitioned attribute without a demonstrated need"


def test_production_cookie_policy_is_secure_lax_by_default():
    s = Settings(
        APP_ENV="production",
        AUTH_SECRET_KEY=STRONG_SECRET,
        CORS_ORIGINS="https://precursorx-frontend.onrender.com",
        _env_file=None,
    )
    assert s.AUTH_COOKIE_SECURE is True
    assert s.AUTH_COOKIE_SAMESITE == "lax"
    assert s.AUTH_COOKIE_PATH == "/"


# 5. protected request with the issued session -------------------------------------------------
def test_protected_requests_succeed_with_the_issued_cookie():
    email = _email()
    _register(TestClient(app), email)
    c = TestClient(app)
    assert c.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}).status_code == 200
    for path in PROTECTED_GETS:
        assert c.get(path).status_code == 200, f"{path} must succeed with the session cookie"
    assert c.get("/api/v1/auth/me").json()["email"] == email


# 6. session restoration after reload ----------------------------------------------------------
def test_session_is_restored_from_the_stored_cookie_after_reload():
    email = _email()
    first = TestClient(app)
    _register(first, email)
    stored = first.cookies.get(settings.AUTH_COOKIE_NAME)
    assert stored

    reloaded = TestClient(app)  # a new page load: no in-memory state, only the browser's cookie
    reloaded.cookies.set(settings.AUTH_COOKIE_NAME, stored)
    me = reloaded.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == email
    assert reloaded.get("/api/v1/dashboard/summary").status_code == 200


# 7. logout ------------------------------------------------------------------------------------
def test_logout_expires_the_cookie_with_matching_attributes():
    c = TestClient(app)
    _register(c, _email())
    out = c.post("/api/v1/auth/logout")
    assert out.status_code == 200
    header = " ".join(out.headers.get_list("set-cookie")).lower()
    assert f"{settings.AUTH_COOKIE_NAME}=" in header
    assert "max-age=0" in header
    assert "path=/" in header  # same path as issuance, so browsers actually remove it
    assert c.get("/api/v1/auth/me").status_code == 401
    assert c.get("/api/v1/dashboard/summary").status_code == 401


# 8. unauthenticated access --------------------------------------------------------------------
@pytest.mark.parametrize("path", PROTECTED_GETS)
def test_protected_endpoints_reject_unauthenticated_requests(path):
    assert TestClient(app).get(path).status_code == 401


# 10. CORS / CSRF ------------------------------------------------------------------------------
def test_same_origin_state_changing_requests_are_allowed():
    origin = settings.ALLOWED_ORIGINS[0]
    email = _email()
    _register(TestClient(app), email)
    res = TestClient(app).post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"Origin": origin},
    )
    assert res.status_code == 200


def test_cross_origin_state_changing_requests_are_rejected_before_any_cookie_is_issued():
    email = _email()
    _register(TestClient(app), email)
    for hostile in ("https://evil.example.net", "null"):
        res = TestClient(app).post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
            headers={"Origin": hostile},
        )
        assert res.status_code == 403, hostile
        assert "set-cookie" not in res.headers
        assert res.headers.get("access-control-allow-origin") != hostile


def test_requests_without_origin_header_are_not_affected_by_the_guard():
    email = _email()
    _register(TestClient(app), email)
    res = TestClient(app).post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200


def test_cors_never_reflects_an_untrusted_origin_on_reads():
    res = TestClient(app).get("/api/v1/health", headers={"Origin": "https://evil.example.net"})
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") != "https://evil.example.net"


# No tokens in browser storage -----------------------------------------------------------------
SRC = Path(__file__).resolve().parents[2] / "src"


def test_frontend_never_stores_session_tokens_in_web_storage():
    if not SRC.exists():
        pytest.skip("frontend src/ not present")
    offenders = []
    for path in list(SRC.rglob("*.ts")) + list(SRC.rglob("*.tsx")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            code = line.split("//")[0]
            if ("localStorage" in code or "sessionStorage" in code) and any(
                word in code.lower() for word in ("token", "jwt", "auth", "session", "password")
            ):
                offenders.append(f"{path.name}:{number}")
    assert not offenders, f"session data must not touch web storage: {offenders}"
