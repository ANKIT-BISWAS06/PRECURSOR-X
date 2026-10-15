from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


class GraphNodeSchema(BaseModel):
    id: str
    label: str
    type: str  # 'hub' | 'barrier' | 'hazard' | 'rule' | 'outcome'
    category: str
    sifWeight: float = Field(default=0.5, ge=0.0, le=1.0)
    severity: str
    centrality: float = Field(default=0.5, ge=0.0, le=1.0)
    betweenness: float = Field(default=0.5, ge=0.0, le=1.0)
    incidentsCount: int = 0
    details: str
    x: Optional[float] = None
    y: Optional[float] = None
    connections: List[str] = Field(default_factory=list)
    status: Optional[str] = "nominal"  # 'nominal' | 'failed' | 'bypassed' | 'critical'


class GraphEdgeSchema(BaseModel):
    id: str
    from_node: str = Field(..., alias="from")
    to: str
    label: str
    type: str
    weight: float = 1.0
    color: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class KnowledgeGraphResponse(BaseModel):
    nodes: List[GraphNodeSchema]
    edges: List[GraphEdgeSchema]
    totalNodes: int
    totalEdges: int


class BarrierSimulationRequest(BaseModel):
    barrierId: str
    action: str = Field(default="restore", description="'restore' | 'degrade' | 'bypass'")


class BarrierSimulationResponse(BaseModel):
    barrierId: str
    barrierName: str
    action: str
    newStatus: str
    deltaIntegrityPct: float
    impactedHazards: List[str]
    sifRiskDeltaPct: float
    recalculatedNodes: List[GraphNodeSchema]
    barrierPrevProb: Optional[str] = None
    barrierNewProb: Optional[str] = None
    barrierPrevDecay: Optional[str] = None
    barrierNewDecay: Optional[str] = None
    sifPrevProb: Optional[str] = None
    sifNewProb: Optional[str] = None
    sifNewStatus: Optional[str] = None
    sifNewDecay: Optional[str] = None
