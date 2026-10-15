from typing import List, Optional
from pydantic import BaseModel, Field
from enum import Enum


class SifPotentialLevel(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "precursor-x-backend"
    version: str = "0.1.0"
    environment: str = "development"


class DashboardMetrics(BaseModel):
    # Lineage: DATABASE / DATABASE_DERIVED
    activeSifPrecursors: int
    sifVelocityPct: Optional[float] = None
    barrierIntegrityPct: float
    barrierShiftDelta: Optional[float] = None
    barrierIntegrityTargetPct: Optional[float] = None
    executiveSifThreshold: Optional[int] = None
    highEnergyReleases: int
    interventionsDeployed: int
    interventionsEfficacyPct: Optional[float] = None
    timeframe: str
    facilityCount: int


class DashboardTelemetryPoint(BaseModel):
    week: str
    precursorVolume: int
    baselineThreshold: int
    highEnergySpikes: int


class DashboardEvent(BaseModel):
    id: str
    timestamp: str
    siteName: str
    unit: str
    type: str
    severity: str
    description: str
    status: str


class SafetyRuleSchema(BaseModel):
    id: str
    code: str
    name: str
    category: str
    icon: str
    description: str
    incidentsCount: int
    percentage: int
    barColorClass: str
    standardsRef: str


class DashboardPriorityAction(BaseModel):
    id: str
    sourceType: str  # 'PRECURSOR_PATTERN' | 'SAFETY_EVENT' | 'FLAGGED_PRECURSOR'
    sourceRecordId: str
    title: str
    description: str
    facility: Optional[str] = None
    location: Optional[str] = None
    vector: str
    priority: Optional[str] = None  # 'Critical' | 'High' | 'Moderate' | 'Low'
    escalationNotice: Optional[str] = None
    status: str  # 'pending' | 'dispatched'
    dispatchedInterventionId: Optional[str] = None
    dispatchedInterventionCode: Optional[str] = None

