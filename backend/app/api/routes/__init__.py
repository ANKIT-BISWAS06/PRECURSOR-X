from .health import router as health_router
from .public import router as public_router
from .dashboard import router as dashboard_router
from .report_analyzer import router as report_analyzer_router
from .risk_intelligence import router as risk_intelligence_router
from .safety_dna import router as safety_dna_router
from .safety_memory import router as safety_memory_router
from .knowledge_graph import router as knowledge_graph_router
from .what_changed import router as what_changed_router
from .interventions import router as interventions_router
from .human_review import router as human_review_router
from .facilities import router as facilities_router
from .auth import router as auth_router

__all__ = [
    "health_router",
    "public_router",
    "dashboard_router",
    "report_analyzer_router",
    "risk_intelligence_router",
    "safety_dna_router",
    "safety_memory_router",
    "knowledge_graph_router",
    "what_changed_router",
    "interventions_router",
    "human_review_router",
    "facilities_router",
    "auth_router",
]
