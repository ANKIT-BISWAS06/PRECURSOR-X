from typing import Optional
from pydantic import BaseModel


class PublicCentralityHub(BaseModel):
    """
    The single highest-centrality node in the real PostgreSQL graph topology,
    as computed by the existing graph_service degree-centrality calculation.
    Only its id/label/score are exposed — no edges, no node metadata, no
    incident content.
    """
    nodeId: str
    label: str
    score: float


class PublicKnowledgeGraphSummary(BaseModel):
    """
    Safe, unauthenticated aggregate summary of the Knowledge Graph for the
    public landing page. Exposes only counts, a derived density metric, and
    the top centrality node's id/label/score — never edge relationships,
    safety-report content, or other internal identifiers.
    """
    nodeCount: int
    edgeCount: int
    # 2E / (N * (N-1)) — standard graph density, undefined for N < 2.
    density: Optional[float] = None
    densityLabel: Optional[str] = None  # 'LOW' | 'MODERATE' | 'HIGH', None if not computable
    # Real PostgreSQL-graph-derived top node by degree centrality. None when
    # fewer than 2 usable nodes exist (centrality is not meaningfully
    # computable) — never fabricated.
    centralityHub: Optional[PublicCentralityHub] = None
