from typing import List, Optional
from pydantic import BaseModel, field_validator


class InterventionSchema(BaseModel):
    id: str
    code: str
    title: str
    description: str
    precursorPattern: Optional[str] = None
    targetedVector: Optional[str] = None
    lsrCode: Optional[str] = None
    lsrTitle: Optional[str] = None
    sifRiskPct: Optional[float] = None
    priority: Optional[str] = None  # 'Critical' | 'High' | 'Moderate' | 'Low'
    status: str    # 'Proposed' | 'Under Review' | 'Approved' | 'In Progress' | 'Completed'
    targetFacility: Optional[str] = None
    affectedSitesSummary: Optional[str] = None
    observedRecurrence: Optional[str] = None
    protocolSteps: Optional[List[str]] = None
    owner: Optional[str] = None
    ownerRole: Optional[str] = None
    dueDate: Optional[str] = None
    progressPct: Optional[float] = None
    verificationMetric: Optional[str] = None
    sourceType: Optional[str] = None
    sourceRecordId: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


class CreateInterventionFromPrecursorRequest(BaseModel):
    precursorId: str
    actionType: str = "DISPATCH_CAPA"

    @field_validator("actionType")
    @classmethod
    def validate_action_type(cls, v: str) -> str:
        if v != "DISPATCH_CAPA":
            raise ValueError(f"Unsupported actionType '{v}'. Supported values: 'DISPATCH_CAPA'")
        return v


class CreateInterventionRequest(BaseModel):
    title: str
    description: str
    precursorPattern: Optional[str] = None
    targetedVector: Optional[str] = None
    lsrCode: Optional[str] = None
    lsrTitle: Optional[str] = None
    sifRiskPct: Optional[float] = None
    priority: Optional[str] = None
    targetFacility: Optional[str] = None
    affectedSitesSummary: Optional[str] = None
    observedRecurrence: Optional[str] = None
    protocolSteps: Optional[List[str]] = None
    owner: Optional[str] = None
    ownerRole: Optional[str] = None
    dueDate: Optional[str] = None
    verificationMetric: Optional[str] = None
    sourceType: Optional[str] = None
    sourceRecordId: Optional[str] = None


class UpdateInterventionRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    progressPct: Optional[float] = None
    owner: Optional[str] = None
    dueDate: Optional[str] = None

