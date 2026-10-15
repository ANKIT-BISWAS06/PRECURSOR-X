from typing import List, Optional
from pydantic import BaseModel
from .common import SifPotentialLevel


class HazardItem(BaseModel):
    name: str
    threshold: str
    level: str  # 'critical' | 'high' | 'moderate'


class PrecursorItem(BaseModel):
    name: str
    evidence: str
    weight: float


class ConsequenceItem(BaseModel):
    title: str
    severity: str
    regulatoryTier: str


class LifeSavingRuleItem(BaseModel):
    code: str
    name: str
    standardsRef: str


class BarrierFailureItem(BaseModel):
    id: str
    name: str
    description: str
    status: str  # 'FAILED' | 'BYPASSED' | 'EFFECTIVE' | 'STANDBY'


class MitigatingControlItem(BaseModel):
    name: str
    status: str  # 'EFFECTIVE' | 'STANDBY' | 'FAILED'
    description: Optional[str] = None


class AnnotatedTokenItem(BaseModel):
    id: str
    text: str
    type: str  # 'critical-precursor' | 'barrier-breach' | 'mitigating-action' | 'asset-tag'
    description: str


class AnalyzeReportRequest(BaseModel):
    text: str
    context: Optional[dict] = None


class AnalyzeReportResponse(BaseModel):
    sifPotential: SifPotentialLevel
    sifScorePct: int
    confidencePct: float
    title: str
    explanation: str
    hazards: List[HazardItem]
    precursors: List[PrecursorItem]
    consequences: List[ConsequenceItem]
    lifeSavingRule: LifeSavingRuleItem
    secondaryLsr: Optional[str] = None
    barrierFailures: List[BarrierFailureItem]
    mitigatingControls: Optional[List[MitigatingControlItem]] = []
    annotatedTokens: List[AnnotatedTokenItem]
    tokensDetectedCount: int
    processingTimeMs: int


class SafetyReportSchema(BaseModel):
    id: str
    code: str
    date: str
    siteId: str
    siteName: str
    unit: str
    activity: str
    reportType: str
    description: str
    sifPotential: SifPotentialLevel
    confidence: float
    hazards: List[str]
    precursors: List[str]
    lifeSavingRules: List[str]
    barrierFailures: List[dict]
    consequences: List[str]
    reporter: str
    status: str
