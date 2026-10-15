"""
Knowledge Graph API Routes.
Provides systemic ontology graph data and interactive barrier degradation / restoration simulation
grounded in PostgreSQL with authenticated operator verification.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...schemas.graph import (
    KnowledgeGraphResponse,
    BarrierSimulationRequest,
    BarrierSimulationResponse
)
from ...services.graph_service import graph_service
from ...models.entities import User
from ...db.session import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/knowledge-graph", tags=["Knowledge Graph"])


@router.get("", response_model=KnowledgeGraphResponse, summary="Get Full Knowledge Graph Ontology")
def get_knowledge_graph(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> KnowledgeGraphResponse:
    """
    Returns graph nodes, typed edges, centrality metrics, and active defense barrier statuses
    from PostgreSQL. Requires authenticated operator session.
    """
    return graph_service.get_graph(db=db)


@router.post("/barrier-simulation", response_model=BarrierSimulationResponse, summary="Simulate Barrier Degradation or Restoration")
def simulate_barrier(
    payload: BarrierSimulationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> BarrierSimulationResponse:
    """
    Deterministically recalculates downstream SIF risk and barrier integrity in PostgreSQL
    when a safety barrier is restored, degraded, or bypassed. Requires authenticated operator session.
    """
    return graph_service.simulate_barrier(db=db, barrier_id=payload.barrierId, action=payload.action)
