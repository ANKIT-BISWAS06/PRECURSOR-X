"""
Authoritative Integration and Security Test Suite for PRECURSOR-X.
Verifies:
1. Every operational endpoint strictly requires authentication (HTTP 401 when anonymous).
2. Public endpoints remain accessible (/health, /auth/login, /auth/register, /auth/logout).
3. Argon2id password hashing and validation.
4. Prevention of privilege escalation on registration.
5. Authenticated sessions access operational endpoints with HTTP 200 / success.
6. Mutating operations (interventions, human reviews, simulations) require authentication and use user identity.
7. Production security configuration fail-fast policies.
"""

import time
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import hash_password, verify_password
from app.core.config import Settings
from app.schemas.report_analysis import (
    StructuredReportAnalysis, HazardItem, PrecursorItem,
    ConsequenceItem, LifeSavingRuleItem, BarrierItem,
    MitigatingControlItem, AnnotatedTokenItem
)

client = TestClient(app)


# ---------------------------------------------------------------------------
# FIXTURES & TEST HELPERS
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def authenticated_client():
    """
    Test fixture providing an authenticated TestClient with an active session cookie.
    Uses unique isolated test credentials.
    """
    unique_ts = int(time.time() * 1000)
    test_email = f"test.safety.specialist.{unique_ts}@precursorx.internal"
    test_password = "TestPassword#2026Valid!"

    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Test Safety Specialist",
            "email": test_email,
            "password": test_password,
            "confirm_password": test_password,
            "role": "safety_engineer"
        }
    )
    assert reg_res.status_code == 201, f"Registration failed: {reg_res.text}"

    auth_client = TestClient(app)
    # Login to acquire session cookie
    login_res = auth_client.post(
        "/api/v1/auth/login",
        json={"email": test_email, "password": test_password}
    )
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    return auth_client


# ---------------------------------------------------------------------------
# 1. VERIFY PUBLIC ENDPOINTS REMAIN ACCESSIBLE WITHOUT CREDENTIALS
# ---------------------------------------------------------------------------

def test_public_health_endpoint():
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "service" in data
    assert "DATABASE_URL" not in data
    assert "GROQ_API_KEY" not in data
    assert "AUTH_SECRET_KEY" not in data


def test_public_root_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"


def test_public_knowledge_graph_summary_is_real_database_derived():
    """
    The landing page's Centrality Hub must come from the real PostgreSQL graph
    topology (via the existing graph_service centrality calculation), not a
    hardcoded placeholder such as the former "CSE TK-402 (0.89 Rank)".
    """
    res = client.get("/api/v1/public/knowledge-graph/summary")
    assert res.status_code == 200
    data = res.json()

    assert "nodeCount" in data and isinstance(data["nodeCount"], int)
    assert "edgeCount" in data and isinstance(data["edgeCount"], int)
    assert "density" in data
    assert "centralityHub" in data

    # Seeded test DB has real graph nodes/edges, so a real hub should resolve.
    if data["nodeCount"] >= 2:
        assert data["centralityHub"] is not None
        hub = data["centralityHub"]
        assert set(hub.keys()) == {"nodeId", "label", "score"}
        assert isinstance(hub["nodeId"], str) and hub["nodeId"]
        assert isinstance(hub["label"], str) and hub["label"]
        assert 0.0 <= hub["score"] <= 1.0
        # The old hardcoded placeholder must never appear.
        assert hub["label"] != "CSE TK-402"
        assert hub["score"] != 0.89

    # Never leaks edges, report content, or other authenticated data.
    assert "edges" not in data
    assert "nodes" not in data


def test_public_knowledge_graph_summary_centrality_hub_matches_authenticated_graph_max(authenticated_client):
    """
    The public centralityHub must be the actual max-centrality node produced by
    the same graph_service calculation used by the authenticated Knowledge
    Graph endpoint — proving it's reused, not a second/different algorithm.
    """
    public_res = client.get("/api/v1/public/knowledge-graph/summary")
    assert public_res.status_code == 200
    hub = public_res.json()["centralityHub"]

    full_res = authenticated_client.get("/api/v1/knowledge-graph")
    assert full_res.status_code == 200
    nodes = full_res.json()["nodes"]
    if not nodes:
        pytest.skip("no graph nodes seeded")

    expected_top = max(nodes, key=lambda n: n["centrality"])
    assert hub is not None
    assert hub["nodeId"] == expected_top["id"]
    assert hub["label"] == expected_top["label"]
    assert hub["score"] == expected_top["centrality"]


# ---------------------------------------------------------------------------
# 2. VERIFY EVERY PROTECTED OPERATIONAL ENDPOINT REJECTS ANONYMOUS REQUESTS (HTTP 401)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("endpoint,method,payload", [
    ("/api/v1/dashboard/summary?facility=all&timeframe=12W", "GET", None),
    ("/api/v1/dashboard/telemetry", "GET", None),
    ("/api/v1/dashboard/facilities", "GET", None),
    ("/api/v1/dashboard/events", "GET", None),
    ("/api/v1/dashboard/priority-actions", "GET", None),
    ("/api/v1/reports/analyze", "POST", {"text": "Unauthorized test incident"}),
    ("/api/v1/reports/governance", "POST", {"decision": "COMMITTED"}),
    ("/api/v1/risk-intelligence/telemetry?site=all&timeframe=90", "GET", None),
    ("/api/v1/risk-intelligence/matrix?timeframe=90", "GET", None),
    ("/api/v1/risk-intelligence/facilities?site=site-b", "GET", None),
    ("/api/v1/safety-dna/patterns", "GET", None),
    ("/api/v1/safety-dna/causal-chain?pattern_id=gen-cs-loto-01", "GET", None),
    ("/api/v1/safety-dna/metrics", "GET", None),
    ("/api/v1/safety-memory/search?query=sniff", "GET", None),
    ("/api/v1/knowledge-graph", "GET", None),
    ("/api/v1/knowledge-graph/barrier-simulation", "POST", {"barrierId": "ND-204", "action": "restore"}),
    ("/api/v1/what-changed?baseline=Q3_BASELINE&active=CURRENT_30D", "GET", None),
    ("/api/v1/interventions", "GET", None),
    ("/api/v1/interventions", "POST", {"title": "Unauthorized CAPA"}),
    ("/api/v1/interventions/from-precursor", "POST", {"precursorId": "test", "actionType": "DISPATCH_CAPA"}),
    ("/api/v1/interventions/int-01", "PATCH", {"status": "Approved"}),
    ("/api/v1/reviews", "GET", None),
    ("/api/v1/reviews/rev-01", "GET", None),
    ("/api/v1/reviews/rev-01/decision", "POST", {"decision": "COMMITTED"}),
    ("/api/v1/facilities", "GET", None),
    ("/api/v1/auth/me", "GET", None),
])
def test_operational_endpoints_require_authentication(endpoint, method, payload):
    anon_client = TestClient(app)
    if method == "GET":
        res = anon_client.get(endpoint)
    elif method == "POST":
        res = anon_client.post(endpoint, json=payload)
    elif method == "PATCH":
        res = anon_client.patch(endpoint, json=payload)
    else:
        pytest.fail(f"Unhandled HTTP method: {method}")

    assert res.status_code == 401, f"Expected 401 for anonymous {method} {endpoint}, got {res.status_code}: {res.text}"


# ---------------------------------------------------------------------------
# 3. VERIFY ARGON2ID PASSWORD HASHING
# ---------------------------------------------------------------------------

def test_argon2id_hashing_and_verification():
    password = "ComplexSecure#Password2026!"
    hashed = hash_password(password)

    # Must be Argon2id
    assert hashed.startswith("$argon2id$"), f"Expected Argon2id format, got: {hashed}"
    assert "p=1" in hashed
    assert "m=19456" in hashed

    # Must verify accurately
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False
    assert verify_password("", hashed) is False
    assert verify_password(password, "") is False


# ---------------------------------------------------------------------------
# 4. VERIFY REGISTRATION SECURITY & PRIVILEGE ESCALATION PREVENTION
# ---------------------------------------------------------------------------

def test_registration_prevents_privilege_escalation():
    # Attempting to self-register as executive or administrator must be rejected
    res = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Malicious Operator",
            "email": f"hacker_{int(time.time())}@precursorx.internal",
            "password": "ValidPassword#2026!",
            "confirm_password": "ValidPassword#2026!",
            "role": "executive"
        }
    )
    assert res.status_code == 422, "Self-assigning executive role must be rejected with 422 Unprocessable Entity"


def test_registration_weak_password_rejected():
    res = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Weak Pass User",
            "email": f"weak_{int(time.time())}@precursorx.internal",
            "password": "simple",
            "confirm_password": "simple",
        }
    )
    assert res.status_code == 422, "Weak password without length and complexity must be rejected"


# ---------------------------------------------------------------------------
# 5. VERIFY AUTHENTICATED ACCESS TO OPERATIONAL ENDPOINTS (HTTP 200)
# ---------------------------------------------------------------------------

def test_authenticated_dashboard_summary(authenticated_client):
    res = authenticated_client.get("/api/v1/dashboard/summary?facility=all&timeframe=12W")
    assert res.status_code == 200
    data = res.json()
    assert "activeSifPrecursors" in data
    assert "barrierIntegrityPct" in data
    assert "facilityCount" in data


def test_authenticated_dashboard_telemetry(authenticated_client):
    res = authenticated_client.get("/api/v1/dashboard/telemetry")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_authenticated_dashboard_facilities(authenticated_client):
    res = authenticated_client.get("/api/v1/dashboard/facilities")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 8


def test_authenticated_dashboard_events(authenticated_client):
    res = authenticated_client.get("/api/v1/dashboard/events")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)


def test_authenticated_dashboard_priority_actions(authenticated_client):
    res = authenticated_client.get("/api/v1/dashboard/priority-actions")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)


def test_authenticated_risk_intelligence(authenticated_client):
    res = authenticated_client.get("/api/v1/risk-intelligence/telemetry?site=all&timeframe=90")
    assert res.status_code == 200
    data = res.json()
    assert "criticalCount" in data


def test_authenticated_safety_dna(authenticated_client):
    res = authenticated_client.get("/api/v1/safety-dna/patterns")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 4


def test_authenticated_safety_memory(authenticated_client):
    res = authenticated_client.get("/api/v1/safety-memory/search?query=sniff&mode=semantic")
    assert res.status_code == 200
    data = res.json()
    assert "totalMatches" in data


def test_authenticated_knowledge_graph(authenticated_client):
    res = authenticated_client.get("/api/v1/knowledge-graph")
    assert res.status_code == 200
    data = res.json()
    assert data["totalNodes"] > 0


def test_authenticated_barrier_simulation(authenticated_client):
    payload = {"barrierId": "ND-204", "action": "restore"}
    res = authenticated_client.post("/api/v1/knowledge-graph/barrier-simulation", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["barrierId"] == "ND-204"
    assert data["newStatus"] == "nominal"


def test_authenticated_what_changed(authenticated_client):
    res = authenticated_client.get("/api/v1/what-changed?baseline=Q3_BASELINE&active=CURRENT_30D")
    assert res.status_code == 200
    data = res.json()
    assert "precursorAcceleration" in data


def test_authenticated_facilities(authenticated_client):
    res = authenticated_client.get("/api/v1/facilities")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 8


# ---------------------------------------------------------------------------
# 6. MUTATING OPERATIONS REQUIRE AUTH & ATTRIBUTE USER IDENTITY
# ---------------------------------------------------------------------------

def test_authenticated_interventions_crud(authenticated_client):
    # 1. Create CAPA
    new_payload = {
        "title": "Automated Flare Sniffer Verification System",
        "description": "Deploy optical infrared detection on header 9.",
        "precursorPattern": "Pattern #01",
        "targetedVector": "Flare Knockout / Off-Gas",
        "lsrCode": "LSR-08",
        "lsrTitle": "Hot Work & Process Safety",
        "sifRiskPct": 78.0,
        "priority": "High",
        "targetFacility": "Site B (Eagle Ford Hub)",
        "ownerRole": "Senior Automation Engineer",
        "dueDate": "2024-05-15",
        "verificationMetric": "-70% Precursors"
    }
    create_res = authenticated_client.post("/api/v1/interventions", json=new_payload)
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["title"] == new_payload["title"]
    # Owner automatically attributed from authenticated user
    assert created["owner"] is not None

    # 2. Update CAPA
    patch_res = authenticated_client.patch(
        f"/api/v1/interventions/{created['id']}",
        json={"status": "Approved", "progressPct": 25.0}
    )
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["status"] == "Approved"


def test_authenticated_human_review_decision(authenticated_client):
    # Fetch queue
    q_res = authenticated_client.get("/api/v1/reviews")
    assert q_res.status_code == 200
    reviews = q_res.json()
    assert len(reviews) > 0
    first_id = reviews[0]["id"]

    # Submit decision
    decision_payload = {
        "decision": "ACCEPT",
        "specialistNotes": "Corroborated with camera telemetry and gas logs."
    }
    dec_res = authenticated_client.post(
        f"/api/v1/reviews/{first_id}/decision",
        json=decision_payload
    )
    assert dec_res.status_code == 200
    result = dec_res.json()
    assert result["status"] == "CERTIFIED"
    assert result["decision"] == "COMMITTED"
    # Reviewer identity authoritatively attributed to authenticated user
    assert "Test Safety Specialist" in result["verifiedBy"]
    assert result["reviewerUserId"] is not None


def test_authenticated_report_analyzer(authenticated_client):
    payload = {
        "text": "Technician entered vessel TK-402 without secondary gas sniff. Supervisor initiated Stop Work Authority."
    }
    mock_analysis = StructuredReportAnalysis(
        sifPotential="CRITICAL",
        sifScorePct=88,
        confidencePct=92,
        title="Atmospheric & Isolation Precursor Breach",
        explanation="Technician entered confined space without verified atmospheric testing and lockout isolation.",
        hazards=[HazardItem(name="Atmospheric Toxic Gas", threshold="LEL > 10%", level="critical")],
        precursors=[PrecursorItem(name="Gas Sniff Omission", evidence="No secondary gas sniff", weight=85, pattern_id="PAT-01")],
        consequences=[ConsequenceItem(title="Toxic Inhalation", severity="Critical", regulatoryTier="Tier 1")],
        lifeSavingRule=LifeSavingRuleItem(code="LSR-04", name="Confined Space Entry", standardsRef="OSHA 1910.146"),
        secondaryLsr="LSR-01",
        barrierFailures=[BarrierItem(id="BAR-01", name="Secondary Gas Sniffer", description="Omitted prior to entry", status="FAILED")],
        mitigatingControls=[MitigatingControlItem(name="Stop Work Authority", status="EFFECTIVE", description="Supervisor halted entry")],
        annotatedTokens=[AnnotatedTokenItem(id="tok-1", text="without secondary gas sniff", type="critical-precursor", description="Atmospheric breach")],
        tokensDetectedCount=1,
        processingTimeMs=240,
        ai_model="openai/gpt-oss-120b",
        source="AI INFERENCE"
    )
    with patch("app.services.report_service.report_service.analyze_report", new=AsyncMock(return_value=mock_analysis)):
        res = authenticated_client.post("/api/v1/reports/analyze", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["sifPotential"] in ["CRITICAL", "HIGH", "MODERATE", "LOW"]


# ---------------------------------------------------------------------------
# 7. VERIFY PRODUCTION CONFIGURATION FAIL-FAST POLICY
# ---------------------------------------------------------------------------

def test_production_fails_fast_without_auth_secret():
    with pytest.raises(ValueError) as exc_info:
        Settings(
            APP_ENV="production",
            AUTH_SECRET_KEY="",  # Missing secret
            ALLOWED_ORIGINS=["https://precursor-x-frontend.onrender.com"]
        )
    assert "AUTH_SECRET_KEY is required in production" in str(exc_info.value)


def test_production_fails_fast_with_insecure_placeholder():
    with pytest.raises(ValueError) as exc_info:
        Settings(
            APP_ENV="production",
            AUTH_SECRET_KEY="precursor-x-secure-auth-jwt-secret-key-change-in-prod-ccps",
            ALLOWED_ORIGINS=["https://precursor-x-frontend.onrender.com"]
        )
    assert "insecure placeholder" in str(exc_info.value)


def test_production_fails_fast_with_wildcard_cors():
    with pytest.raises(ValueError) as exc_info:
        Settings(
            APP_ENV="production",
            AUTH_SECRET_KEY="c84f689e83f219dbca4718c4e09f582da7324",
            ALLOWED_ORIGINS=["*"]
        )
    assert "Wildcard CORS origin '*' is forbidden in production" in str(exc_info.value)
