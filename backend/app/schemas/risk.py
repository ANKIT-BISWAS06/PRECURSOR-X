from typing import List, Optional
from pydantic import BaseModel


class SiteAssetSchema(BaseModel):
    id: str
    code: str
    name: str
    region: str
    type: str
    basin: str
    activePermits: int
    reportsAnalyzed: int
    sifPrecursors: int
    precursorDelta: int
    precursorDensityPct: float
    barrierIntegrityPct: float
    compositeScore: int
    trend30d: str
    trendDirection: str
    riskClassification: str
    status: str


class RiskMatrixCellSchema(BaseModel):
    row: int
    col: int
    consequence: str
    likelihood: str
    count: int
    severity: str
    facilityIds: List[str]


class CausalFactorSchema(BaseModel):
    label: str
    percentage: int
    color: str
    details: str


class RiskMatrixResponse(BaseModel):
    cells: List[RiskMatrixCellSchema]
    totalEvents: int
    scale: float
    timeframe: str
    causalFactors: List[CausalFactorSchema] = []


class FacilitySummarySchema(BaseModel):
    id: str
    code: str
    name: str
    region: str
    type: str


class RiskTimelinePoint(BaseModel):
    timestamp: str
    risk: float


class RiskTelemetryResponse(BaseModel):
    sites: List[SiteAssetSchema]
    totalSites: int
    criticalCount: int
    highCount: int
    averageBarrierIntegrity: float
    timeline: List[RiskTimelinePoint] = []
