export type SifPotentialLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface SafetyReport {
  id: string;
  code: string;
  date: string;
  siteId: string;
  siteName: string;
  unit: string;
  activity: string;
  reportType: 'Near Miss' | 'Incident' | 'Hazard Observation' | 'Audit Finding';
  description: string;
  sifPotential: SifPotentialLevel;
  confidence: number;
  hazards: string[];
  precursors: string[];
  lifeSavingRules: string[];
  barrierFailures: {
    name: string;
    status: 'FAILED' | 'BYPASSED' | 'EFFECTIVE' | 'STANDBY';
  }[];
  consequences: string[];
  reporter: string;
  status: 'PENDING_REVIEW' | 'VERIFIED' | 'COMMITTED' | 'ESCALATED';
}

export interface SiteAsset {
  id: string;
  code: string;
  name: string;
  region: string;
  type: string;
  basin: string;
  activePermits: number;
  reportsAnalyzed: number;
  sifPrecursors: number;
  precursorDelta: number;
  precursorDensityPct: number;
  barrierIntegrityPct: number;
  compositeScore: number;
  trend30d: string;
  trendDirection: 'up' | 'down' | 'stable';
  riskClassification: 'Critical' | 'High' | 'Moderate' | 'Stable';
  status: 'Critical Delta' | 'Protected' | 'Nominal' | 'Optimal';
}

export interface PrecursorPattern {
  id: string;
  code: string;
  name: string;
  category: string;
  sifPotential: SifPotentialLevel;
  sifScore: number;
  occurrences: number;
  affectedSitesCount: number;
  affectedSites: string[];
  trend30dPct: number;
  mtboDays?: number | null;
  confidence: number;
  keyVector: string;
  status: string;
  description: string;
  triad: {
    hazardClass: string;
    trigger: string;
    proceduralBreach: string;
    behavioralVariance: string;
    consequence: string;
  };
}

export interface SafetyMemoryItem {
  id: string;
  code: string;
  title: string;
  matchScore: number;
  sifPotential: SifPotentialLevel;
  sifClassification: string;
  facility: string;
  unit: string;
  date: string;
  governingLsr: string;
  narrative: string;
  extractedPrecursors: string[];
  remediation: string;
  verified: boolean;
  category: string;
  brokenBarrier?: string;
  lessonsLearned?: string;
  failureMechanism?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'hub' | 'hazard' | 'precursor' | 'rule' | 'site' | 'outcome' | 'intervention';
  category: string;
  sifWeight?: number;
  severity?: string;
  centrality?: number;
  betweenness?: number;
  incidentsCount?: number;
  details?: string;
  x: number;
  y: number;
  connections: string[];
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  type: 'triggers' | 'precedes' | 'violates' | 'harbors' | 'located_at' | 'leads_to';
  weight: number;
  color?: string;
}

export interface VelocityMetric {
  id: string;
  category: string;
  totalLogged: number;
  deltaPct: number;
  priorPeriodCount: number;
  status: 'Critical Shift' | 'Elevated' | 'Stabilizing' | 'Monitoring';
  statusColor: 'error' | 'secondary' | 'primary' | 'tertiary';
  sparkline: number[];
}

export interface VarianceItem {
  id: string;
  metric: string;
  prevCount: number;
  currCount: number;
  deltaPct: number;
  pValue: number;
  isSignificant: boolean;
}

export interface TimelineShiftEvent {
  id: string;
  date: string;
  relativeTime: string;
  sifPotentialPct?: number;
  badge: string;
  badgeType: 'error' | 'secondary' | 'primary';
  asset: string;
  title: string;
  description: string;
  linkText?: string;
}

export interface Intervention {
  id: string;
  code: string;
  title: string;
  description: string;
  precursorPattern?: string | null;
  targetedVector?: string | null;
  lsrCode?: string | null;
  lsrTitle?: string | null;
  sifRiskPct?: number | null;
  priority?: 'Critical' | 'High' | 'Moderate' | 'Low' | string | null;
  status: 'Proposed' | 'Under Review' | 'Approved' | 'In Progress' | 'Completed';
  targetFacility?: string | null;
  affectedSitesSummary?: string | null;
  observedRecurrence?: string | null;
  protocolSteps?: string[] | null;
  owner?: string | null;
  ownerRole?: string | null;
  dueDate?: string | null;
  progressPct?: number | null;
  verificationMetric?: string | null;
  sourceType?: string | null;
  sourceRecordId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface DashboardPriorityAction {
  id: string;
  sourceType: 'PRECURSOR_PATTERN' | 'SAFETY_EVENT' | 'FLAGGED_PRECURSOR' | string;
  sourceRecordId: string;
  title: string;
  description: string;
  facility?: string | null;
  location?: string | null;
  vector: string;
  priority?: 'Critical' | 'High' | 'Moderate' | 'Low' | string | null;
  escalationNotice?: string | null;
  status: 'pending' | 'dispatched';
  dispatchedInterventionId?: string | null;
  dispatchedInterventionCode?: string | null;
}

export interface HumanReviewItem {
  id: string;
  incidentCode: string;
  siteName?: string | null;
  unit?: string | null;
  eventTime: string;
  reporter?: string | null;
  vectorHash?: string | null;
  title: string;
  narrative?: string | null;
  annotatedTokens: {
    id: string;
    text: string;
    type?: string | null;
    weightPct?: number | null;
    description?: string | null;
  }[];
  aiSifLevel?: SifPotentialLevel | null;
  aiSifScorePct?: number | null;
  aiConfidencePct?: number | null;
  primaryLsr?: string | null;
  secondaryLsr?: string | null;
  featureTags: { name: string; weight?: number | null }[];
  barriers: {
    id: string;
    code?: string | null;
    name: string;
    description?: string | null;
    status?: string | null;
  }[];
  specialistNotes?: string | null;
  status: 'PENDING_REVIEW' | 'CERTIFIED' | 'ESCALATED' | 'REJECTED' | 'RECLASSIFIED';
  decision?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  opticalFeed?: {
    camId: string;
    label: string;
    timestamp: string;
    imageUrl: string;
    aiMaskNotes: string;
  } | null;
}

export interface SafetyRule {
  id: string;
  code: string;
  name: string;
  category: 'critical' | 'mechanical' | 'operational';
  icon: string;
  description: string;
  incidentsCount: number;
  percentage: number;
  barColorClass: string;
  standardsRef: string;
}

export interface AIAnalysisResult {
  sifPotential: SifPotentialLevel;
  sifScorePct: number;
  confidencePct: number;
  title: string;
  explanation: string;
  hazards: { name: string; threshold: string; level: 'critical' | 'high' | 'moderate' }[];
  precursors: { name: string; evidence: string; weight: number }[];
  consequences: { title: string; severity: string; regulatoryTier: string }[];
  lifeSavingRule: {
    code: string;
    name: string;
    standardsRef: string;
  };
  secondaryLsr?: string;
  barrierFailures: {
    id: string;
    name: string;
    description: string;
    status: 'FAILED' | 'BYPASSED' | 'EFFECTIVE' | 'STANDBY';
  }[];
  mitigatingControls?: {
    name: string;
    status: 'EFFECTIVE' | 'STANDBY' | 'FAILED';
    description?: string;
  }[];
  annotatedTokens: {
    id: string;
    text: string;
    type: 'critical-precursor' | 'barrier-breach' | 'mitigating-action' | 'asset-tag';
    description: string;
  }[];
  tokensDetectedCount: number;
  processingTimeMs: number;
  ai_model?: string;
  report_id?: string;
  review_id?: string;
}
