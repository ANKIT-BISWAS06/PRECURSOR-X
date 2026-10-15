from typing import List, Optional, Any
from pydantic import BaseModel, Field
from .common import SifPotentialLevel


class ReviewAnnotatedToken(BaseModel):
    id: str
    text: str
    type: Optional[str] = None
    weightPct: Optional[float] = None
    description: Optional[str] = None


class ReviewFeatureTag(BaseModel):
    name: str
    weight: Optional[float] = None


class ReviewBarrier(BaseModel):
    id: str
    code: Optional[str] = None
    name: str
    description: Optional[str] = None
    status: Optional[str] = None


class OpticalFeed(BaseModel):
    camId: str
    label: str
    timestamp: str
    imageUrl: str
    aiMaskNotes: str


class HumanReviewItemSchema(BaseModel):
    id: str
    incidentCode: str
    # Nullable in PostgreSQL -> stay null in the API; the UI renders N/A. Never fabricate a placeholder.
    siteName: Optional[str] = None
    unit: Optional[str] = None
    eventTime: str
    reporter: Optional[str] = None
    vectorHash: Optional[str] = None
    title: str
    narrative: Optional[str] = None
    annotatedTokens: List[ReviewAnnotatedToken] = []
    aiSifLevel: Optional[SifPotentialLevel] = None
    aiSifScorePct: Optional[float] = None
    aiConfidencePct: Optional[float] = None
    primaryLsr: Optional[str] = None
    secondaryLsr: Optional[str] = None
    featureTags: List[ReviewFeatureTag] = []
    barriers: List[ReviewBarrier] = []
    specialistNotes: Optional[str] = None
    status: str
    decision: Optional[str] = None
    reviewerUserId: Optional[str] = None
    verifiedBy: Optional[str] = None
    verifiedAt: Optional[str] = None
    opticalFeed: Optional[OpticalFeed] = None


class ReviewDecisionRequest(BaseModel):
    decision: str  # 'COMMITTED' | 'RECLASSIFIED' | 'ESCALATED' | 'REJECTED' | 'ACCEPT'
    specialistNotes: Optional[str] = None
    adjustedSifLevel: Optional[SifPotentialLevel] = None
    adjustedSifScorePct: Optional[float] = Field(default=None, ge=0, le=100)
    # NOTE: there is intentionally NO reviewer/name/email field. Reviewer identity is derived
    # server-side from the authenticated PostgreSQL user; unknown request keys are ignored.


class ReviewDecisionResponse(BaseModel):
    id: str
    status: str
    decision: str
    verifiedAt: str
    reviewerUserId: Optional[str] = None
    verifiedBy: str
    specialistNotes: Optional[str] = None
    item: HumanReviewItemSchema
