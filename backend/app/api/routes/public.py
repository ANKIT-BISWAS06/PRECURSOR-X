"""
Public (unauthenticated) routes.
Exposes only safe, non-sensitive aggregate metrics for the public landing page.
Never exposes node/edge content, safety-report data, or authenticated user information.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...schemas.public import PublicKnowledgeGraphSummary, PublicCentralityHub
from ...models.entities import KnowledgeGraphNode, KnowledgeGraphEdge
from ...db.session import get_db
from ...services.graph_service import GraphService

router = APIRouter(prefix="/public", tags=["Public"])
graph_service = GraphService()


@router.get(
    "/knowledge-graph/summary",
    response_model=PublicKnowledgeGraphSummary,
    summary="Public Knowledge Graph Aggregate Summary"
)
def get_public_knowledge_graph_summary(db: Session = Depends(get_db)) -> PublicKnowledgeGraphSummary:
    """
    Returns real PostgreSQL-derived aggregate counts for the landing page's
    graph telemetry strip. Deliberately minimal: node/edge counts, a
    standard graph-density figure (2E / N(N-1)) computed from those same
    counts, and the single highest-degree-centrality node (id/label/score
    only) reusing the existing graph_service topology centrality
    calculation. No edge relationships, no report content, no internal
    metadata beyond that — safe to serve without authentication.
    """
    node_count = db.query(KnowledgeGraphNode).count()
    edge_count = db.query(KnowledgeGraphEdge).count()

    density = None
    density_label = None
    if node_count > 1:
        density = round((2 * edge_count) / (node_count * (node_count - 1)), 3)
        density_label = "HIGH" if density >= 0.5 else "MODERATE" if density >= 0.2 else "LOW"

    centrality_hub = None
    if node_count >= 2:
        # Reuse the existing graph_service topology-centrality calculation
        # rather than a second/different algorithm.
        graph = graph_service.get_graph(db)
        if graph.nodes:
            top_node = max(graph.nodes, key=lambda n: n.centrality)
            centrality_hub = PublicCentralityHub(
                nodeId=top_node.id,
                label=top_node.label,
                score=top_node.centrality
            )

    return PublicKnowledgeGraphSummary(
        nodeCount=node_count,
        edgeCount=edge_count,
        density=density,
        densityLabel=density_label,
        centralityHub=centrality_hub
    )
