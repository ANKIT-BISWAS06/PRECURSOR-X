import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, DashboardMetrics, FacilityItem } from '../services/api';
import { SiteAsset, SafetyRule, DashboardPriorityAction } from '../types';
import { ChartHoverLayer, TooltipCard, TooltipLabel, TooltipRow } from '../components/charts/ChartHoverLayer';
import { Disclosure } from '../components/ui/Disclosure';
import { PageHeader } from '../components/ui/PageHeader';
import { SeverityBadge, SeverityTone, toneClasses, toneFromLabel } from '../components/ui/Severity';

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, moderate: 2, medium: 2, low: 3 };
const rankOf = (p?: string | null) => (p ? PRIORITY_RANK[p.toLowerCase()] ?? 4 : 5);
const SOURCE_LABELS: Record<string, string> = {
  PRECURSOR_PATTERN: 'Recurring precursor pattern',
  SAFETY_EVENT: 'Safety event',
  FLAGGED_PRECURSOR: 'Flagged precursor',
};

interface AttentionTileProps {
  label: string;
  value: React.ReactNode;
  detail: string;
  tone?: SeverityTone;
  to: string;
}

const AttentionTile: React.FC<AttentionTileProps> = ({ label, value, detail, tone = 'neutral', to }) => {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={`text-left bg-surface-container-low rounded-xl p-space-lg border transition-colors hover:bg-surface-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 cursor-pointer min-w-0 ${
        tone === 'neutral' ? 'border-surface-container-high/40' : toneClasses[tone].border
      }`}
    >
      <span className="block font-body-sm text-body-sm text-on-surface-variant">{label}</span>
      <span
        className={`block font-headline-lg text-headline-lg font-bold tracking-tight mt-1 ${
          tone === 'neutral' ? 'text-on-surface' : toneClasses[tone].text
        }`}
      >
        {value}
      </span>
      <span className="block font-body-sm text-body-sm text-on-surface-variant mt-1 break-words">{detail}</span>
    </button>
  );
};

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [selectedAsset, setSelectedAsset] = useState<string>('all');
  const [timeframe, setTimeframe] = useState<string>('12W');
  const [chartView, setChartView] = useState<'freq' | 'decay'>('freq');
  const [lsrCategory, setLsrCategory] = useState<'all' | 'critical' | 'mechanical'>('all');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [exportStatus, setExportStatus] = useState<'idle' | 'compiling' | 'ready'>('idle');
  const [pendingReviewCount, setPendingReviewCount] = useState<number | null>(null);
  const [interventionCounts, setInterventionCounts] = useState<{ active: number; pending: number; completed: number } | null>(null);

  // Backend state
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [facilitiesList, setFacilitiesList] = useState<FacilityItem[]>([]);
  const [backendSites, setBackendSites] = useState<SiteAsset[]>([]);
  const [backendRules, setBackendRules] = useState<SafetyRule[]>([]);
  const [telemetryData, setTelemetryData] = useState<any[]>([]);
  const [priorityActions, setPriorityActions] = useState<DashboardPriorityAction[]>([]);
  const [priorityActionsError, setPriorityActionsError] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [m, s, r, t, f] = await Promise.all([
        api.getDashboardMetrics(selectedAsset, timeframe),
        api.getSitesTelemetry(tableSearch),
        api.getDashboardRules(lsrCategory),
        api.getDashboardTelemetry(timeframe),
        api.getFacilities(),
      ]);
      setMetrics(m);
      setBackendSites(s || []);
      setBackendRules(r || []);
      setTelemetryData(t || []);
      setFacilitiesList(f || []);
    } catch (err: any) {
      setError(err.message || 'Cannot reach the safety intelligence service.');
    }

    try {
      const pa = await api.getDashboardPriorityActions();
      setPriorityActions(pa || []);
      setPriorityActionsError(null);
    } catch (paErr: any) {
      setPriorityActions([]);
      setPriorityActionsError('Priority actions unavailable.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedAsset, timeframe, tableSearch, lsrCategory]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Pending reviews and intervention status come straight from the review and CAPA records.
  const loadAttentionCounts = useCallback(async () => {
    const [reviews, interventions] = await Promise.allSettled([api.getReviewQueue(), api.getInterventions()]);
    setPendingReviewCount(
      reviews.status === 'fulfilled' ? reviews.value.filter((r) => r.status === 'PENDING_REVIEW').length : null
    );
    if (interventions.status === 'fulfilled') {
      const list = interventions.value;
      setInterventionCounts({
        active: list.filter((i) => i.status === 'Approved' || i.status === 'In Progress').length,
        pending: list.filter((i) => i.status === 'Proposed' || i.status === 'Under Review').length,
        completed: list.filter((i) => i.status === 'Completed').length,
      });
    } else {
      setInterventionCounts(null);
    }
  }, []);

  useEffect(() => {
    loadAttentionCounts();
  }, [loadAttentionCounts]);

  // Most severe first; original backend order is kept within the same severity.
  const sortedActions = useMemo(
    () =>
      priorityActions
        .map((a, i) => ({ a, i }))
        .sort((x, y) => rankOf(x.a.priority) - rankOf(y.a.priority) || x.i - y.i)
        .map((x) => x.a),
    [priorityActions]
  );
  const topAction = sortedActions[0];
  const otherActions = sortedActions.slice(1);
  const visibleOtherActions = otherActions;

  // Dynamic SVG path calculation based strictly on backend telemetry records
  const dynamicSvg = useMemo(() => {
    // Only plot actual numeric observations - do NOT convert NULL measurements into 0
    const validObservations = (telemetryData || []).filter(
      (d) =>
        d &&
        d.precursorVolume !== null &&
        d.precursorVolume !== undefined &&
        typeof d.precursorVolume === 'number' &&
        !isNaN(d.precursorVolume)
    );

    if (validObservations.length < 2) {
      return {
        linePath: '',
        areaPath: '',
        points: [],
        currentVal: null,
        peakPoint: null,
        thresholdY: null,
        insufficientData: true
      };
    }
    const width = 700;
    const height = 240;
    const padX = 40;
    const padY = 40;

    const values = validObservations.map((d) =>
      chartView === 'freq' ? d.precursorVolume : Math.max(0, 100 - d.precursorVolume)
    );
    const minVal = Math.min(...values, 0);
    const maxVal = Math.max(...values, metrics?.executiveSifThreshold != null ? metrics.executiveSifThreshold : 1);
    const range = maxVal - minVal || 1;

    const pts = validObservations.map((d, idx) => {
      const x = padX + (idx / Math.max(1, validObservations.length - 1)) * (width - 2 * padX);
      const val = chartView === 'freq' ? d.precursorVolume : Math.max(0, 100 - d.precursorVolume);
      const y = height - padY - ((val - minVal) / range) * (height - 2 * padY);
      return { x: Math.round(x), y: Math.round(y), val, week: d.week };
    });

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = pts.length > 0 ? `${linePath} L ${pts[pts.length - 1].x} 220 L ${pts[0].x} 220 Z` : '';

    let peak = pts[0];
    for (const p of pts) {
      if (p.val > (peak ? peak.val : -Infinity)) peak = p;
    }

    const thresholdY = (metrics?.executiveSifThreshold != null && chartView === 'freq')
      ? Math.round(height - padY - ((metrics.executiveSifThreshold - minVal) / range) * (height - 2 * padY))
      : null;

    return {
      linePath,
      areaPath,
      points: pts,
      currentVal: values[values.length - 1],
      peakPoint: peak,
      thresholdY,
      lastPoint: pts[pts.length - 1] ?? null,
      insufficientData: false
    };
  }, [telemetryData, chartView, metrics?.executiveSifThreshold]);

  // Interventions action handler - Authoritative PostgreSQL resolution
  const handleActionClick = async (action: DashboardPriorityAction) => {
    if (!action.sourceRecordId) {
      showToast('No source record available.');
      return;
    }

    if (action.status === 'dispatched' || action.dispatchedInterventionCode) {
      navigate('/interventions');
      return;
    }

    setDispatchingId(action.id);
    setDispatchError(null);

    try {
      // Send only the necessary user action/reference to FastAPI
      // FastAPI retrieves the authoritative data from PostgreSQL and creates the intervention
      const created = await api.createInterventionFromPrecursor({
        precursorId: action.sourceRecordId,
        actionType: 'DISPATCH_CAPA'
      });

      // Update authoritative state from FastAPI response
      setPriorityActions((prev) =>
        prev.map((a) =>
          a.id === action.id
            ? {
                ...a,
                status: 'dispatched',
                dispatchedInterventionId: created.id,
                dispatchedInterventionCode: created.code
              }
            : a
        )
      );

      showToast(`CAPA dispatched: ${created.code}.`);
      loadAttentionCounts();
    } catch (err: any) {
      const errMsg = err?.message || 'CAPA dispatch failed.';
      setDispatchError(`CAPA dispatch failed: ${errMsg}`);
      showToast(`CAPA dispatch failed: ${errMsg}`);
    } finally {
      setDispatchingId(null);
    }
  };

  const handleExportDossier = () => {
    setExportStatus('compiling');
    setTimeout(() => {
      const dossier = {
        metadata: {
          platform: 'PRECURSOR-X Safety Intelligence Platform',
          exportType: 'Executive Risk Dossier',
          generatedAt: new Date().toISOString(),
          environment: 'PRODUCTION ARCHITECTURE • TRACEABLE TELEMETRY',
          assetScope: selectedAsset === 'all' ? `All Global Assets (${metrics?.facilityCount || backendSites.length} Facilities)` : selectedAsset,
          timeframe: timeframe
        },
        executiveTelemetry: {
          activeSifPrecursors: metrics ? metrics.activeSifPrecursors : 0,
          sifVelocityTrajectoryPct: metrics?.sifVelocityPct ?? null,
          barrierIntegrityOverallPct: metrics?.barrierIntegrityPct ?? null,
          barrierShiftDelta: metrics?.barrierShiftDelta ?? null,
          highEnergyReleasesRecorded: metrics ? metrics.highEnergyReleases : 0,
          priorityInterventionsDeployed: metrics ? metrics.interventionsDeployed : 0,
          interventionsEfficacyPct: metrics?.interventionsEfficacyPct ?? null
        },
        facilityBreakdown: filteredSites.map((s) => ({
          name: s.name,
          code: s.code,
          basin: s.basin,
          region: s.region,
          riskClassification: s.riskClassification,
          precursorDensityPct: s.precursorDensityPct,
          compositeScore: s.compositeScore,
          barrierIntegrityPct: s.barrierIntegrityPct,
          sifPrecursorsCount: s.sifPrecursors,
          activePermitsCount: s.activePermits
        })),
        lifeSavingRulesCompliance: filteredRules.map((r) => ({
          ruleId: r.id,
          name: r.name,
          category: r.category,
          incidentsCount: r.incidentsCount,
          compliancePct: r.percentage
        }))
      };

      const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `precursor_x_dossier_${selectedAsset}_${timeframe}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportStatus('ready');
      setTimeout(() => {
        setExportStatus('idle');
      }, 2500);
    }, 800);
  };

  // Filtered sites for telemetry table from backend
  const sourceSites = backendSites;
  const filteredSites = useMemo(() => {
    return sourceSites.filter((site) => {
      const matchesSearch =
        site.name.toLowerCase().includes(tableSearch.toLowerCase()) ||
        site.code.toLowerCase().includes(tableSearch.toLowerCase()) ||
        site.region.toLowerCase().includes(tableSearch.toLowerCase());

      if (selectedAsset === 'all') return matchesSearch;
      return matchesSearch && (site.id === selectedAsset || site.code.toLowerCase() === selectedAsset.toLowerCase());
    });
  }, [sourceSites, tableSearch, selectedAsset]);

  // Backend authoritative LSR rows
  const filteredRules = backendRules;

  const renderDispatchButton = (action: DashboardPriorityAction, large = false) => {
    const isCritical = (action.priority || '').toLowerCase() === 'critical';
    const dispatched = action.status === 'dispatched';
    const base = `font-label-code-md text-label-code-md rounded-lg flex items-center justify-center gap-1.5 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
      large ? 'px-space-xl py-space-md min-h-[44px]' : 'px-space-md py-1.5'
    }`;
    const tone = dispatched
      ? 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-outline/30'
      : isCritical
      ? 'bg-error text-on-error hover:bg-error/90'
      : 'bg-primary-container text-on-primary-container hover:bg-primary';
    return (
      <button
        type="button"
        onClick={() => handleActionClick(action)}
        disabled={!action.sourceRecordId || dispatchingId === action.id}
        className={`${base} ${tone}`}
      >
        {!action.sourceRecordId ? (
          <span>No source record</span>
        ) : dispatched ? (
          <>
            <span className="material-symbols-outlined text-[16px]">done</span>
            <span>Dispatched {action.dispatchedInterventionCode ? `(${action.dispatchedInterventionCode})` : '- open CAPA'}</span>
          </>
        ) : dispatchingId === action.id ? (
          <>
            <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
            <span>Dispatching…</span>
          </>
        ) : (
          <span>Dispatch CAPA</span>
        )}
      </button>
    );
  };

  const velocity = metrics?.sifVelocityPct ?? null;
  const barrierDelta = metrics?.barrierShiftDelta ?? null;
  const barrierTarget = metrics?.barrierIntegrityTargetPct ?? null;
  const barrierBelowTarget =
    metrics?.barrierIntegrityPct != null && barrierTarget != null && metrics.barrierIntegrityPct < barrierTarget;

  const siteRank = (c?: string | null) => (c ? PRIORITY_RANK[c.toLowerCase()] ?? 4 : 5);
  const rankedSites = useMemo(
    () =>
      [...filteredSites].sort(
        (a, b) => siteRank(a.riskClassification) - siteRank(b.riskClassification) || b.sifPrecursors - a.sifPrecursors
      ),
    [filteredSites]
  );
  const visibleSites = rankedSites;

  const siteTone = (c?: string | null): SeverityTone => {
    const t = toneFromLabel(c);
    return t === 'good' ? 'neutral' : t; // a "Low" classification is not a verified control
  };
  const barrierBarClass = (pct: number) => (pct < 80 ? 'bg-error' : pct < 90 ? 'bg-amber-300' : 'bg-primary-container');

  const topTone: SeverityTone = topAction ? toneFromLabel(topAction.priority) === 'good' ? 'neutral' : toneFromLabel(topAction.priority) : 'neutral';

  return (
    <div className="flex flex-col w-full gap-space-xl min-w-0">
      {/* Backend Error State */}
      {error && (
        <div role="alert" className="p-4 rounded-xl bg-error-container/30 border border-error/50 flex flex-wrap items-center justify-between gap-3 text-on-surface">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-error text-[20px] shrink-0">error</span>
            <span className="font-body-md text-body-md text-error break-words">{error}</span>
          </div>
          <button
            onClick={fetchDashboardData}
            className="px-3 py-1 rounded bg-error text-on-error font-label-code-sm text-label-code-sm flex items-center gap-1 hover:bg-error/90 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            <span>Retry</span>
          </button>
        </div>
      )}

      <PageHeader
        title="Executive Risk Command"
        question="What needs attention right now?"
        actions={
          <>
            <div className="relative w-full sm:w-auto sm:min-w-[240px]">
              <select
                aria-label="Select facility"
                className="w-full bg-surface-container text-on-surface font-body-sm text-body-sm px-space-md py-space-sm rounded-lg appearance-none cursor-pointer focus:outline-none focus:bg-surface-container-high transition-colors pr-8 border border-surface-container-high/60"
                value={selectedAsset}
                onChange={(e) => setSelectedAsset(e.target.value)}
              >
                <option value="all">
                  {facilitiesList.length > 0
                    ? `All facilities (${facilitiesList.length})`
                    : metrics?.facilityCount
                    ? `All facilities (${metrics.facilityCount})`
                    : 'All facilities'}
                </option>
                {facilitiesList.map((fac) => (
                  <option key={fac.id} value={fac.id}>
                    {fac.name} ({fac.code})
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-[18px]">
                expand_more
              </span>
            </div>

            <div role="group" aria-label="Timeframe" className="flex items-center bg-surface-container p-1 rounded-lg border border-surface-container-high/40">
              {['7D', '30D', '12W', 'Q3'].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  aria-pressed={timeframe === tf}
                  className={`px-space-md py-1 rounded font-label-code-md text-label-code-md transition-colors ${
                    timeframe === tf
                      ? 'bg-primary-container text-on-primary-container font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <button
              onClick={handleExportDossier}
              disabled={exportStatus === 'compiling'}
              className="flex items-center gap-space-xs bg-surface-container hover:bg-surface-container-high text-on-surface border border-surface-container-high/60 font-label-code-md text-label-code-md font-semibold px-space-md py-space-sm rounded-lg transition-colors disabled:opacity-60"
            >
              <span className={`material-symbols-outlined text-[18px] ${exportStatus === 'compiling' ? 'animate-spin' : ''}`}>
                {exportStatus === 'compiling' ? 'sync' : exportStatus === 'ready' ? 'verified' : 'download'}
              </span>
              <span>{exportStatus === 'compiling' ? 'Preparing…' : exportStatus === 'ready' ? 'Dossier ready' : 'Export dossier'}</span>
            </button>
          </>
        }
      />

      {/* 1. Primary finding: the most serious current risk, why it matters, what to do next */}
      <section aria-label="Top priority" className="flex flex-col gap-space-md">
        {priorityActionsError ? (
          <div role="alert" className="bg-surface-container-low p-space-xl rounded-xl border border-error/30 flex flex-wrap items-center justify-between gap-space-md">
            <div className="flex items-center gap-space-sm min-w-0">
              <span className="material-symbols-outlined text-error text-[24px] shrink-0">cloud_off</span>
              <div>
                <p className="font-headline-sm text-headline-sm text-error font-semibold">Priority actions unavailable</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  The service did not return priority actions, so this view cannot confirm that nothing needs attention.
                </p>
              </div>
            </div>
            <button
              onClick={fetchDashboardData}
              className="px-space-md py-1.5 rounded-lg bg-surface-container-high text-on-surface font-label-code-md text-label-code-md font-semibold hover:bg-surface-container-highest"
            >
              Retry
            </button>
          </div>
        ) : !topAction ? (
          <div className="bg-surface-container-low p-space-xl rounded-xl border border-surface-container-high/40 flex items-start gap-space-md">
            <span className="material-symbols-outlined text-primary text-[28px] shrink-0">
              {isLoading ? 'progress_activity' : 'check_circle'}
            </span>
            <div className="min-w-0">
              <p className="font-headline-md text-headline-md text-on-surface font-semibold">
                {isLoading ? 'Checking for priority risks…' : 'No priority actions right now'}
              </p>
              {!isLoading && (
                <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                  No unmitigated precursor patterns or high-severity events currently need immediate corrective action.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div
            className={`bg-surface-container-low rounded-xl border p-space-xl flex flex-col gap-space-lg ${
              topTone === 'neutral' ? 'border-surface-container-high/50' : toneClasses[topTone].border
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-space-md gap-y-space-xs">
              <span className="font-body-sm text-body-sm text-on-surface-variant">Most serious current risk</span>
              {topAction.priority ? (
                <SeverityBadge label={`${topAction.priority} SIF potential`} tone={topTone} />
              ) : (
                <SeverityBadge label="Monitored" tone="neutral" />
              )}
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                {topAction.location || topAction.facility || 'Facility not specified'}
              </span>
            </div>

            <div className="flex flex-col gap-space-sm min-w-0">
              <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold break-words">{topAction.title}</h2>
              <p className="font-body-lg text-body-lg text-on-surface-variant break-words max-w-3xl">{topAction.description}</p>
              {topAction.escalationNotice && (
                <p className={`font-body-md text-body-md font-medium break-words ${topTone === 'critical' ? 'text-error' : 'text-on-surface'}`}>
                  {topAction.escalationNotice}
                </p>
              )}
            </div>

            {dispatchError && (
              <div role="alert" className="p-space-sm rounded bg-error/15 border border-error/40 text-error font-body-sm flex items-start justify-between gap-space-sm">
                <span className="break-words min-w-0">{dispatchError}</span>
                <button onClick={() => setDispatchError(null)} className="text-error hover:underline text-xs shrink-0">
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-space-md">
              {renderDispatchButton(topAction, true)}
              <button
                type="button"
                onClick={() => navigate('/risk-intelligence')}
                className="px-space-lg py-space-md min-h-[44px] rounded-lg font-label-code-md text-label-code-md font-semibold text-primary hover:bg-surface-container transition-colors"
              >
                See where risk is concentrated
              </button>
            </div>

            {/* Supporting evidence directly under the finding */}
            <dl className="flex flex-wrap gap-x-space-xl gap-y-space-sm pt-space-md border-t border-surface-container-high/40 font-body-sm text-body-sm">
              <div className="min-w-0">
                <dt className="text-outline">Source</dt>
                <dd className="text-on-surface">{SOURCE_LABELS[topAction.sourceType] || topAction.sourceType}</dd>
              </div>
              {topAction.vector && (
                <div className="min-w-0">
                  <dt className="text-outline">Hazard vector</dt>
                  <dd className="text-on-surface break-words">{topAction.vector}</dd>
                </div>
              )}
              <div className="min-w-0">
                <dt className="text-outline">Status</dt>
                <dd className="text-on-surface">
                  {topAction.status === 'dispatched' ? 'Corrective action dispatched' : 'No corrective action dispatched yet'}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {/* Other items that need attention, most severe first */}
        {otherActions.length > 0 && (
          <div className="bg-surface-container-low rounded-xl border border-surface-container-high/40 divide-y divide-surface-container-high/40">
            <p className="px-space-lg py-space-md font-headline-sm text-headline-sm font-semibold text-on-surface">
              Also needs attention ({otherActions.length})
            </p>
            {visibleOtherActions.map((action) => {
              const tone = toneFromLabel(action.priority) === 'good' ? 'neutral' : toneFromLabel(action.priority);
              return (
                <div key={action.id} className="px-space-lg py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <SeverityBadge label={action.priority || 'Monitored'} tone={tone} />
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        {action.location || action.facility || 'Facility not specified'}
                      </span>
                    </div>
                    <span className="font-body-md text-body-md text-on-surface font-medium break-words">{action.title}</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant break-words">{action.description}</span>
                  </div>
                  <div className="shrink-0 self-start sm:self-center">{renderDispatchButton(action)}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. What else needs attention: four things, each leading to its page */}
      <section aria-label="Attention summary" className="grid grid-cols-2 lg:grid-cols-4 gap-space-md">
        <AttentionTile
          label="Reviews pending"
          value={pendingReviewCount ?? '—'}
          detail={
            pendingReviewCount == null
              ? 'Unavailable'
              : pendingReviewCount > 0
              ? 'Waiting for a specialist decision'
              : 'Nothing waiting for review'
          }
          tone={pendingReviewCount ? 'warning' : 'neutral'}
          to="/human-review"
        />
        <AttentionTile
          label="Interventions active"
          value={interventionCounts ? interventionCounts.active : '—'}
          detail={
            interventionCounts
              ? `${interventionCounts.pending} pending · ${interventionCounts.completed} completed`
              : 'Unavailable'
          }
          to="/interventions"
        />
        <AttentionTile
          label="Active SIF precursors"
          value={metrics?.activeSifPrecursors != null ? metrics.activeSifPrecursors : isLoading ? '…' : 'N/A'}
          detail={
            velocity == null
              ? 'Not enough history to show a trend'
              : velocity > 0
              ? `Rising ${Math.abs(velocity)}% over ${metrics?.timeframe ?? 'period'}`
              : velocity < 0
              ? `Falling ${Math.abs(velocity)}% over ${metrics?.timeframe ?? 'period'}`
              : `No change over ${metrics?.timeframe ?? 'period'}`
          }
          tone={velocity != null && velocity > 0 ? 'warning' : 'neutral'}
          to="/what-changed"
        />
        <AttentionTile
          label="Barrier integrity"
          value={metrics?.barrierIntegrityPct != null ? `${metrics.barrierIntegrityPct}%` : isLoading ? '…' : 'N/A'}
          detail={
            [
              barrierDelta != null ? `${barrierDelta > 0 ? '+' : ''}${barrierDelta}% vs prior period` : null,
              barrierTarget != null ? `target above ${barrierTarget.toFixed(1)}%` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Not enough history to show a trend'
          }
          tone={(barrierDelta != null && barrierDelta < 0) || barrierBelowTarget ? 'warning' : 'neutral'}
          to="/risk-intelligence"
        />
      </section>

      {/* 3. Evidence: trend behind the numbers above */}
      <Disclosure
        title="Risk trend"
        summary={`SIF precursor volume over ${metrics?.timeframe ?? timeframe}${
          metrics?.executiveSifThreshold != null ? `, against the executive limit of ${metrics.executiveSifThreshold}` : ''
        }`}
        defaultOpen
        actions={
          <div role="group" aria-label="Chart view" className="inline-flex bg-surface-container p-1 rounded-lg border border-surface-container-high/30">
            {([
              ['freq', 'SIF frequency'],
              ['decay', 'Barrier decay'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setChartView(key)}
                aria-pressed={chartView === key}
                className={`px-space-md py-1 rounded font-label-code-sm text-label-code-sm transition-colors ${
                  chartView === key
                    ? 'bg-primary-container text-on-primary-container font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface font-medium'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
            <div className="w-full bg-surface-container-lowest p-space-lg rounded-xl relative overflow-visible">
              {telemetryData.length === 0 ? (
                <div className="h-64 w-full flex flex-col items-center justify-center gap-space-sm text-center p-space-lg">
                  <span className="material-symbols-outlined text-outline text-[36px]">show_chart</span>
                  <span className="font-headline-sm text-on-surface font-semibold">No SIF telemetry available</span>
                  <p className="font-body-sm text-on-surface-variant max-w-sm">
                    No precursor history is recorded for the selected timeframe.
                  </p>
                </div>
              ) : telemetryData.length === 1 ? (
                <div className="h-64 w-full flex flex-col items-center justify-center gap-space-sm text-center p-space-lg">
                  <span className="material-symbols-outlined text-outline text-[36px]">timeline</span>
                  <span className="font-headline-sm text-on-surface font-semibold">Insufficient historical data</span>
                  <p className="font-body-sm text-on-surface-variant max-w-sm">
                    A minimum of two telemetry intervals is required to calculate escalation dynamics.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-x-space-lg gap-y-1 text-outline font-label-code-sm text-label-code-sm mb-2">
                    <span>
                      {telemetryData[0] ? `${telemetryData[0].week} (Baseline: ${telemetryData[0].precursorVolume != null ? `${telemetryData[0].precursorVolume} SIF` : 'No telemetry'})` : ''}
                    </span>
                    <span className="flex items-center gap-1.5 text-error">
                      <span className="w-2 h-0.5 bg-error"></span> Executive Limit: {metrics?.executiveSifThreshold != null ? `${metrics.executiveSifThreshold} SIF` : 'Threshold Not Configured'}
                    </span>
                    <span>
                      {telemetryData[telemetryData.length - 1] ? `${telemetryData[telemetryData.length - 1].week} (Current: ${metrics?.activeSifPrecursors != null ? `${metrics.activeSifPrecursors} SIF` : (telemetryData[telemetryData.length - 1].precursorVolume != null ? `${telemetryData[telemetryData.length - 1].precursorVolume} SIF` : 'No telemetry')})` : ''}
                    </span>
                  </div>

                  <div className="relative h-64 w-full flex items-center justify-center">
                    {dynamicSvg.insufficientData ? (
                      <div className="flex flex-col items-center justify-center gap-2 text-on-surface-variant font-label-code-sm text-label-code-sm p-space-lg text-center">
                        <span className="material-symbols-outlined text-outline text-[32px]">query_stats</span>
                        <span className="text-on-surface font-semibold">Insufficient Telemetry History</span>
                        <span className="text-outline text-xs">Fewer than 2 validated numeric observations recorded for this timeframe.</span>
                      </div>
                    ) : (
                      <ChartHoverLayer
                        points={dynamicSvg.points}
                        viewBoxWidth={700}
                        viewBoxHeight={240}
                        className="w-full h-full"
                        renderTooltip={(p) => (
                          <TooltipCard>
                            <TooltipLabel>{p.week ?? 'N/A'}</TooltipLabel>
                            <TooltipRow
                              label={chartView === 'freq' ? 'SIF Frequency' : 'Barrier Decay'}
                              value={p.val != null ? `${p.val}${chartView === 'freq' ? ' SIF' : '%'}` : 'N/A'}
                            />
                          </TooltipCard>
                        )}
                      >
                        {({ hoveredIndex }) => (
                          <>
                            <svg
                              className="w-full h-full overflow-visible"
                              preserveAspectRatio="none"
                              viewBox="0 0 700 240"
                            >
                              <defs>
                                <linearGradient id="gradientSIF" x1="0" x2="0" y1="0" y2="1">
                                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
                                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                                </linearGradient>
                                <linearGradient id="gradientBreach" x1="0" x2="0" y1="0" y2="1">
                                  <stop offset="0%" stopColor="#ffb4ab" stopOpacity="0.4" />
                                  <stop offset="100%" stopColor="#ffb4ab" stopOpacity="0" />
                                </linearGradient>
                              </defs>

                              {/* Grid Lines */}
                              <line stroke="#31353e" strokeDasharray="4 4" strokeWidth="1" x1="0" x2="700" y1="40" y2="40" />
                              <line stroke="#31353e" strokeDasharray="4 4" strokeWidth="1" x1="0" x2="700" y1="100" y2="100" />
                              <line stroke="#31353e" strokeDasharray="4 4" strokeWidth="1" x1="0" x2="700" y1="160" y2="160" />
                              <line stroke="#31353e" strokeWidth="1" x1="0" x2="700" y1="220" y2="220" />

                              {/* Critical Threshold Line - Drawn strictly if configured */}
                              {dynamicSvg.thresholdY != null && (
                                <line stroke="#ffb4ab" strokeDasharray="6 6" strokeWidth="1.5" x1="0" x2="700" y1={dynamicSvg.thresholdY} y2={dynamicSvg.thresholdY} />
                              )}

                              {/* Hover Guide Line */}
                              {hoveredIndex != null && dynamicSvg.points[hoveredIndex] && (
                                <line
                                  stroke="#38bdf8"
                                  strokeOpacity="0.35"
                                  strokeWidth="1.5"
                                  x1={dynamicSvg.points[hoveredIndex].x}
                                  x2={dynamicSvg.points[hoveredIndex].x}
                                  y1="0"
                                  y2="220"
                                />
                              )}

                              {/* Dynamic Database-Driven Telemetry Curve & Area */}
                              {dynamicSvg.areaPath && (
                                <path
                                  d={dynamicSvg.areaPath}
                                  fill="url(#gradientSIF)"
                                />
                              )}
                              {dynamicSvg.linePath && (
                                <path
                                  d={dynamicSvg.linePath}
                                  fill="none"
                                  stroke="#38bdf8"
                                  strokeLinecap="round"
                                  strokeWidth="3"
                                />
                              )}

                              {/* Data Points */}
                              {dynamicSvg.points.map((p, i) => (
                                <circle
                                  key={i}
                                  cx={p.x}
                                  cy={p.y}
                                  r={hoveredIndex === i ? 6 : 4}
                                  fill="#38bdf8"
                                  stroke="#0a0e16"
                                  strokeWidth={hoveredIndex === i ? 2 : 1.5}
                                  className="transition-all duration-100"
                                />
                              ))}

                              {/* Peak Marker */}
                              {dynamicSvg.peakPoint && (
                                <>
                                  <circle cx={dynamicSvg.peakPoint.x} cy={dynamicSvg.peakPoint.y} r="7" fill="#38bdf8" className="animate-ping opacity-60" />
                                  <circle cx={dynamicSvg.peakPoint.x} cy={dynamicSvg.peakPoint.y} r="4" fill="#dfe2ee" stroke="#004965" strokeWidth="2" />
                                </>
                              )}
                            </svg>

                            {/* Callout Annotation */}
                            {dynamicSvg.peakPoint && (
                              <div className="absolute left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-[92%] top-4 bg-surface-container-high px-space-md py-1.5 rounded shadow-md flex items-start gap-space-xs pointer-events-none">
                                <span className="w-2 h-2 rounded-full bg-error animate-pulse shrink-0 mt-1"></span>
                                <span className="font-label-code-sm text-label-code-sm text-on-surface font-semibold break-words">
                                  Peak: {dynamicSvg.peakPoint.week} ({dynamicSvg.peakPoint.val} SIF)
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </ChartHoverLayer>
                    )}
                  </div>

                  {/* Legend & Trajectory Summary */}
                  <div className="flex flex-wrap items-center justify-between gap-space-md pt-space-md mt-space-sm bg-surface-container-low/40 px-space-md py-space-sm rounded-lg">
                    <div className="flex items-center gap-space-lg font-label-code-sm text-label-code-sm">
                      <div className="flex items-center gap-space-xs">
                        <span className="w-3 h-1 bg-primary-container rounded"></span>
                        <span className="text-on-surface">Observed SIF precursors</span>
                      </div>
                      {metrics?.executiveSifThreshold != null && (
                        <div className="flex items-center gap-space-xs">
                          <span className="w-3 h-0.5 bg-error rounded"></span>
                          <span className="text-on-surface-variant">Executive Limit ({metrics.executiveSifThreshold} SIF)</span>
                        </div>
                      )}
                    </div>
                    <span className="font-label-code-sm text-label-code-sm text-primary font-medium">
                      Trajectory: {metrics?.sifVelocityPct != null ? `${metrics.sifVelocityPct}% Velocity` : 'N/A'}
                    </span>
                  </div>
                </>
              )}
            </div>
      </Disclosure>

      {/* 4. Where risk is concentrated */}
      <Disclosure
        title="Facilities by risk"
        summary={
          rankedSites.length > 0
            ? `${rankedSites.length} facilities, most severe first`
            : 'Facility risk ranking'
        }
        defaultOpen
        actions={
          <div className="relative">
            <span className="material-symbols-outlined absolute left-space-sm top-1/2 -translate-y-1/2 text-outline text-[16px]">search</span>
            <input
              aria-label="Filter facilities"
              className="bg-surface-container font-body-sm text-body-sm text-on-surface pl-8 pr-space-md py-1.5 rounded-lg focus:outline-none focus:bg-surface-container-high w-40 sm:w-64 border border-surface-container-high/50"
              placeholder="Filter facilities"
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
            />
          </div>
        }
      >
        {isLoading ? (
          <div className="py-8 text-center text-on-surface-variant font-body-sm flex items-center justify-center gap-2">
            <span className="material-symbols-outlined animate-spin text-primary text-[20px]">progress_activity</span>
            Loading facilities…
          </div>
        ) : rankedSites.length === 0 ? (
          <div className="py-8 text-center text-outline font-body-sm">No facilities match the current filters.</div>
        ) : (
          <>
            {/* Wide screens: table */}
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-outline font-body-sm text-body-sm border-b border-surface-container-high/60">
                    <th className="py-space-sm px-space-md font-medium">Facility</th>
                    <th className="py-space-sm px-space-md font-medium">SIF precursors</th>
                    <th className="py-space-sm px-space-md font-medium">Barrier integrity</th>
                    <th className="py-space-sm px-space-md font-medium">Risk</th>
                    <th className="py-space-sm px-space-md" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-high/50 font-body-sm text-body-sm text-on-surface">
                  {visibleSites.map((site) => (
                    <tr key={site.id} className="hover:bg-surface-container transition-colors">
                      <td className="py-space-md px-space-md">
                        <div className="flex flex-col min-w-0">
                          <span className="font-body-md text-body-md font-semibold text-on-surface break-words">{site.name}</span>
                          <span className="text-outline">{site.code} · {site.region}</span>
                        </div>
                      </td>
                      <td className="py-space-md px-space-md font-semibold whitespace-nowrap">
                        {site.sifPrecursors}{' '}
                        <span className={`font-normal ${site.precursorDelta > 0 ? 'text-error' : 'text-outline'}`}>
                          ({site.precursorDelta > 0 ? `+${site.precursorDelta}` : site.precursorDelta})
                        </span>
                      </td>
                      <td className="py-space-md px-space-md w-48">
                        <div className="flex flex-col gap-1">
                          <span className="text-on-surface-variant">
                            {site.barrierIntegrityPct}%
                            {site.status && <span className={site.status === 'Critical Delta' ? 'text-error' : 'text-outline'}> · {site.status}</span>}
                          </span>
                          <div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                            <div className={`h-full rounded-full ${barrierBarClass(site.barrierIntegrityPct)}`} style={{ width: `${Math.min(100, Math.max(0, site.barrierIntegrityPct))}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="py-space-md px-space-md">
                        <SeverityBadge label={site.riskClassification} tone={siteTone(site.riskClassification)} />
                      </td>
                      <td className="py-space-md px-space-md text-right">
                        <button
                          onClick={() => (site.id ? navigate(`/risk-intelligence?site=${encodeURIComponent(site.id)}`) : showToast('No source record available.'))}
                          disabled={!site.id}
                          className="font-label-code-sm text-label-code-sm text-primary font-semibold px-space-md py-1 rounded bg-surface-container-high hover:bg-surface-container-highest transition-colors disabled:opacity-40"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phones: stacked rows, no sideways scrolling */}
            <ul className="md:hidden flex flex-col divide-y divide-surface-container-high/50">
              {visibleSites.map((site) => (
                <li key={site.id} className="py-space-md flex flex-col gap-space-sm">
                  <div className="flex items-start justify-between gap-space-sm">
                    <div className="min-w-0">
                      <p className="font-body-md text-body-md font-semibold text-on-surface break-words">{site.name}</p>
                      <p className="font-body-sm text-body-sm text-outline">{site.code} · {site.region}</p>
                    </div>
                    <SeverityBadge label={site.riskClassification} tone={siteTone(site.riskClassification)} />
                  </div>
                  <div className="flex items-center justify-between gap-space-md font-body-sm text-body-sm text-on-surface-variant">
                    <span>
                      {site.sifPrecursors} precursors{' '}
                      <span className={site.precursorDelta > 0 ? 'text-error' : 'text-outline'}>
                        ({site.precursorDelta > 0 ? `+${site.precursorDelta}` : site.precursorDelta})
                      </span>
                    </span>
                    <span>Barrier {site.barrierIntegrityPct}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                    <div className={`h-full rounded-full ${barrierBarClass(site.barrierIntegrityPct)}`} style={{ width: `${Math.min(100, Math.max(0, site.barrierIntegrityPct))}%` }} />
                  </div>
                  <button
                    onClick={() => (site.id ? navigate(`/risk-intelligence?site=${encodeURIComponent(site.id)}`) : showToast('No source record available.'))}
                    disabled={!site.id}
                    className="self-start font-label-code-sm text-label-code-sm text-primary font-semibold px-space-md py-1.5 rounded bg-surface-container-high hover:bg-surface-container-highest transition-colors disabled:opacity-40"
                  >
                    Inspect
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Disclosure>

      {/* 5. Supporting indicators */}
      <Disclosure
        title="Life-saving rules and supporting indicators"
        summary={`${metrics?.highEnergyReleases != null ? `${metrics.highEnergyReleases} high-energy releases` : 'High-energy releases: N/A'} · ${backendRules.length} life-saving rules tracked`}
        actions={
          <div role="group" aria-label="Rule category" className="flex items-center bg-surface-container p-1 rounded-lg border border-surface-container-high/30">
            {(['all', 'critical', 'mechanical'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setLsrCategory(cat)}
                aria-pressed={lsrCategory === cat}
                className={`px-space-md py-1 rounded font-label-code-sm text-label-code-sm capitalize transition-colors ${
                  lsrCategory === cat
                    ? 'bg-primary-container text-on-primary-container font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-space-md mb-space-lg">
          <div className="bg-surface-container rounded-lg p-space-md">
            <p className="font-body-sm text-body-sm text-on-surface-variant">High-energy releases</p>
            <p className="font-headline-md text-headline-md text-error font-bold">
              {metrics?.highEnergyReleases != null ? metrics.highEnergyReleases : 'N/A'}
            </p>
            <p className="font-body-sm text-body-sm text-outline">Unreviewed precursor events</p>
          </div>
          <div className="bg-surface-container rounded-lg p-space-md">
            <p className="font-body-sm text-body-sm text-on-surface-variant">Intervention efficacy</p>
            <p className="font-headline-md text-headline-md text-on-surface font-bold">
              {metrics?.interventionsEfficacyPct != null ? `${metrics.interventionsEfficacyPct}%` : 'N/A'}
            </p>
            <p className="font-body-sm text-body-sm text-outline">
              {metrics?.interventionsDeployed != null ? `${metrics.interventionsDeployed} deployed` : 'No deployment data'}
            </p>
          </div>
        </div>

        {filteredRules.length === 0 ? (
          <p className="font-body-sm text-body-sm text-outline">No life-saving rule data for this category.</p>
        ) : (
          <div className="flex flex-col gap-space-md">
            {filteredRules.map((rule) => (
              <div key={rule.id} className="flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-space-md">
                  <span className="font-body-md text-body-md text-on-surface flex items-start gap-2 min-w-0">
                    <span className="material-symbols-outlined text-primary text-[18px] shrink-0">{rule.icon}</span>
                    <span className="break-words">{rule.name}</span>
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant shrink-0 text-right">
                    {rule.incidentsCount} incidents · <span className="text-on-surface font-semibold">{rule.percentage}%</span>
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                  <div className={`h-full ${rule.barColorClass} rounded-full transition-all duration-500`} style={{ width: `${rule.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Disclosure>

      {/* Floating Toast Notification */}
      {toastMsg && (
        <div role="status" className="fixed bottom-6 left-3 right-3 sm:left-auto sm:right-6 z-50 px-4 py-3 rounded-lg shadow-xl bg-surface-container-highest border border-primary/40 text-on-surface flex items-center gap-2 font-body-sm animate-fade-in">
          <span className="material-symbols-outlined text-primary text-[18px]">info</span>
          <span className="break-words min-w-0">{toastMsg}</span>
        </div>
      )}
    </div>
  );
};
