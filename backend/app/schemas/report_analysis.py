from typing import List, Optional
from pydantic import BaseModel, Field


class HazardItem(BaseModel):
    name: str
    threshold: str
    level: str = Field(description="Must be 'critical', 'high', or 'moderate'")


class PrecursorItem(BaseModel):
    name: str
    evidence: str
    weight: Optional[int] = Field(default=None, ge=1, le=100, description="Calibrated weight between 1 and 100")
    pattern_id: Optional[str] = Field(default=None, description="Known precursor pattern code if matching database")


class ConsequenceItem(BaseModel):
    title: str
    severity: str
    regulatoryTier: str


class LifeSavingRuleItem(BaseModel):
    code: Optional[str] = None
    name: str
    standardsRef: Optional[str] = None


class BarrierItem(BaseModel):
    id: Optional[str] = None
    name: str
    description: str
    status: str = Field(description="FAILED, BYPASSED, EFFECTIVE, or STANDBY")


class MitigatingControlItem(BaseModel):
    name: str
    status: str = Field(description="Status of mitigating control: EFFECTIVE, DEGRADED, or UNVERIFIED")
    description: Optional[str] = None


class AnnotatedTokenItem(BaseModel):
    id: str
    text: str
    type: str = Field(description="critical-precursor, barrier-breach, mitigating-action, or asset-tag")
    description: str


class StructuredReportAnalysis(BaseModel):
    sifPotential: str = Field(description="CRITICAL, HIGH, MODERATE, or LOW")
    sifScorePct: int = Field(ge=0, le=100)
    confidencePct: int = Field(ge=0, le=100)
    title: str
    explanation: str
    hazards: List[HazardItem]
    precursors: List[PrecursorItem]
    consequences: List[ConsequenceItem]
    lifeSavingRule: LifeSavingRuleItem
    secondaryLsr: Optional[str] = None
    barrierFailures: List[BarrierItem]
    mitigatingControls: Optional[List[MitigatingControlItem]] = None
    annotatedTokens: List[AnnotatedTokenItem]
    tokensDetectedCount: int = 0
    processingTimeMs: int = 0
    ai_model: Optional[str] = None
    source: str = "AI INFERENCE"
    report_id: Optional[str] = None
    review_id: Optional[str] = None
