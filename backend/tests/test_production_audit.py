"""
Pre-deployment audit tests for PRECURSOR-X.

Complements tests/test_api.py with the behaviours required before a production deploy:
  * Auth: PostgreSQL user creation, Argon2id hash, HttpOnly cookie, no token in JSON, /auth/me, logout,
    inactive accounts, role escalation on self-registration.
  * Auth session lifecycle: full login -> /auth/me -> protected-endpoint chain, missing-cookie 401,
    safe audit logging (cookie presence / SameSite / Secure / Path / result, never the token or password),
    and single-source-of-truth AUTH_SECRET_KEY behaviour across a settings instance.
  * Same-origin proxy: the frontend's Express server (Render Node web service) that keeps the auth cookie first-party
    on *.onrender.com, and the httpClient default that relies on it.
  * Human Review governance: reviewer identity is ALWAYS the authenticated user (spoofed fields ignored),
    reviewer_user_id / notes / decision / timestamp / adjusted SIF persisted, audit trail complete.
  * Groq failure never produces fabricated analysis; successful analysis is persisted with unique identifiers.
  * Seed idempotency (repeated startup neither duplicates nor overwrites records).
  * Production configuration (CORS / cookie policy).
  * Static guards over the React source tree (no browser token storage, no provider secrets, no seed imports).

The suite runs on the in-memory SQLite database from conftest.py; behaviours that specifically need
PostgreSQL (Alembic upgrade, JSON column behaviour, cross-site cookies) are verified separately post-deploy.
"""

import json
import re
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.ai.groq_client import GroqAPIError, GroqClient, GroqConfigurationError
from app.core.config import Settings, settings
from app.data.seed_data import WHAT_CHANGED_DATA
from app.data.seed_generator import (
    SEED_WHAT_CHANGED_SNAPSHOT_ID,
    generate_sif_precursor_velocity_series,
    is_velocity_series_stale,
)
from app.db.seed import _synchronize_seed_telemetry_snapshot, seed_database
from app.db.session import get_db
from app.main import app
from app.models.entities import (
    Facility,
    HumanReview,
    Intervention,
    PrecursorPattern,
    SafetyReport,
    SafetyRule,
    User,
    WhatChangedSnapshot,
)

STRONG_SECRET = "c84f689e83f219dbca4718c4e09f582da7324"
PASSWORD = "AuditPassword#2026Ok"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

class _DbSession:
    """Context manager yielding a session bound to the same (test) database the API uses."""

    def __enter__(self):
        self._gen = app.dependency_overrides[get_db]()
        self.db = next(self._gen)
        return self.db

    def __exit__(self, *exc):
        self._gen.close()


def _new_user(full_name="Audit Reviewer One"):
    email = f"audit.{uuid.uuid4().hex[:10]}@precursorx.internal"
    c = TestClient(app)
    res = c.post(
        "/api/v1/auth/register",
        json={"full_name": full_name, "email": email, "password": PASSWORD, "confirm_password": PASSWORD},
    )
    assert res.status_code == 201, res.text
    return c, email, res


# ---------------------------------------------------------------------------
# 1. AUTHENTICATION
# ---------------------------------------------------------------------------

def test_registration_creates_argon2id_user_and_httponly_cookie_without_token_in_json():
    c, email, res = _new_user()
    body = res.json()

    # No raw token / hash anywhere in the JSON body
    assert body["token_type"] == "cookie"
    flat = json.dumps(body).lower()
    for forbidden in ("access_token", "jwt", "password_hash", "$argon2"):
        assert forbidden not in flat
    cookie_value = c.cookies.get("access_token")
    assert cookie_value, "session cookie was not set"
    assert cookie_value not in res.text

    # HttpOnly session cookie
    set_cookie = " ".join(res.headers.get_list("set-cookie")).lower()
    assert "access_token=" in set_cookie
    assert "httponly" in set_cookie

    # Persisted user, Argon2id hash, safe role
    with _DbSession() as db:
        user = db.query(User).filter(User.email == email).first()
        assert user is not None
        assert user.password_hash.startswith("$argon2id$")
        assert PASSWORD not in user.password_hash
        assert user.role == "safety_engineer"
        assert user.is_active is True


def test_register_ignores_elevated_flags_and_rejects_privileged_role():
    email = f"audit.{uuid.uuid4().hex[:10]}@precursorx.internal"
    c = TestClient(app)
    res = c.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sneaky User", "email": email, "password": PASSWORD,
            "is_active": True, "is_admin": True, "is_superuser": True,
        },
    )
    assert res.status_code == 201
    assert res.json()["user"]["role"] == "safety_engineer"

    res2 = TestClient(app).post(
        "/api/v1/auth/register",
        json={"full_name": "Sneaky Two", "email": f"x.{email}", "password": PASSWORD, "role": "administrator"},
    )
    assert res2.status_code == 422


def test_login_verifies_hash_and_me_returns_postgres_user():
    _, email, _ = _new_user("Login Check User")

    bad = TestClient(app).post("/api/v1/auth/login", json={"email": email, "password": "WrongPassword#1"})
    assert bad.status_code == 401
    assert "access_token" not in bad.headers.get("set-cookie", "")

    c = TestClient(app)
    ok = c.post("/api/v1/auth/login", json={"email": email.upper(), "password": PASSWORD})
    assert ok.status_code == 200
    assert "access_token" not in ok.text.lower().replace('"token_type"', "")  # no token field in the JSON
    assert "httponly" in " ".join(ok.headers.get_list("set-cookie")).lower()

    me = c.get("/api/v1/auth/me")
    assert me.status_code == 200
    me_body = me.json()
    assert me_body["email"] == email
    assert me_body["full_name"] == "Login Check User"
    assert "password_hash" not in me_body

    with _DbSession() as db:
        user = db.query(User).filter(User.email == email).first()
        assert me_body["id"] == user.id
        assert user.last_login_at is not None


def test_inactive_user_cannot_login_and_existing_session_is_refused():
    c, email, _ = _new_user("Soon Inactive")
    assert c.get("/api/v1/auth/me").status_code == 200

    with _DbSession() as db:
        user = db.query(User).filter(User.email == email).first()
        user.is_active = False
        db.commit()

    login = TestClient(app).post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 403
    assert "access_token" not in login.headers.get("set-cookie", "")

    # A session issued before deactivation must stop working on operational routes too
    assert c.get("/api/v1/dashboard/summary").status_code == 403


def test_logout_clears_cookie_and_protected_routes_require_auth_again():
    c, _, _ = _new_user()
    assert c.get("/api/v1/facilities").status_code == 200

    out = c.post("/api/v1/auth/logout")
    assert out.status_code == 200
    header = " ".join(out.headers.get_list("set-cookie")).lower()
    assert "access_token=" in header and "max-age=0" in header

    assert c.get("/api/v1/auth/me").status_code == 401
    assert c.get("/api/v1/facilities").status_code == 401


def test_tampered_or_garbage_cookie_is_rejected():
    c = TestClient(app)
    c.cookies.set("access_token", "not.a.jwt")
    assert c.get("/api/v1/auth/me").status_code == 401


# ---------------------------------------------------------------------------
# 1b. AUTH SESSION LIFECYCLE: login -> cookie -> /auth/me -> protected endpoint,
#     missing-cookie 401, and safe (non-secret-leaking) audit logging.
# ---------------------------------------------------------------------------

def test_full_session_chain_login_cookie_me_and_protected_dashboard(caplog):
    """
    End-to-end proof of the exact chain the bug report asked us to verify:
    login -> Set-Cookie -> browser resends cookie -> /auth/me -> protected dashboard route.
    (TestClient's cookie jar behaves like a same-site browser here; the *.onrender.com
    third-party-cookie failure mode this fix addresses only reproduces with a real browser
    making a genuinely cross-site request, which is exactly why the render.yaml same-origin
    Express proxy - not a cookie-attribute change - is the fix; see test_render_yaml_* below.)
    """
    email = f"chain.{uuid.uuid4().hex[:10]}@precursorx.internal"
    c = TestClient(app)

    reg = c.post(
        "/api/v1/auth/register",
        json={"full_name": "Chain Test User", "email": email, "password": PASSWORD, "confirm_password": PASSWORD},
    )
    assert reg.status_code == 201
    assert "set-cookie" in {k.lower() for k in reg.headers.keys()}

    with caplog.at_level("INFO", logger="precursor_x.auth"):
        login = TestClient(app)  # fresh client -> proves cookie survives to a NEW request cycle
        # (re-login on the same email to also exercise the /auth/login code path, not just /auth/register)
        login_res = login.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert login_res.status_code == 200
    set_cookie_header = " ".join(login_res.headers.get_list("set-cookie"))
    assert "access_token=" in set_cookie_header

    me = login.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == email

    dashboard = login.get("/api/v1/dashboard/summary")
    assert dashboard.status_code == 200

    # Login success was logged with cookie metadata, never the token itself.
    login_logs = [r.message for r in caplog.records if r.name == "precursor_x.auth"]
    assert any("auth.login.success" in m and "set_cookie=true" in m for m in login_logs)
    assert any(f"cookie_name={settings.AUTH_COOKIE_NAME}" in m for m in login_logs)
    assert any(f"samesite={settings.AUTH_COOKIE_SAMESITE}" in m for m in login_logs)
    token_value = login.cookies.get("access_token")
    assert token_value not in " ".join(login_logs)
    assert PASSWORD not in " ".join(login_logs)


def test_missing_cookie_returns_401_on_me_and_dashboard():
    anon = TestClient(app)
    me = anon.get("/api/v1/auth/me")
    assert me.status_code == 401
    dash = anon.get("/api/v1/dashboard/summary")
    assert dash.status_code == 401


def test_auth_check_logs_cookie_presence_and_result_without_leaking_token(caplog):
    c, email, _ = _new_user("Audit Log User")
    token_value = c.cookies.get("access_token")
    assert token_value

    with caplog.at_level("INFO", logger="precursor_x.deps"):
        res = c.get("/api/v1/auth/me")
    assert res.status_code == 200

    deps_logs = [r.message for r in caplog.records if r.name == "precursor_x.deps"]
    assert any("auth.check" in m and "cookie_present=True" in m and "result=200_authenticated" in m for m in deps_logs)
    # The JWT value itself must never appear in logs.
    assert token_value not in " ".join(deps_logs)


def test_auth_check_logs_no_credentials_for_anonymous_request(caplog):
    anon = TestClient(app)
    with caplog.at_level("INFO", logger="precursor_x.deps"):
        res = anon.get("/api/v1/auth/me")
    assert res.status_code == 401

    deps_logs = [r.message for r in caplog.records if r.name == "precursor_x.deps"]
    assert any("cookie_present=False" in m and "result=401_no_credentials" in m for m in deps_logs)


def test_auth_secret_key_is_single_source_of_truth_for_token_validity():
    """
    Proves create_access_token and decode_access_token both defer to the same live
    `settings` object, so as long as every worker/instance of the backend process shares
    one AUTH_SECRET_KEY value (render.yaml uses `generateValue: true`, which Render
    generates ONCE per service and reuses across restarts/instances), a token issued by
    login is valid on every subsequent request. If the key were ever inconsistent between
    instances, decode_access_token fails closed (returns None -> 401) rather than silently
    accepting or crashing.
    """
    from app.core.config import settings as live_settings
    from app.core.security import create_access_token, decode_access_token

    token = create_access_token({"sub": "usr_test123", "email": "x@y.com", "role": "safety_engineer"})
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "usr_test123"

    original_secret = live_settings.AUTH_SECRET_KEY
    try:
        live_settings.AUTH_SECRET_KEY = "a-completely-different-secret-key-of-32-plus-characters!!"
        assert decode_access_token(token) is None  # fails closed, never a false positive
    finally:
        live_settings.AUTH_SECRET_KEY = original_secret

    # And restoring the original secret restores validity (proves the assertion above
    # was actually exercising the signing key and not some other side effect).
    assert decode_access_token(token) is not None


# ---------------------------------------------------------------------------
# 2. HUMAN REVIEW GOVERNANCE
# ---------------------------------------------------------------------------

def test_review_identity_is_derived_from_authenticated_user_not_request_body():
    c, email, _ = _new_user("Dr. Ada Governance")
    user_id = c.get("/api/v1/auth/me").json()["id"]

    res = c.post(
        "/api/v1/reviews/rev-0941/decision",
        json={
            "decision": "ACCEPT",
            "specialistNotes": "Verified against permit log.",
            # spoof attempts -> must be ignored
            "reviewer": "Mallory Attacker",
            "verifiedBy": "Mallory Attacker",
            "reviewerUserId": "usr_forged",
            "reviewer_email": "mallory@evil.test",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["verifiedBy"] == "Dr. Ada Governance"
    assert body["reviewerUserId"] == user_id
    assert body["decision"] == "COMMITTED"
    assert body["status"] == "CERTIFIED"

    with _DbSession() as db:
        rev = db.query(HumanReview).filter(HumanReview.id == "rev-0941").first()
        assert rev.reviewer_user_id == user_id
        assert rev.reviewer == "Dr. Ada Governance"
        assert rev.review_decision == "COMMITTED"
        assert rev.reviewer_notes == "Verified against permit log."
        assert rev.decided_at is not None
        last = rev.audit_trail[-1]
        assert last["reviewer_user_id"] == user_id
        assert last["reviewer_name"] == "Dr. Ada Governance"
        assert last["reviewer_email"] == email
        assert last["timestamp"]
        assert last["decision"] == "COMMITTED"
        assert last["specialist_notes"] == "Verified against permit log."
        assert "Mallory" not in json.dumps(last)
        assert "forged" not in json.dumps(last)


def test_reclassification_persists_adjusted_sif_and_keeps_original_ai_values_in_audit():
    c, _, _ = _new_user("Reclass Specialist")

    with _DbSession() as db:
        rev = db.query(HumanReview).filter(HumanReview.id == "rev-0941").first()
        before_level, before_score = rev.ai_sif_level, rev.ai_sif_score_pct

    res = c.post(
        "/api/v1/reviews/rev-0941/decision",
        json={
            "decision": "RECLASSIFY",
            "specialistNotes": "Downgrade: secondary barrier held.",
            "adjustedSifLevel": "MODERATE",
            "adjustedSifScorePct": 37,
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "RECLASSIFIED"

    with _DbSession() as db:
        rev = db.query(HumanReview).filter(HumanReview.id == "rev-0941").first()
        assert rev.ai_sif_level == "MODERATE"
        assert rev.ai_sif_score_pct == 37
        assert rev.reviewer_notes == "Downgrade: secondary barrier held."
        last = rev.audit_trail[-1]
        assert last["adjusted_sif_level"] == "MODERATE"
        assert last["adjusted_sif_score_pct"] == 37
        assert last["original_ai_sif_level"] == before_level
        assert last["original_ai_sif_score_pct"] == before_score


def test_invalid_review_decisions_are_rejected_without_mutation():
    c, _, _ = _new_user("Strict Reviewer")
    with _DbSession() as db:
        rev = db.query(HumanReview).filter(HumanReview.id == "rev-0941").first()
        snapshot = (rev.status, rev.review_decision, rev.reviewer_user_id, len(rev.audit_trail or []))

    assert c.post("/api/v1/reviews/rev-0941/decision", json={"decision": "SURE_WHY_NOT"}).status_code == 400
    assert c.post("/api/v1/reviews/rev-0941/decision", json={"decision": "RECLASSIFY"}).status_code == 400
    assert c.post(
        "/api/v1/reviews/rev-0941/decision",
        json={"decision": "RECLASSIFY", "adjustedSifScorePct": 150},
    ).status_code == 422

    with _DbSession() as db:
        rev = db.query(HumanReview).filter(HumanReview.id == "rev-0941").first()
        assert (rev.status, rev.review_decision, rev.reviewer_user_id, len(rev.audit_trail or [])) == snapshot


def test_legacy_governance_endpoint_ignores_reviewer_field_and_rejects_unknown_decision():
    c, email, _ = _new_user("Legacy Path User")
    user_id = c.get("/api/v1/auth/me").json()["id"]

    bad = c.post("/api/v1/reports/governance", json={"review_id": "rev-0941", "decision": "MAYBE"})
    assert bad.status_code == 400

    ok = c.post(
        "/api/v1/reports/governance",
        json={"review_id": "rev-0941", "decision": "COMMITTED", "reviewer": "Mallory Attacker"},
    )
    assert ok.status_code == 200
    assert ok.json()["reviewer"] == "Legacy Path User"
    with _DbSession() as db:
        rev = db.query(HumanReview).filter(HumanReview.id == "rev-0941").first()
        assert rev.reviewer_user_id == user_id
        assert rev.reviewer == "Legacy Path User"
        assert rev.audit_trail[-1]["reviewer_email"] == email


def test_review_api_does_not_fabricate_vector_hash():
    c, _, _ = _new_user()
    item = c.get("/api/v1/reviews/rev-0941").json()
    assert item["vectorHash"] is None


# ---------------------------------------------------------------------------
# 7. GROQ: FAILURE NEVER PRODUCES FABRICATED OUTPUT; SUCCESS IS PERSISTED
# ---------------------------------------------------------------------------

def _report_count():
    with _DbSession() as db:
        return db.query(SafetyReport).count(), db.query(HumanReview).count()


def test_groq_api_failure_returns_502_and_persists_nothing():
    c, _, _ = _new_user()
    before = _report_count()
    with patch.object(GroqClient, "chat_completion_json", new=AsyncMock(side_effect=GroqAPIError("upstream down"))):
        res = c.post("/api/v1/reports/analyze", json={"text": "Operator bypassed interlock on compressor K-101."})
    assert res.status_code == 502
    detail = res.json()["detail"]
    assert detail.startswith("AI ANALYSIS UNAVAILABLE")
    assert "sifPotential" not in res.text
    assert _report_count() == before


def test_groq_not_configured_returns_503_and_persists_nothing():
    c, _, _ = _new_user()
    before = _report_count()
    with patch.object(GroqClient, "chat_completion_json", new=AsyncMock(side_effect=GroqConfigurationError("no key"))):
        res = c.post("/api/v1/reports/analyze", json={"text": "Operator bypassed interlock on compressor K-101."})
    assert res.status_code == 503
    assert "sifPotential" not in res.text
    assert _report_count() == before


def test_groq_malformed_output_returns_502_not_defaults():
    c, _, _ = _new_user()
    before = _report_count()
    with patch.object(GroqClient, "chat_completion_json", new=AsyncMock(return_value={"unexpected": "shape"})):
        res = c.post("/api/v1/reports/analyze", json={"text": "Operator bypassed interlock on compressor K-101."})
    assert res.status_code == 502
    assert _report_count() == before


def _groq_payload():
    return {
        "sifPotential": "CRITICAL",
        "sifScorePct": 91,
        "confidencePct": 84,
        "title": "Interlock bypass on compressor K-101",
        "explanation": "Interlock was bypassed while the unit remained in service.",
        "hazards": [{"name": "Rotating equipment", "threshold": "N/A", "level": "critical"}],
        "precursors": [{"name": "Interlock bypass", "evidence": "bypassed interlock", "weight": 80, "pattern_id": None}],
        "consequences": [{"title": "Machinery entrapment", "severity": "Critical", "regulatoryTier": "OSHA Severe"}],
        "lifeSavingRule": {"code": "LSR-01", "name": "Energy Isolation", "standardsRef": "IOGP 459"},
        "barrierFailures": [{"id": None, "name": "Interlock", "description": "Bypassed", "status": "BYPASSED"}],
        "annotatedTokens": [{"id": "tok-1", "text": "bypassed interlock", "type": "barrier-breach", "description": "Barrier breach"}],
    }


def test_successful_groq_analysis_is_persisted_with_unique_ids():
    c, _, _ = _new_user()
    ids = []
    with patch.object(GroqClient, "chat_completion_json", new=AsyncMock(return_value=_groq_payload())):
        for _ in range(3):
            res = c.post("/api/v1/reports/analyze", json={"text": "Operator bypassed interlock on compressor K-101."})
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["source"] == "AI INFERENCE"
            assert body["ai_model"] == settings.GROQ_MODEL
            assert body["report_id"].startswith("rep-")
            assert body["review_id"]
            ids.append((body["report_id"], body["review_id"]))
    assert len({i[0] for i in ids}) == 3
    assert len({i[1] for i in ids}) == 3

    with _DbSession() as db:
        for report_id, review_id in ids:
            rep = db.query(SafetyReport).filter(SafetyReport.id == report_id).first()
            assert rep is not None and rep.sif_potential == "CRITICAL"
            rev = db.query(HumanReview).filter(HumanReview.id == review_id).first()
            assert rev is not None
            assert rev.status == "PENDING_REVIEW"
            assert rev.reviewer_user_id is None and rev.reviewer is None  # nobody has reviewed it yet


# ---------------------------------------------------------------------------
# 5. SEED DATA IDEMPOTENCY
# ---------------------------------------------------------------------------

def test_repeated_seed_does_not_duplicate_or_overwrite_real_records():
    with _DbSession() as db:
        tables = (Facility, SafetyRule, PrecursorPattern, Intervention, HumanReview)
        before = {t.__tablename__: db.query(t).count() for t in tables}
        users_before = db.query(User).count()

        # simulate a real record edited by a reviewer
        rev = db.query(HumanReview).filter(HumanReview.id == "rev-0941").first()
        rev.reviewer = "Real Reviewer Name"
        rev.reviewer_notes = "real notes"
        fac = db.query(Facility).first()
        fac_name = fac.name
        fac.name = "Edited Real Facility"
        db.commit()

        seed_database(force=False, db=db)
        seed_database(force=False, db=db)

        after = {t.__tablename__: db.query(t).count() for t in tables}
        assert after == before
        assert db.query(User).count() == users_before
        assert db.query(HumanReview).filter(HumanReview.id == "rev-0941").first().reviewer == "Real Reviewer Name"
        assert db.query(Facility).filter(Facility.name == "Edited Real Facility").count() == 1

        # restore for other tests
        db.query(Facility).filter(Facility.name == "Edited Real Facility").first().name = fac_name
        db.commit()


def test_seed_telemetry_snapshot_synchronizes_stale_curve_and_is_idempotent():
    """
    Regression test for automatic WhatChangedSnapshot telemetry synchronization
    (app/db/seed.py: _synchronize_seed_telemetry_snapshot), which runs on every
    application startup via seed_database() -> lifespan().

    Proves:
      - a pre-existing/legacy WhatChangedSnapshot curve (as an existing production
        database created before the 16-week generator existed would still be serving)
        gets synchronized to the current generate_sif_precursor_velocity_series() output
      - the synchronized final value matches live SUM(Facility.sif_precursors) — the same
        number the Dashboard's "Active SIF Precursors" tile reports
      - values come exclusively from generate_sif_precursor_velocity_series() (no second
        algorithm, nothing invented in the sync step itself)
      - running synchronization twice in a row is idempotent: no duplicate snapshot row,
        curve unchanged the second time
      - unrelated records (Facility rows, HumanReview rows, other snapshot fields) are
        completely untouched by the synchronization
    """
    with _DbSession() as db:
        target_current = sum(f.sif_precursors or 0 for f in db.query(Facility).all())

        snap = db.query(WhatChangedSnapshot).filter(
            WhatChangedSnapshot.id == SEED_WHAT_CHANGED_SNAPSHOT_ID
        ).first()
        assert snap is not None

        # Baselines for "unrelated records/fields must be untouched" assertions.
        facility_count_before = db.query(Facility).count()
        human_review_count_before = db.query(HumanReview).count()
        snapshot_count_before = db.query(WhatChangedSnapshot).count()
        key_shift_observation_before = snap.key_shift_observation
        baseline_integrity_before = snap.baseline_integrity
        original_curve = snap.divergence_curve
        original_acceleration = snap.precursor_acceleration

        # Simulate an old production row inserted before the 16-week generator existed:
        # a short, legacy-shaped curve whose final value has drifted from the live total.
        legacy_curve = [
            {"week": "Wk 09", "precursorVolume": 1, "baselineThreshold": 150, "highEnergySpikes": 0},
            {"week": "Wk 10", "precursorVolume": 2, "baselineThreshold": 150, "highEnergySpikes": 0},
            {"week": "Wk 11", "precursorVolume": 3, "baselineThreshold": 150, "highEnergySpikes": 0},
        ]
        snap.divergence_curve = legacy_curve
        snap.precursor_acceleration = "+0.0%"
        db.commit()
        assert is_velocity_series_stale(legacy_curve, target_current) is True

        # Act: run the exact synchronization seed_database() performs on every startup.
        _synchronize_seed_telemetry_snapshot(db)

        db.refresh(snap)
        assert len(snap.divergence_curve) == 16
        assert snap.divergence_curve[-1]["precursorVolume"] == target_current
        expected_curve = generate_sif_precursor_velocity_series(
            target_current=target_current, weeks=16, executive_threshold=150
        )
        assert snap.divergence_curve == expected_curve  # same generator, no second algorithm

        # Idempotency: a second sync call performs no further changes.
        curve_after_first_sync = list(snap.divergence_curve)
        _synchronize_seed_telemetry_snapshot(db)
        db.refresh(snap)
        assert snap.divergence_curve == curve_after_first_sync
        assert db.query(WhatChangedSnapshot).count() == snapshot_count_before

        # The real startup path (seed_database, as lifespan() calls it) is also a no-op here.
        seed_database(force=False, db=db)
        db.refresh(snap)
        assert snap.divergence_curve == curve_after_first_sync
        assert db.query(WhatChangedSnapshot).count() == snapshot_count_before

        # Unrelated records/fields untouched.
        assert db.query(Facility).count() == facility_count_before
        assert db.query(HumanReview).count() == human_review_count_before
        assert snap.key_shift_observation == key_shift_observation_before
        assert snap.baseline_integrity == baseline_integrity_before

        # Restore original state so other tests reading this snapshot are unaffected.
        snap.divergence_curve = original_curve
        snap.precursor_acceleration = original_acceleration
        db.commit()


def test_seed_telemetry_synchronization_is_a_true_noop_when_already_in_sync():
    """
    Running synchronization against an already-correct snapshot (the normal case on every
    Render restart once the fix has been deployed once) must change nothing at all.
    """
    with _DbSession() as db:
        snap = db.query(WhatChangedSnapshot).filter(
            WhatChangedSnapshot.id == SEED_WHAT_CHANGED_SNAPSHOT_ID
        ).first()
        assert snap is not None
        curve_before = list(snap.divergence_curve)
        acceleration_before = snap.precursor_acceleration

        _synchronize_seed_telemetry_snapshot(db)

        db.refresh(snap)
        assert snap.divergence_curve == curve_before
        assert snap.precursor_acceleration == acceleration_before


def test_seed_telemetry_synchronization_refuses_ambiguous_snapshot_state():
    """
    If more than one WhatChangedSnapshot row exists, or the sole row does not carry the
    known seed-owned id, the synchronization must refuse to act rather than guess which
    row (if any) is safe to overwrite.
    """
    with _DbSession() as db:
        real_snap = db.query(WhatChangedSnapshot).filter(
            WhatChangedSnapshot.id == SEED_WHAT_CHANGED_SNAPSHOT_ID
        ).first()
        real_curve_before = list(real_snap.divergence_curve)

        decoy = WhatChangedSnapshot(
            id="snap-unexpected-decoy",
            baseline_period="Decoy",
            active_period="Decoy",
            precursor_acceleration="+0.0%",
            events_in_active=0,
            events_in_baseline=0,
            barrier_integrity_drop="N/A",
            baseline_integrity=0.0,
            current_integrity=0.0,
            emergent_failure_modes=0,
            high_energy_spikes=0,
            key_shift_observation="decoy",
            divergence_curve=[{"week": "Wk 01", "precursorVolume": 1}],
            flagged_precursors=[],
        )
        db.add(decoy)
        db.commit()

        _synchronize_seed_telemetry_snapshot(db)  # must no-op: 2 rows now exist

        db.refresh(real_snap)
        decoy_after = db.query(WhatChangedSnapshot).filter(
            WhatChangedSnapshot.id == "snap-unexpected-decoy"
        ).first()
        assert real_snap.divergence_curve == real_curve_before  # untouched
        assert decoy_after is not None
        assert decoy_after.divergence_curve == [{"week": "Wk 01", "precursorVolume": 1}]  # untouched

        # cleanup for other tests
        db.delete(decoy_after)
        db.commit()


def test_seeded_reports_are_not_labelled_as_groq_output():
    with _DbSession() as db:
        # Seeded rows have no processing duration; live Groq analyses always record one (>= 1 ms).
        seeded = db.query(SafetyReport).filter(SafetyReport.processing_duration_ms.is_(None)).all()
        assert seeded, "expected synthetic seed reports"
        assert all(r.ai_model is None for r in seeded)


# ---------------------------------------------------------------------------
# 9. PRODUCTION CONFIGURATION
# ---------------------------------------------------------------------------

def test_production_requires_https_frontend_origin():
    with pytest.raises(ValueError) as exc:
        Settings(APP_ENV="production", AUTH_SECRET_KEY=STRONG_SECRET, _env_file=None)  # default = localhost-only origins
    assert "https://" in str(exc.value)


def test_production_cors_origins_env_style_and_cookie_policy():
    s = Settings(
        APP_ENV="Production",
        AUTH_SECRET_KEY=STRONG_SECRET,
        CORS_ORIGINS="https://precursor-x-frontend.onrender.com/",
        _env_file=None,
    )
    assert s.APP_ENV == "production"
    assert s.ALLOWED_ORIGINS == ["https://precursor-x-frontend.onrender.com"]
    assert s.AUTH_COOKIE_SECURE is True
    # Same-origin architecture (Browser -> Express -> FastAPI): first-party cookie, so Lax is correct.
    assert s.AUTH_COOKIE_SAMESITE == "lax"


def test_production_rejects_wildcard_in_cors_origins_env():
    with pytest.raises(ValueError):
        Settings(APP_ENV="production", AUTH_SECRET_KEY=STRONG_SECRET, CORS_ORIGINS="https://a.example.com,*", _env_file=None)


def test_development_defaults_are_local_and_lax():
    s = Settings(APP_ENV="development", _env_file=None)
    assert s.AUTH_COOKIE_SAMESITE == "lax"
    assert s.AUTH_COOKIE_SECURE is False
    assert all(o.startswith("http://") for o in s.ALLOWED_ORIGINS)


def test_cors_preflight_allows_configured_origin_only():
    c = TestClient(app)
    origin = settings.ALLOWED_ORIGINS[0]
    ok = c.options(
        "/api/v1/auth/login",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )
    assert ok.headers.get("access-control-allow-origin") == origin
    assert ok.headers.get("access-control-allow-credentials") == "true"

    bad = c.options(
        "/api/v1/auth/login",
        headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "POST"},
    )
    assert bad.headers.get("access-control-allow-origin") != "https://evil.example.com"


# ---------------------------------------------------------------------------
# 3/6/7. STATIC GUARDS OVER THE REACT SOURCE (skipped if the frontend is not alongside the backend)
# ---------------------------------------------------------------------------

SRC = Path(__file__).resolve().parents[2] / "src"


def _frontend_files():
    if not SRC.exists():
        pytest.skip("frontend src/ not present next to backend/")
    return [p for p in SRC.rglob("*") if p.suffix in {".ts", ".tsx"}]


def _strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"(^|[^:])//.*$", r"\1", text, flags=re.M)


def test_frontend_never_uses_browser_token_storage_or_provider_secrets():
    for path in _frontend_files():
        code = _strip_comments(path.read_text(encoding="utf-8"))
        assert "localStorage" not in code, path
        assert "sessionStorage" not in code, path
        assert not re.search(r"GROQ_API_KEY|VITE_GROQ|gsk_[A-Za-z0-9]{10,}", code), path


def test_frontend_never_imports_seed_data_or_hardcodes_localhost():
    for path in _frontend_files():
        code = _strip_comments(path.read_text(encoding="utf-8"))
        assert "seed_data" not in code, path
        assert not re.search(r"localhost|127\.0\.0\.1", code), path


def test_math_random_is_confined_to_landing_canvas_animation():
    allowed = {"ParticleCanvas.tsx", "TelemetryNetworkCanvas.tsx"}
    for path in _frontend_files():
        if "Math.random" in path.read_text(encoding="utf-8"):
            assert path.name in allowed, f"Math.random found outside landing visuals: {path}"


def test_frontend_does_not_send_a_reviewer_identity():
    api_ts = (SRC / "services" / "api.ts") if SRC.exists() else None
    if api_ts is None:
        pytest.skip("frontend src/ not present")
    code = _strip_comments(api_ts.read_text(encoding="utf-8"))
    assert "reviewer:" not in code.split("commitReportGovernance")[1].split("}): Promise")[0]
    assert "_deprecatedReviewer" not in code


# ---------------------------------------------------------------------------
# 10. SAME-ORIGIN PROXY (cross-site cookie fix)
# ---------------------------------------------------------------------------

RENDER_YAML = Path(__file__).resolve().parents[2] / "render.yaml"


def test_render_yaml_runs_frontend_as_node_web_service_with_express_proxy():
    if not RENDER_YAML.exists():
        pytest.skip("render.yaml not present next to backend/")
    text = RENDER_YAML.read_text(encoding="utf-8")

    frontend_block = text[text.find("name: precursor-x-frontend"):]
    # Real Node web service, not a static site with an external rewrite.
    assert "runtime: node" in frontend_block
    assert "runtime: static" not in text
    assert "staticPublishPath" not in text
    assert "type: rewrite" not in text, "misleading static-site rewrite rules must be gone"
    assert "startCommand: npm start" in frontend_block
    assert "npm run build" in frontend_block
    # Backend URL is configured through a documented env var, supplied in the Render dashboard.
    assert "key: BACKEND_URL" in frontend_block
    # The existing backend + single database are preserved; no second database was introduced.
    assert text.count("- name: precursor-x-db") == 1
    assert "name: precursor-x-backend" in text
    assert "alembic upgrade head" in text
    # Cross-site cookies are no longer needed.
    assert "AUTH_COOKIE_SAMESITE" not in text


def test_http_client_defaults_to_relative_same_origin_api_path():
    http_client_ts = SRC / "services" / "httpClient.ts" if SRC.exists() else None
    if http_client_ts is None or not http_client_ts.exists():
        pytest.skip("frontend src/services/httpClient.ts not present")
    code = _strip_comments(http_client_ts.read_text(encoding="utf-8"))

    # No explicit override -> must resolve to the relative, same-origin path so the
    # deployment's own proxy (the Express server in production, Vite dev proxy locally)
    # handles it, keeping the HttpOnly session cookie first-party.
    assert "return '/api/v1'" in code or 'return "/api/v1"' in code
    # Must not silently fall back to an absolute cross-origin onrender.com URL.
    assert "raw = PRODUCTION_BACKEND_FALLBACK" not in code
    assert "credentials: 'include'" in code or 'credentials: "include"' in code

