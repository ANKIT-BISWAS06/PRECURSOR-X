/**
 * PRECURSOR-X API Service Layer.
 * Direct HTTP bridge to FastAPI backend (/api/v1).
 * Normalizes backend responses for existing React pages without breaking contracts.
 */

import {
  SiteAsset,
  PrecursorPattern,
  SafetyMemoryItem,
  Intervention,
  HumanReviewItem,
  GraphNode,
  GraphEdge,
  SafetyRule,
  AIAnalysisResult,
  DashboardPriorityAction
} from '../types';
import { httpClient, ApiClientError, API_BASE_URL } from './httpClient';

export { ApiClientError, API_BASE_URL };

export interface BackendHealthResponse {
  status: string;
  service: string;
  version: string;
  environment: string;
}

export interface FacilityItem {
  id: string;
  code: string;
  name: string;
  region: string;
  type: string;
}

export interface DashboardMetrics {
  activeSifPrecursors: number;
  sifVelocityPct?: number | null;
  barrierIntegrityPct: number;
  barrierShiftDelta?: number | null;
  barrierIntegrityTargetPct?: number | null;
  executiveSifThreshold?: number | null;
  highEnergyReleases: number;
  interventionsDeployed: number;
  interventionsEfficacyPct?: number | null;
  timeframe: string;
  facilityCount: number;
}

export interface WhatChangedResult {
  baselinePeriod: string;
  activePeriod: string;
  precursorAcceleration: string;
  eventsInActive: number;
  eventsInBaseline: number;
  barrierIntegrityDrop: string;
  baselineIntegrity?: number | null;
  currentIntegrity?: number | null;
  emergentFailureModes: number;
  highEnergySpikes: number;
  keyShiftObservation: string;
  velocitySeries?: Array<{
    timestamp: string;
    events: number;
    precursorObservations: number;
  }>;
  divergenceCurve: {
    baselinePath: string;
    activePath: string;
    activePeakX: number;
    activePeakY: number;
    peakLabel: string;
    shiftDeltaPct?: string;
  };
  flaggedPrecursors: Array<{
    id: string;
    name: string;
    lsr: string;
    asset: string;
    baselineRate: string;
    activeRate: string;
    delta: string;
    badgeClass: string;
    recommendedCapaTitle: string;
    recommendedCapaVector: string;
    recommendedPriority: 'Critical' | 'High' | 'Moderate' | 'Low';
  }>;
}

export interface BarrierSimulationResult {
  barrierId: string;
  barrierName: string;
  action: string;
  newStatus: string;
  deltaIntegrityPct: number;
  impactedHazards: string[];
  sifRiskDeltaPct: number;
  recalculatedNodes: GraphNode[];
  barrierPrevProb?: string;
  barrierNewProb?: string;
  barrierPrevDecay?: string;
  barrierNewDecay?: string;
  sifPrevProb?: string;
  sifNewProb?: string;
  sifNewStatus?: string;
  sifNewDecay?: string;
}

export interface PublicCentralityHub {
  nodeId: string;
  label: string;
  score: number;
}

export interface PublicKnowledgeGraphSummary {
  nodeCount: number;
  edgeCount: number;
  density: number | null;
  densityLabel: 'LOW' | 'MODERATE' | 'HIGH' | null;
  centralityHub: PublicCentralityHub | null;
}

export const api = {
  // 0. Health Connectivity Check
  async checkHealth(): Promise<BackendHealthResponse> {
    return httpClient.get<BackendHealthResponse>('/health');
  },

  // 0b. Public landing-page telemetry (unauthenticated, safe aggregate counts only)
  async getPublicKnowledgeGraphSummary(): Promise<PublicKnowledgeGraphSummary> {
    return httpClient.get<PublicKnowledgeGraphSummary>('/public/knowledge-graph/summary');
  },

  // 1. Dashboard
  async getDashboardMetrics(facilityId: string = 'all', timeframe: string = '12W'): Promise<DashboardMetrics> {
    const params = new URLSearchParams();
    if (facilityId) params.append('facility', facilityId);
    if (timeframe) params.append('timeframe', timeframe);
    const query = params.toString() ? `?${params.toString()}` : '';
    return httpClient.get<DashboardMetrics>(`/dashboard/summary${query}`);
  },

  async getDashboardTelemetry(timeframe: string = '12W'): Promise<Array<{
    week: string;
    precursorVolume: number;
    barrierIntegrity: number;
    highEnergySpikes: number;
    activePermits: number;
  }>> {
    const params = new URLSearchParams({ timeframe });
    return httpClient.get(`/dashboard/telemetry?${params.toString()}`);
  },

  async getDashboardEvents(): Promise<Array<{
    id: string;
    time: string;
    facility: string;
    unit: string;
    type: string;
    severity: string;
    vector: string;
  }>> {
    return httpClient.get('/dashboard/events');
  },

  async getSitesTelemetry(search?: string): Promise<SiteAsset[]> {
    const params = new URLSearchParams();
    if (search && search.trim()) params.append('search', search.trim());
    const query = params.toString() ? `?${params.toString()}` : '';
    return httpClient.get<SiteAsset[]>(`/dashboard/facilities${query}`);
  },

  async getDashboardRules(category?: string): Promise<SafetyRule[]> {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.append('category', category);
    const query = params.toString() ? `?${params.toString()}` : '';
    return httpClient.get<SafetyRule[]>(`/dashboard/rules${query}`);
  },

  async getDashboardPriorityActions(): Promise<DashboardPriorityAction[]> {
    return httpClient.get<DashboardPriorityAction[]>('/dashboard/priority-actions');
  },

  // 2. Report Analyzer
  async analyzeReport(
    text: string,
    context?: { unit?: string; category?: string }
  ): Promise<AIAnalysisResult> {
    // Groq inference can legitimately take longer than the default request timeout (backend allows up to 35s).
    return httpClient.post<AIAnalysisResult>('/reports/analyze', {
      text,
      context
    }, { timeoutMs: 60000 });
  },

  // 3. Risk Intelligence
  async getRiskIntelligence(filters?: {
    site?: string;
    activity?: string;
    lsr?: string;
    timeframe?: string;
    highCriticalOnly?: boolean;
    search?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.site) params.append('site', filters.site);
    if (filters?.activity) params.append('activity', filters.activity);
    if (filters?.lsr) params.append('lsr', filters.lsr);
    if (filters?.timeframe) params.append('timeframe', filters.timeframe);
    if (filters?.highCriticalOnly) params.append('severity', 'high');
    if (filters?.search && filters.search.trim()) params.append('search', filters.search.trim());

    // Fetch facilities and matrix from FastAPI backend
    const [facilities, matrix] = await Promise.all([
      httpClient.get<SiteAsset[]>(`/risk-intelligence/facilities?${params.toString()}`),
      httpClient.get<{ totalEvents: number; cells: any[]; causalFactors?: Array<{ label: string; percentage: number; color: string; details: string }> }>(`/risk-intelligence/matrix?${params.toString()}`)
    ]);

    return {
      sites: facilities,
      totalEvents: matrix?.totalEvents !== undefined && matrix?.totalEvents !== null ? matrix.totalEvents : null,
      causalFactors: matrix?.causalFactors || []
    };
  },

  async getFacilities(): Promise<FacilityItem[]> {
    return httpClient.get<FacilityItem[]>('/facilities');
  },

  async getRiskTelemetry(site: string = 'all', timeframe: string = '90'): Promise<{
    sites: SiteAsset[];
    totalSites: number;
    criticalCount: number;
    highCount: number;
    averageBarrierIntegrity: number;
    timeline?: Array<{ timestamp: string; risk: number }>;
  }> {
    const params = new URLSearchParams({ site, timeframe });
    return httpClient.get(`/risk-intelligence/telemetry?${params.toString()}`);
  },

  async getRiskMatrix(filters?: { timeframe?: string; site?: string; activity?: string; lsr?: string }) {
    const params = new URLSearchParams();
    if (filters?.timeframe) params.append('timeframe', filters.timeframe);
    if (filters?.site) params.append('site', filters.site);
    if (filters?.activity) params.append('activity', filters.activity);
    if (filters?.lsr) params.append('lsr', filters.lsr);
    const query = params.toString() ? `?${params.toString()}` : '';
    return httpClient.get<{
      cells: Array<{ consequence: number; likelihood: number; count: number; riskLevel: string; label: string }>;
      totalEvents: number;
      scale: number;
      timeframe: string;
      causalFactors?: Array<{ label: string; percentage: number; color: string; details: string }>;
    }>(`/risk-intelligence/matrix${query}`);
  },

  // 4. Safety DNA
  async getSafetyDnaPatterns(category?: string, search?: string): Promise<PrecursorPattern[]> {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.append('category', category);
    if (search && search.trim()) params.append('search', search.trim());
    const query = params.toString() ? `?${params.toString()}` : '';
    return httpClient.get<PrecursorPattern[]>(`/safety-dna/patterns${query}`);
  },

  async getSafetyDNA(filter?: string): Promise<PrecursorPattern[]> {
    return this.getSafetyDnaPatterns(undefined, filter);
  },

  async getSafetyDnaMetrics() {
    return httpClient.get<{
      systemicBlindspotsIdentified: number;
      genomicStabilityIndex: number;
      meanTimeToPrecursorRecurrenceDays: number;
      totalClusteredObservations: number;
      activeThreatVectors: number;
      decayingBarriersCount: number;
      barrierDecayRadar: Array<{ barrier: string; integrityPct: number; driftRatePct: number }>;
    }>('/safety-dna/metrics');
  },

  async getSafetyDnaCausalChain(patternId?: string) {
    const params = new URLSearchParams();
    if (patternId) params.append('pattern_id', patternId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return httpClient.get<any>(`/safety-dna/causal-chain${query}`);
  },

  // 5. Safety Memory
  async searchSafetyMemory(
    query: string,
    options?: {
      mode?: 'semantic' | 'keyword' | 'fingerprint';
      facility?: string;
      category?: string;
      severity?: string;
    }
  ): Promise<{ results: SafetyMemoryItem[]; totalMatches: number; meanSimilarity: number | null; totalRecords?: number }> {
    const params = new URLSearchParams();
    if (query) params.append('query', query);
    if (options?.mode) params.append('mode', options.mode);
    if (options?.facility) params.append('facility', options.facility);
    if (options?.category) params.append('category', options.category);
    if (options?.severity) params.append('severity', options.severity);

    const data = await httpClient.get<{
      query: string;
      mode: string;
      totalMatches: number;
      totalRecords?: number;
      meanSimilarity?: number | null;
      results: SafetyMemoryItem[];
    }>(`/safety-memory/search?${params.toString()}`);

    const results = data.results || [];
    const validScores = results.filter((r) => r.matchScore !== null && r.matchScore !== undefined);
    let meanSimilarity: number | null = null;
    if (validScores.length > 0) {
      const sum = validScores.reduce((acc, r) => acc + r.matchScore, 0);
      meanSimilarity = Number((sum / validScores.length).toFixed(1));
    } else if (data.meanSimilarity !== undefined && data.meanSimilarity !== null) {
      meanSimilarity = data.meanSimilarity;
    }

    return {
      results,
      totalMatches: data.totalMatches ?? results.length,
      meanSimilarity,
      totalRecords: data.totalRecords
    };
  },

  // 6. Knowledge Graph
  async getKnowledgeGraph(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const res = await httpClient.get<{ nodes: GraphNode[]; edges: GraphEdge[]; totalNodes: number; totalEdges: number }>('/knowledge-graph');
    return {
      nodes: res.nodes,
      edges: res.edges
    };
  },

  async simulateBarrier(barrierId: string, action: 'restore' | 'degrade' | 'bypass' = 'restore'): Promise<BarrierSimulationResult> {
    return httpClient.post<BarrierSimulationResult>('/knowledge-graph/barrier-simulation', {
      barrierId,
      action
    });
  },

  async simulateKnowledgeGraphBarrier(nodeId: string, action: 'restore' | 'degrade'): Promise<{
    barrierName: string;
    action: string;
    newStatus: string;
    barrierPrevProb: string;
    barrierNewProb: string;
    barrierPrevDecay: string;
    barrierNewDecay: string;
    sifPrevProb: string;
    sifNewProb: string;
    sifNewStatus: 'critical' | 'mitigating' | 'nominal';
    sifNewDecay: string;
  }> {
    const res = await this.simulateBarrier(nodeId, action);
    const isRestore = action === 'restore';
    return {
      barrierName: res.barrierName || 'Safety Barrier',
      action: isRestore ? 'Barrier Restored' : 'Barrier Degraded',
      newStatus: res.newStatus === 'nominal' ? 'mitigating' : 'failed',
      barrierPrevProb: res.barrierPrevProb || '0.0%',
      barrierNewProb: res.barrierNewProb || '0.0%',
      barrierPrevDecay: res.barrierPrevDecay || 'Nominal',
      barrierNewDecay: res.barrierNewDecay || 'Nominal',
      sifPrevProb: res.sifPrevProb || '0.0%',
      sifNewProb: res.sifNewProb || '0.0%',
      sifNewStatus: (res.sifNewStatus || (isRestore ? 'nominal' : 'critical')) as 'critical' | 'mitigating' | 'nominal',
      sifNewDecay: res.sifNewDecay || 'Nominal'
    };
  },

  // 7. What Changed? - Velocity Differential
  async getWhatChangedDifferential(baselinePeriod: string, activePeriod: string): Promise<WhatChangedResult> {
    const params = new URLSearchParams({
      baseline: baselinePeriod,
      active: activePeriod
    });
    return httpClient.get<WhatChangedResult>(`/what-changed?${params.toString()}`);
  },

  // 8. Interventions / CAPA
  async getInterventions(filters?: { status?: string; priority?: string; search?: string }): Promise<Intervention[]> {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters?.priority && filters.priority !== 'all') params.append('priority', filters.priority);
    if (filters?.search && filters.search.trim()) params.append('search', filters.search.trim());
    const query = params.toString() ? `?${params.toString()}` : '';
    return httpClient.get<Intervention[]>(`/interventions${query}`);
  },

  async createIntervention(data: Partial<Omit<Intervention, 'id' | 'createdAt'>> & {
    title: string;
    description: string;
    targetFacility?: string;
    code?: string;
  }): Promise<Intervention> {
    return httpClient.post<Intervention>('/interventions', {
      title: data.title,
      description: data.description,
      targetFacility: data.targetFacility,
      code: data.code,
      precursorPattern: data.precursorPattern,
      targetedVector: data.targetedVector,
      lsrCode: data.lsrCode,
      lsrTitle: data.lsrTitle,
      sifRiskPct: data.sifRiskPct,
      priority: data.priority,
      status: data.status,
      affectedSitesSummary: data.affectedSitesSummary,
      observedRecurrence: data.observedRecurrence,
      protocolSteps: data.protocolSteps,
      verificationMetric: data.verificationMetric,
      owner: data.owner,
      ownerRole: data.ownerRole,
      dueDate: data.dueDate,
      progressPct: data.progressPct
    });
  },

  async updateIntervention(id: string, updates: Partial<Intervention>): Promise<Intervention> {
    return httpClient.patch<Intervention>(`/interventions/${encodeURIComponent(id)}`, updates);
  },

  async createInterventionFromPrecursor(data: {
    precursorId: string;
    actionType?: string;
  }): Promise<Intervention> {
    return httpClient.post<Intervention>('/interventions/from-precursor', data);
  },

  // 9. Human Review
  async getReviewQueue(status?: string): Promise<HumanReviewItem[]> {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.append('status', status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return httpClient.get<HumanReviewItem[]>(`/reviews${query}`);
  },

  async getReviewItem(id: string): Promise<HumanReviewItem> {
    return httpClient.get<HumanReviewItem>(`/reviews/${encodeURIComponent(id)}`);
  },

  async submitReviewDecision(
    id: string,
    decision: 'ACCEPT' | 'RECLASSIFY' | 'ESCALATE' | 'REJECT' | 'COMMITTED',
    notes?: string,
    adjustedSifLevel?: string,
    adjustedSifScorePct?: number
  ): Promise<any> {
    const normalizedDecision = decision === 'COMMITTED' ? 'ACCEPT' : decision;
    return httpClient.post(`/reviews/${encodeURIComponent(id)}/decision`, {
      decision: normalizedDecision,
      specialistNotes: notes ? notes.trim() : null,
      adjustedSifLevel: adjustedSifLevel || undefined,
      adjustedSifScorePct: adjustedSifScorePct !== undefined ? adjustedSifScorePct : undefined
    });
  },

  async commitReportGovernance(payload: {
    report_id?: string;
    review_id?: string;
    decision: 'COMMITTED' | 'RECLASSIFIED' | 'ESCALATED' | 'REJECTED';
    // No reviewer field: the backend derives reviewer identity from the authenticated PostgreSQL user.
    notes?: string;
    adjustedSifLevel?: string;
  }): Promise<{
    success: boolean;
    status: string;
    decision: string;
    reviewer: string;
    persistedAt: string;
    message: string;
  }> {
    return httpClient.post('/reports/governance', payload);
  },

  // 10. Global Search across entities
  async globalSearch(term: string) {
    if (!term || !term.trim()) return [];
    const q = term.trim();

    try {
      const [facilities, patterns, interventions] = await Promise.all([
        httpClient.get<SiteAsset[]>(`/dashboard/facilities?search=${encodeURIComponent(q)}`).catch(() => []),
        httpClient.get<PrecursorPattern[]>(`/safety-dna/patterns?search=${encodeURIComponent(q)}`).catch(() => []),
        httpClient.get<Intervention[]>(`/interventions?search=${encodeURIComponent(q)}`).catch(() => [])
      ]);

      const matchedSites = (facilities || []).map((s) => ({
        type: 'Site Asset',
        title: s.name,
        subtitle: `${s.region} • ${s.sifPrecursors} Precursors (${s.riskClassification})`,
        link: `/risk-intelligence`
      }));

      const matchedPrecursors = (patterns || []).map((p) => ({
        type: 'Precursor Pattern',
        title: `${p.code}: ${p.name}`,
        subtitle: `${p.occurrences} Events • ${p.sifPotential} Potential`,
        link: `/safety-dna`
      }));

      const matchedInterventions = (interventions || []).map((i) => ({
        type: 'Intervention',
        title: `${i.code}: ${i.title}`,
        subtitle: `${i.targetFacility} • ${i.priority} (${i.status})`,
        link: `/interventions`
      }));

      return [...matchedSites, ...matchedPrecursors, ...matchedInterventions];
    } catch {
      return [];
    }
  }
};
