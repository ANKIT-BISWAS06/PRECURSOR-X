from typing import List, Optional
from pydantic import BaseModel
from .common import SifPotentialLevel


class SafetyMemoryItemSchema(BaseModel):
    id: str
    code: str
    title: str
    matchScore: float
    sifPotential: SifPotentialLevel
    sifClassification: Optional[str] = None
    facility: str
    unit: Optional[str] = None
    date: Optional[str] = None
    year: Optional[int] = None
    governingLsr: Optional[str] = None
    narrative: str
    extractedPrecursors: List[str] = []
    precursorSignature: Optional[str] = None
    remediation: Optional[str] = None
    verified: bool = True
    category: str
    brokenBarrier: Optional[str] = None
    lessonsLearned: Optional[str] = None
    failureMechanism: Optional[str] = None


class SafetyMemorySearchResponse(BaseModel):
    query: str
    mode: str
    totalRecords: Optional[int] = 0
    totalMatches: Optional[int] = 0
    matchesCount: Optional[int] = 0
    results: List[SafetyMemoryItemSchema]
