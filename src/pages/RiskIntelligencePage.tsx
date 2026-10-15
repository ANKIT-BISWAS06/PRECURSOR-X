import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, FacilityItem } from '../services/api';
import { SiteAsset } from '../types';
import { ChartHoverLayer, TooltipCard, TooltipLabel, TooltipRow } from '../components/charts/ChartHoverLayer';
import { SeverityBadge, SeverityTone, toneFromLabel } from '../components/ui/Severity';
import { Disclosure } from '../components/ui/Disclosure';

export const RiskIntelligencePage: React.FC = () => {
  const navigate = useNavigate();

  // Filters
  const [dateRange, setDateRange] = useState('90');
  const [selectedSite, setSelectedSite] = useState('all');
  const [selectedActivity, setSelectedActivity] = useState('all');
  const [selectedLsr, setSelectedLsr] = useState('all');
  const [highCriticalOnly, setHighCriticalOnly] = useState(false);
  const [tableSearch, setTableSearch] = useState('');

  // Matrix selection inspector
  const [selectedMatrixCell, setSelectedMatrixCell] = useState<{
    consequence: number;
    frequency: number;
    count: number;
    label: string;
  } | null>(null);

  // Action status
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Facility table pagination
  const FACILITY_PAGE_SIZE = 8;
  const [tablePage, setTablePage] = useState(1);

  // Backend Risk Intelligence Data
  const [backendFacilities, setBackendFacilities] = useState<SiteAsset[]>([]);
  const [facilityList, setFacilityList] = useState<FacilityItem[]>([]);
  const [riskTimeline, setRiskTimeline] = useState<Array<{ timestamp: string; risk: number }>>([]);
  const [backendTotalEvents, setBackendTotalEvents] = useState<number | null>(null);
  const [backendMatrixCells, setBackendMatrixCells] = useState<any[]>([]);
  const [backendCausalFactors, setBackendCausalFactors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getFacilities().then((facs) => {
      if (facs && facs.length > 0) {
        setFacilityList(facs);
      }
    }).catch(() => {
      // Backend fallback handled gracefully
    });
  }, []);

  const fetchRiskIntelligence = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [res, matrixRes, telemetryRes] = await Promise.all([
        api.getRiskIntelligence({
          site: selectedSite !== 'all' ? selectedSite : undefined,
          activity: selectedActivity !== 'all' ? selectedActivity : undefined,
          lsr: selectedLsr !== 'all' ? selectedLsr : undefined,
          timeframe: dateRange,
          highCriticalOnly,
          search: tableSearch
        }),
        api.getRiskMatrix({
          timeframe: dateRange,
          site: selectedSite !== 'all' ? selectedSite : undefined,
          activity: selectedActivity !== 'all' ? selectedActivity : undefined,
          lsr: selectedLsr !== 'all' ? selectedLsr : undefined
        }),
        api.getRiskTelemetry(selectedSite !== 'all' ? selectedSite : undefined, dateRange)
      ]);
      setBackendFacilities(res.sites);
      setBackendTotalEvents(res.totalEvents);
      if (matrixRes?.cells) {
        setBackendMatrixCells(matrixRes.cells);
      }
      if (matrixRes?.causalFactors?.length) {
        setBackendCausalFactors(matrixRes.causalFactors);
      } else if (res.causalFactors?.length) {
        setBackendCausalFactors(res.causalFactors);
      }
      if (telemetryRes?.timeline && telemetryRes.timeline.length > 0) {
        setRiskTimeline(telemetryRes.timeline);
      } else {
        setRiskTimeline([]);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load Risk Intelligence.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedSite, selectedActivity, selectedLsr, dateRange, highCriticalOnly, tableSearch]);

  useEffect(() => {
    fetchRiskIntelligence();
  }, [fetchRiskIntelligence]);

  const handleExportHeatmap = () => {
    const rows = [
      ['Consequence Level', 'Consequence Name', 'Frequency Level', 'Frequency Name', 'Precursor Event Count', 'SIF Classification']
    ];
    matrixRows.forEach((r) => {
      [1, 2, 3, 4, 5].forEach((freq) => {
        const cell = backendMatrixCells.find((c: any) => c.row === r.level && c.col === freq);
        const count = cell ? cell.count : 0;
        const freqName = freq === 1 ? 'Rare (E)' : freq === 2 ? 'Unlikely (D)' : freq === 3 ? 'Possible (C)' : freq === 4 ? 'Likely (B)' : 'Frequent (A)';
        const sifRisk = (r.level * freq >= 15) ? 'CRITICAL SIF' : (r.level * freq >= 8) ? 'HIGH SIF' : (r.level * freq >= 4) ? 'MEDIUM RISK' : 'LOW RISK';
        rows.push([String(r.level), r.severity, String(freq), freqName, String(count), sifRisk]);
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.map(val => `"${val.replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sif_risk_heatmap_5x5_${selectedSite}_${dateRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showFeedback(`Exported 5x5 SIF density heatmap CSV (${rows.length - 1} operational cells).`);
  };

  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 2500);
  };

  // Real CSV export of the currently filtered facility telemetry table
  const handleExportFacilityCsv = () => {
    if (filteredFacilities.length === 0) {
      showFeedback('No facilities in the current filter to export.');
      return;
    }
    const header = ['Site Name', 'Code', 'Region', 'Active Permits', 'Reports Analyzed', 'SIF Precursors', 'Precursor Density %', 'Composite Score', 'Risk Classification', '30D Trend'];
    const rows = filteredFacilities.map((site) => {
      const metrics = getScaledSiteMetrics(site);
      return [site.name, site.code, site.region, String(metrics.scaledPermits), String(metrics.scaledReports), String(metrics.scaledPrecursors), String(metrics.scaledDensity), String(site.compositeScore), site.riskClassification, site.trend30d];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `facility_telemetry_${selectedSite}_${dateRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showFeedback(`Exported telemetry for ${filteredFacilities.length} facilities to CSV.`);
  };

  // Real audit dispatch: persists an Intervention record for this facility to PostgreSQL
  const handleDispatchAudit = async (site: SiteAsset) => {
    try {
      await api.createIntervention({
        title: `Scheduled Audit — ${site.name}`,
        description: `Facility audit dispatched from Risk Intelligence console for ${site.name} (${site.code}). Composite risk score: ${site.compositeScore}/100.`,
        targetFacility: site.name,
        targetedVector: 'Audit',
        priority: site.riskClassification === 'Critical' ? 'Critical' : site.riskClassification === 'High' ? 'High' : 'Medium',
        status: 'Proposed',
        owner: '',
        ownerRole: null,
        dueDate: null,
        progressPct: 0
      });
      showFeedback(`Audit dispatched for ${site.name}. Persisted to Interventions register.`);
    } catch (err: any) {
      showFeedback(`Audit dispatch failed: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleResetFilters = () => {
    setDateRange('90');
    setSelectedSite('all');
    setSelectedActivity('all');
    setSelectedLsr('all');
    setHighCriticalOnly(false);
    setTableSearch('');
    setSelectedMatrixCell(null);
    showFeedback('Filters reset to initial operational baseline');
  };

  // 5x5 Matrix cells data derived dynamically from backend records
  const matrixRows = useMemo(() => {
    const severities = [
      { severity: '5 Catastrophic', level: 5 },
      { severity: '4 Major', level: 4 },
      { severity: '3 Moderate', level: 3 },
      { severity: '2 Minor', level: 2 },
      { severity: '1 Negligible', level: 1 }
    ];

    return severities.map((s) => {
      const cells = [1, 2, 3, 4, 5].map((col) => {
        const found = backendMatrixCells.find((c: any) => c.row === s.level && c.col === col);
        return found ? found.count : 0;
      });
      return { ...s, cells };
    });
  }, [backendMatrixCells]);

  // Dynamic Causal Factors supplied directly by FastAPI backend
  const causalFactors = backendCausalFactors;

  // Real facility metrics without decorative multiplier
  const getScaledSiteMetrics = (site: SiteAsset) => {
    return {
      scaledPermits: site.activePermits,
      scaledReports: site.reportsAnalyzed,
      scaledPrecursors: site.sifPrecursors,
      scaledDensity: site.precursorDensityPct
    };
  };

  // Facilities filtered by FastAPI backend with matrix cell filter
  const sourceFacilities = backendFacilities;
  const filteredFacilities = useMemo(() => {
    return sourceFacilities.filter((s) => {
      const matchesSearch =
        !tableSearch.trim() ||
        s.name.toLowerCase().includes(tableSearch.toLowerCase()) ||
        s.code.toLowerCase().includes(tableSearch.toLowerCase()) ||
        s.region.toLowerCase().includes(tableSearch.toLowerCase()) ||
        s.type.toLowerCase().includes(tableSearch.toLowerCase());

      const matchesSite = selectedSite === 'all' || s.id === selectedSite;
      const matchesSeverity = !highCriticalOnly || s.riskClassification === 'Critical' || s.riskClassification === 'High';

      // Matrix cell filter: if cell selected, focus on facilities matching that consequence tier
      let matchesMatrixCell = true;
      if (selectedMatrixCell) {
        if (selectedMatrixCell.consequence >= 4) {
          matchesMatrixCell = s.riskClassification === 'Critical' || s.riskClassification === 'High';
        } else if (selectedMatrixCell.consequence === 3) {
          matchesMatrixCell = s.riskClassification === 'Moderate' || s.compositeScore > 50;
        } else {
          matchesMatrixCell = s.riskClassification === 'Stable' || s.compositeScore <= 60;
        }
      }

      return matchesSearch && matchesSite && matchesSeverity && matchesMatrixCell;
    });
  }, [sourceFacilities, tableSearch, selectedSite, highCriticalOnly, selectedMatrixCell]);

  const totalEventCount = useMemo(() => {
    if (backendTotalEvents !== null && backendTotalEvents !== undefined) return backendTotalEvents;
    if (filteredFacilities.length === 0) return null;
    const valid = filteredFacilities.filter((f) => f.sifPrecursors !== null && f.sifPrecursors !== undefined);
    if (valid.length === 0) return null;
    return valid.reduce((sum, f) => sum + f.sifPrecursors, 0);
  }, [backendTotalEvents, filteredFacilities]);

  // Reset to page 1 whenever the underlying filtered set changes so pagination never points past the end
  useEffect(() => {
    setTablePage(1);
  }, [filteredFacilities.length, tableSearch, selectedSite, highCriticalOnly, selectedMatrixCell]);

  const totalTablePages = Math.max(1, Math.ceil(filteredFacilities.length / FACILITY_PAGE_SIZE));
  const pagedFacilities = useMemo(() => {
    const start = (tablePage - 1) * FACILITY_PAGE_SIZE;
    return filteredFacilities.slice(start, start + FACILITY_PAGE_SIZE);
  }, [filteredFacilities, tablePage]);

  return (
    <div className="flex flex-col w-full gap-space-xl">
      {/* Toast */}
      {actionFeedback && (
        <div className="fixed bottom-6 right-6 z-50 bg-surface-container-highest border border-primary/40 text-on-surface px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 font-label-code-sm text-label-code-sm">
          <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* Backend Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-error-container/30 border border-error/50 flex items-center justify-between gap-3 text-on-surface">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error text-[20px]">error</span>
            <span className="font-body-md text-body-md text-error">{error}</span>
          </div>
          <button
            onClick={fetchRiskIntelligence}
            className="px-3 py-1 rounded bg-error text-on-error font-label-code-sm text-label-code-sm flex items-center gap-1 hover:bg-error/90 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Dynamic Filter Bar & Controls */}
      <div className="flex flex-col gap-space-md">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
              Risk Intelligence
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-0.5">
              Where is risk concentrated?
            </p>
          </div>

          {/* Action Cluster */}
          <div className="flex items-center gap-space-sm self-start lg:self-auto flex-wrap">
            <button
              onClick={async () => {
                await fetchRiskIntelligence();
                showFeedback(totalEventCount !== null ? `Filters applied — ${totalEventCount.toLocaleString()} operational records loaded` : 'Filters applied — records refreshed');
              }}
              className="px-space-md py-1.5 rounded bg-primary-container text-on-primary-container font-headline-sm text-headline-sm flex items-center gap-space-xs hover:bg-primary transition-colors shadow-sm font-semibold"
            >
              <span className="material-symbols-outlined text-[18px]">filter_alt</span>
              <span>Apply Filters</span>
            </button>
            <button
              onClick={handleResetFilters}
              className="px-space-md py-1.5 rounded bg-surface-container-high text-on-surface hover:bg-surface-bright font-headline-sm text-headline-sm flex items-center gap-space-xs transition-colors border border-surface-container-high/40"
            >
              <span className="material-symbols-outlined text-[18px]">restart_alt</span>
              <span>Reset Filters</span>
            </button>
            <button
              onClick={handleExportHeatmap}
              className="px-space-md py-1.5 rounded bg-surface-container-high text-primary hover:bg-surface-bright font-headline-sm text-headline-sm flex items-center gap-space-xs transition-colors border border-surface-container-high/40"
            >
              <span className="material-symbols-outlined text-[18px]">grid_on</span>
              <span>Export Heatmap</span>
            </button>
          </div>
        </div>

        {/* Main answer: where risk is concentrated */}
        {(() => {
          const rank = (c?: string | null) => ({ critical: 0, high: 1, moderate: 2, medium: 2, low: 3 } as Record<string, number>)[(c || '').toLowerCase()] ?? 4;
          const top = [...backendFacilities]
            .sort((a, b) => rank(a.riskClassification) - rank(b.riskClassification) || b.sifPrecursors - a.sifPrecursors)
            .slice(0, 3);
          if (top.length === 0) return null;
          return (
            <section aria-label="Highest risk concentration" className="bg-surface-container-low rounded-xl border border-surface-container-high/40 divide-y divide-surface-container-high/40">
              <p className="px-space-lg py-space-md font-headline-sm text-headline-sm font-semibold text-on-surface">
                Highest risk concentration
              </p>
              {top.map((site) => {
                const t = toneFromLabel(site.riskClassification);
                const tone: SeverityTone = t === 'good' ? 'neutral' : t;
                return (
                  <div key={site.id} className="px-space-lg py-space-md flex flex-wrap items-center justify-between gap-space-sm">
                    <div className="min-w-0">
                      <p className="font-body-md text-body-md text-on-surface font-medium break-words">{site.name}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {site.sifPrecursors} SIF precursors ({site.precursorDelta > 0 ? `+${site.precursorDelta}` : site.precursorDelta}) · barrier integrity {site.barrierIntegrityPct}%
                      </p>
                    </div>
                    <SeverityBadge label={site.riskClassification} tone={tone} />
                  </div>
                );
              })}
            </section>
          );
        })()}

        <Disclosure
          title="Filters"
          summary="Date range, site, activity, life-saving rule and severity"
          className="bg-surface-container-low"
        >
        <div className="bg-surface-container-low p-space-md rounded-xl shadow-md flex flex-wrap items-center gap-space-sm border border-surface-container-high/40">
          {/* Date Range Filter */}
          <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-1 rounded border border-surface-container-high/40">
            <span className="material-symbols-outlined text-outline text-[16px]">calendar_today</span>
            <span className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">Range:</span>
            <select
              aria-label="Date Range"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-transparent text-on-surface font-label-code-sm text-label-code-sm focus:outline-none cursor-pointer pr-space-xs"
            >
              <option value="90" className="bg-surface-container">Last 90 Days</option>
              <option value="30" className="bg-surface-container">Last 30 Days</option>
              <option value="180" className="bg-surface-container">Last 180 Days</option>
              <option value="365" className="bg-surface-container">Trailing 12 Mo</option>
            </select>
          </div>

          {/* Site Filter */}
          <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-1 rounded border border-surface-container-high/40">
            <span className="material-symbols-outlined text-outline text-[16px]">factory</span>
            <span className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">Site:</span>
            <select
              aria-label="Site"
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="bg-transparent text-on-surface font-label-code-sm text-label-code-sm focus:outline-none cursor-pointer pr-space-xs"
            >
              <option value="all" className="bg-surface-container">
                All Global Facilities ({facilityList.length > 0 ? facilityList.length : backendFacilities.length})
              </option>
              {(facilityList.length > 0 ? facilityList : backendFacilities).map((fac) => (
                <option key={fac.id} value={fac.id} className="bg-surface-container">
                  {fac.code ? `${fac.code}: ` : ''}{fac.name} {fac.region ? `(${fac.region})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Activity Filter */}
          <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-1 rounded border border-surface-container-high/40">
            <span className="material-symbols-outlined text-outline text-[16px]">engineering</span>
            <span className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">Activity:</span>
            <select
              aria-label="Activity"
              value={selectedActivity}
              onChange={(e) => setSelectedActivity(e.target.value)}
              className="bg-transparent text-on-surface font-label-code-sm text-label-code-sm focus:outline-none cursor-pointer pr-space-xs"
            >
              <option value="all" className="bg-surface-container">All Work Types</option>
              <option value="confined" className="bg-surface-container">Confined Space Entry</option>
              <option value="isolation" className="bg-surface-container">Energy Isolation (LOTO)</option>
              <option value="hotwork" className="bg-surface-container">Hot Work & Welding</option>
              <option value="height" className="bg-surface-container">Working at Height</option>
              <option value="lifting" className="bg-surface-container">Lifting Operations</option>
            </select>
          </div>

          {/* LSR Filter */}
          <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-1 rounded border border-surface-container-high/40">
            <span className="material-symbols-outlined text-outline text-[16px]">verified_user</span>
            <span className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">LSR:</span>
            <select
              aria-label="Life Saving Rule"
              value={selectedLsr}
              onChange={(e) => setSelectedLsr(e.target.value)}
              className="bg-transparent text-on-surface font-label-code-sm text-label-code-sm focus:outline-none cursor-pointer pr-space-xs"
            >
              <option value="all" className="bg-surface-container">All LSR Standards</option>
              <option value="lsr-01" className="bg-surface-container">LSR-01: Hazardous Energy</option>
              <option value="lsr-02" className="bg-surface-container">LSR-02: Fall Protection</option>
              <option value="lsr-04" className="bg-surface-container">LSR-04: Vessel/Tank Entry</option>
              <option value="lsr-05" className="bg-surface-container">LSR-05: Crane/Rigging</option>
              <option value="lsr-07" className="bg-surface-container">LSR-07: Flammable Atmospheres</option>
            </select>
          </div>

          {/* Severity Toggle */}
          <div className="ml-auto flex items-center gap-space-xs flex-wrap">
            <button
              onClick={() => setHighCriticalOnly(!highCriticalOnly)}
              className={`px-space-sm py-1 rounded font-label-code-sm text-label-code-sm flex items-center gap-1.5 font-semibold transition-colors ${
                highCriticalOnly
                  ? 'bg-error-container text-on-error-container'
                  : 'bg-surface-container text-outline hover:text-on-surface'
              }`}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${highCriticalOnly ? 'bg-error animate-pulse' : 'bg-outline'}`}></span>
              {highCriticalOnly ? 'High & Critical Only (Active)' : 'Show All Severities'}
            </button>
            <span className="font-label-code-sm text-label-code-sm text-outline bg-surface-container px-space-xs py-1 rounded">
              {totalEventCount !== null ? `${totalEventCount.toLocaleString()} Events Cached` : 'Unavailable'}
            </span>
          </div>
        </div>
        </Disclosure>
      </div>

      {/* Facilities: where risk is concentrated, in detail */}
      <div className="bg-surface-container-low p-space-xl rounded-xl shadow-md flex flex-col gap-space-md border border-surface-container-high/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
              Facilities
            </h2>
            <span className="font-label-code-sm text-label-code-sm text-on-surface-variant">
              Risk score, precursor density and permits per facility ({filteredFacilities.length} displayed)
            </span>
          </div>

          <div className="flex items-center gap-space-sm flex-wrap">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-outline text-[18px]">
                search
              </span>
              <input
                aria-label="Filter facilities"
                className="bg-surface-container pl-9 pr-space-md py-1.5 rounded text-on-surface font-label-code-sm text-label-code-sm placeholder-outline focus:outline-none focus:ring-1 focus:ring-primary border border-surface-container-high/50"
                placeholder="Filter facilities"
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
              />
            </div>
            <button
              onClick={handleExportFacilityCsv}
              className="px-space-sm py-1.5 rounded bg-surface-container text-on-surface hover:bg-surface-bright font-label-code-sm text-label-code-sm flex items-center gap-1 border border-surface-container-high/40"
            >
              <span className="material-symbols-outlined text-[16px]">download</span> Export CSV
            </button>
          </div>
        </div>

        {/* Responsive Table Container */}
        <div className="overflow-x-auto rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container text-outline font-label-code-sm text-label-code-sm uppercase tracking-wider">
                <th className="py-space-sm px-space-md font-semibold">Site Name</th>
                <th className="py-space-sm px-space-md font-semibold">Region</th>
                <th className="py-space-sm px-space-md font-semibold text-right">Active Permits</th>
                <th className="py-space-sm px-space-md font-semibold text-right">Reports Analyzed</th>
                <th className="py-space-sm px-space-md font-semibold text-right">SIF Precursors</th>
                <th className="py-space-sm px-space-md font-semibold text-right">Precursor Density</th>
                <th className="py-space-sm px-space-md font-semibold text-center">Composite Score</th>
                <th className="py-space-sm px-space-md font-semibold text-center">30D Trend</th>
                <th className="py-space-sm px-space-md font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-high/50 font-body-sm text-body-sm">
              {filteredFacilities.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-outline font-label-code-sm">
                    <span className="material-symbols-outlined text-[36px] text-outline/50 block mb-2">filter_alt_off</span>
                    No facilities match the active filter criteria. Try relaxing Activity, LSR, or Site filters.
                  </td>
                </tr>
              ) : (
                pagedFacilities.map((site) => {
                  const metrics = getScaledSiteMetrics(site);
                  return (
                    <tr key={site.id} className="hover:bg-surface-container/60 transition-colors">
                      <td className="py-space-md px-space-md font-headline-sm text-headline-sm text-on-surface">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              site.riskClassification === 'Critical'
                                ? 'bg-error'
                                : site.riskClassification === 'High'
                                ? 'bg-secondary-container'
                                : 'bg-primary'
                            }`}
                          ></span>
                          <span className="font-semibold">{site.name}</span>
                        </div>
                        <span className="text-[11px] text-outline font-mono block pl-4">
                          {site.type}
                        </span>
                      </td>
                      <td className="py-space-md px-space-md text-on-surface-variant font-label-code-sm text-label-code-sm">
                        {site.code}
                      </td>
                      <td className="py-space-md px-space-md text-right font-label-code-md text-label-code-md text-on-surface">
                        {metrics.scaledPermits}
                      </td>
                      <td className="py-space-md px-space-md text-right font-label-code-md text-label-code-md text-on-surface">
                        {metrics.scaledReports.toLocaleString()}
                      </td>
                      <td className="py-space-md px-space-md text-right font-label-code-md text-label-code-md text-error font-bold">
                        {metrics.scaledPrecursors}
                      </td>
                      <td className="py-space-md px-space-md text-right">
                        <span
                          className={`px-2 py-0.5 rounded font-label-code-md text-label-code-md font-bold ${
                            metrics.scaledDensity > 10
                              ? 'bg-error-container text-on-error-container'
                              : metrics.scaledDensity > 5
                              ? 'bg-secondary-container/30 text-secondary'
                              : 'bg-surface-container-high text-primary'
                          }`}
                        >
                          {metrics.scaledDensity}%
                        </span>
                      </td>
                      <td className="py-space-md px-space-md text-center">
                        <span
                          className={`font-label-code-lg text-label-code-lg font-bold ${
                            site.compositeScore > 80
                              ? 'text-error'
                              : site.compositeScore > 60
                              ? 'text-secondary'
                              : 'text-primary'
                          }`}
                        >
                          {site.compositeScore}
                          <span className="text-outline text-xs">/100</span>
                        </span>
                      </td>
                      <td className="py-space-md px-space-md text-center">
                        <span
                          className={`font-label-code-sm text-label-code-sm font-semibold flex items-center justify-center gap-0.5 ${
                            site.trendDirection === 'up'
                              ? 'text-error'
                              : site.trendDirection === 'down'
                              ? 'text-primary'
                              : 'text-outline'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            {site.trendDirection === 'up'
                              ? 'trending_up'
                              : site.trendDirection === 'down'
                              ? 'trending_down'
                              : 'horizontal_rule'}
                          </span>{' '}
                          {site.trend30d}
                        </span>
                      </td>
                      <td className="py-space-md px-space-md text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => navigate('/safety-dna')}
                            className="px-2 py-1 rounded bg-primary-container text-on-primary-container font-label-code-sm text-label-code-sm hover:bg-primary transition-colors"
                          >
                            Drilldown
                          </button>
                          <button
                            onClick={() => handleDispatchAudit(site)}
                            className="px-2 py-1 rounded bg-surface-container text-on-surface hover:bg-surface-bright font-label-code-sm text-label-code-sm"
                          >
                            Audit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination & Counter */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-space-sm mt-space-md pt-space-md border-t border-outline-variant/30">
          <span className="font-label-code-sm text-label-code-sm text-outline">
            Showing {pagedFacilities.length === 0 ? 0 : (tablePage - 1) * FACILITY_PAGE_SIZE + 1}–{(tablePage - 1) * FACILITY_PAGE_SIZE + pagedFacilities.length} of {filteredFacilities.length} Active Facilities
          </span>
          <div className="flex items-center gap-space-xs font-label-code-sm text-label-code-sm">
            <button
              onClick={() => setTablePage((p) => Math.max(1, p - 1))}
              disabled={tablePage <= 1}
              className="px-2.5 py-1 rounded bg-surface-container text-outline hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {Array.from({ length: totalTablePages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setTablePage(p)}
                className={`px-2 py-1 rounded font-semibold ${
                  p === tablePage
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-container text-outline hover:text-on-surface'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setTablePage((p) => Math.min(totalTablePages, p + 1))}
              disabled={tablePage >= totalTablePages}
              className="px-2.5 py-1 rounded bg-surface-container text-outline hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <Disclosure
        title="What drives the risk"
        summary="Top contributing factors and barrier decay"
      >
      {/* SECTION 2: PRECURSOR CAUSAL FACTORS & BARRIER DECAY BREAKDOWN */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        {/* Causal Breakdown Left (7 cols) */}
        <div className="lg:col-span-7 bg-surface-container-low p-space-lg rounded-xl shadow-md flex flex-col justify-between border border-surface-container-high/40">
          <div>
            <div className="flex items-center justify-between mb-space-xs">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[20px]">account_tree</span>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                  Precursor Causal Factors Breakdown
                </h2>
              </div>
              <span className="font-label-code-sm text-label-code-sm text-primary font-semibold">
                {totalEventCount !== null ? `N=${totalEventCount.toLocaleString()} Classified Vectors` : 'N/A'}
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-lg">
              Composite breakdown of systemic barrier vulnerabilities and causal precursors leading to high-energy releases.
            </p>

            {/* Factor Rows */}
            <div className="space-y-space-md">
              {causalFactors.map((factor) => (
                <div key={factor.label}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-space-xs flex-wrap">
                      <span className={`w-2.5 h-2.5 rounded-full ${factor.color}`}></span>
                      <span className="font-headline-sm text-headline-sm text-on-surface">{factor.label}</span>
                      <span className="font-label-code-sm text-label-code-sm text-outline">
                        ({factor.details})
                      </span>
                    </div>
                    <span className="font-label-code-md text-label-code-md text-error font-bold">
                      {factor.percentage}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded bg-surface-container overflow-hidden">
                    <div
                      className={`h-full ${factor.color} rounded transition-all duration-500`}
                      style={{ width: `${factor.percentage}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-space-lg pt-space-md border-t border-outline-variant/30 flex items-center justify-between text-on-surface-variant font-label-code-sm text-label-code-sm">
            <span>Share of recorded risk factors</span>
            <button
              onClick={() => navigate('/knowledge-graph')}
              className="text-primary hover:underline flex items-center gap-1 font-semibold"
            >
              <span>See how causes connect</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Visual Asset Representation & Context (5 cols) */}
        <div className="lg:col-span-5 bg-surface-container-low p-space-lg rounded-xl shadow-md flex flex-col justify-between border border-surface-container-high/40">
          <div>
            <div className="flex items-center justify-between mb-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[20px]">analytics</span>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                  Precursor Telemetry Density
                </h2>
              </div>
              <span className="font-label-code-sm text-label-code-sm text-error bg-error-container/40 px-2 py-0.5 rounded border border-error/30 font-semibold">
                High Volatility
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
              Temporal density waves over active operational shifts across all drilling platforms.
            </p>

            {/* Inline Visual Chart SVG */}
            <div className="bg-surface-container-lowest p-space-md rounded-lg mb-space-md relative overflow-visible border border-surface-container-high/30">
              {riskTimeline.length >= 2 ? (
                (() => {
                  const width = 400;
                  const height = 120;
                  const paddingY = 15;
                  const usableHeight = height - paddingY * 2;
                  const points = riskTimeline.map((pt, idx) => {
                    const x = (idx / (riskTimeline.length - 1)) * width;
                    const normalizedRisk = Math.max(0, Math.min(100, pt.risk));
                    const y = height - paddingY - (normalizedRisk / 100) * usableHeight;
                    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), risk: pt.risk, timestamp: pt.timestamp };
                  });
                  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                  const areaD = `${pathD} L${width},${height} L0,${height} Z`;

                  return (
                    <ChartHoverLayer
                      points={points}
                      viewBoxWidth={width}
                      viewBoxHeight={height}
                      className="w-full h-32"
                      renderTooltip={(p) => (
                        <TooltipCard>
                          <TooltipLabel>{p.timestamp ?? 'N/A'}</TooltipLabel>
                          <TooltipRow label="Risk Density" value={p.risk != null ? `${p.risk}%` : 'N/A'} />
                        </TooltipCard>
                      )}
                    >
                      {({ hoveredIndex }) => (
                        <svg className="w-full h-32" preserveAspectRatio="none" viewBox="0 0 400 120">
                          <line stroke="#262a33" strokeDasharray="2 2" strokeWidth="1" x1="0" x2="400" y1="20" y2="20" />
                          <line stroke="#262a33" strokeDasharray="2 2" strokeWidth="1" x1="0" x2="400" y1="60" y2="60" />
                          <line stroke="#262a33" strokeDasharray="2 2" strokeWidth="1" x1="0" x2="400" y1="100" y2="100" />
                          <defs>
                            <linearGradient id="riskChartGrad" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          {hoveredIndex != null && points[hoveredIndex] && (
                            <line
                              stroke="#38bdf8"
                              strokeOpacity="0.35"
                              strokeWidth="1.5"
                              x1={points[hoveredIndex].x}
                              x2={points[hoveredIndex].x}
                              y1="0"
                              y2={height}
                            />
                          )}
                          <path d={areaD} fill="url(#riskChartGrad)" />
                          <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
                          {points.map((p, i) => (
                            (i === 0 || i === points.length - 1 || p.risk >= 65 || hoveredIndex === i) ? (
                              <circle
                                key={i}
                                cx={p.x}
                                cy={p.y}
                                fill={hoveredIndex === i ? '#38bdf8' : '#ffb4ab'}
                                r={hoveredIndex === i ? 5 : 3.5}
                                stroke={hoveredIndex === i ? '#0a0e16' : '#93000a'}
                                strokeWidth="1.5"
                                className="transition-all duration-100"
                              />
                            ) : null
                          ))}
                        </svg>
                      )}
                    </ChartHoverLayer>
                  );
                })()
              ) : (
                <div className="h-32 flex flex-col items-center justify-center text-outline font-label-code-sm">
                  <span className="material-symbols-outlined text-[24px] mb-1 text-outline">show_chart</span>
                  No Risk Telemetry Available
                </div>
              )}
              <div className="flex items-center justify-between font-label-code-sm text-label-code-sm text-outline mt-2">
                <span>D-{dateRange}</span>
                <span>D-30</span>
                <span>D-7</span>
                <span className="text-primary font-semibold">Today (Live Wave)</span>
              </div>
            </div>

            {/* Offshore Facility Visual Context */}
            <div className="relative rounded-lg overflow-hidden h-32 sm:h-28 bg-surface-container border border-surface-container-high/40">
              <img
                className="w-full h-full object-cover opacity-60"
                alt="Industrial offshore oil drilling platform"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuA_yOR5FqosUQCDQg9z9NmSpE79nCc-_GSCiZiRmPmQY87yibp5-wNjcfDrKllGjJhsd6TiKF3A_ZaU1ZjiqLPg766mitPNotOvkNwnIK3WKtVjtTdqSKtMyTAuT7zgTmN2Xl63OsOfB5EuSyG3nOpgpJ4ECzZ93BkfEWXzWaJOrY6OxatI7qvDRCVmoJdtOmsLZwirx3DYFMpXhe-9sfWItxq0jF5ToCwn1vWwVAV7ZShp_CU1s92P"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/40 to-transparent"></div>
              <div className="absolute bottom-1.5 left-3 right-3 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-0.5">
                <span className="font-label-code-sm text-label-code-sm text-on-surface font-semibold break-words min-w-0">
                  Active Watch: {filteredFacilities[0]?.name || (selectedSite !== 'all' ? 'No Facility Selected' : 'No Facilities Available')}
                </span>
                <span className="font-label-code-sm text-label-code-sm text-primary font-bold shrink-0 whitespace-nowrap">
                  {filteredFacilities[0] ? `${getScaledSiteMetrics(filteredFacilities[0]).scaledPermits} Active Permits` : '0 Active Permits'}
                </span>
              </div>
            </div>
          </div>

                  </div>
      </div>

      </Disclosure>

      <Disclosure
        title="Risk matrix and facility benchmarks"
        summary="5x5 SIF precursor density matrix and comparison by asset"
      >
      {/* SECTION 1: TOP ROW MATRIX & BENCHMARKING */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg">
        {/* 5x5 SIF Precursor Density Matrix (7 cols) */}
        <div className="xl:col-span-7 bg-surface-container-low p-space-lg rounded-xl shadow-md flex flex-col justify-start border border-surface-container-high/40">
          <div className="flex items-start justify-between mb-space-md">
            <div>
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[20px]">bubble_chart</span>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                  SIF Precursor Density Matrix
                </h2>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                5×5 Consequence Severity vs Probability Frequency Analysis
              </p>
            </div>
            <div className="flex items-center gap-space-sm text-right">
              {selectedMatrixCell ? (
                <div className="flex items-center gap-2">
                  <div className="flex flex-col text-right">
                    <span className="font-label-code-sm text-label-code-sm text-outline">
                      CELL SELECTION
                    </span>
                    <span className="font-label-code-md text-label-code-md text-error font-semibold">
                      {selectedMatrixCell.label}: {selectedMatrixCell.count} EVENTS
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedMatrixCell(null)}
                    title="Clear cell filter"
                    className="p-1 rounded bg-surface-container hover:bg-surface-bright text-outline hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              ) : (
                <span className="font-label-code-sm text-label-code-sm text-outline bg-surface-container px-2 py-1 rounded">
                  Click any cell to filter
                </span>
              )}
            </div>
          </div>

          {/* Matrix Canvas */}
          <div className="grid grid-cols-12 gap-space-xs items-center">
            {/* Y Axis Label */}
            <div className="col-span-1 flex flex-col items-center justify-center h-full">
              <span className="font-label-code-sm text-label-code-sm text-outline uppercase [writing-mode:vertical-rl] rotate-180 tracking-widest text-center">
                Consequence Severity
              </span>
            </div>

            {/* 5x5 Grid Area */}
            <div className="col-span-11 flex flex-col gap-1">
              {matrixRows.map((row) => (
                <div key={row.severity} className="grid grid-cols-6 gap-1 items-center">
                  <span className="font-label-code-sm text-label-code-sm text-on-surface-variant break-words leading-tight pr-1">
                    {row.severity}
                  </span>
                  {row.cells.map((count, fIdx) => {
                    const freqLevel = fIdx + 1;
                    const isHotspot = row.level === 4 && freqLevel === 4;
                    const isSelected = selectedMatrixCell?.consequence === row.level && selectedMatrixCell?.frequency === freqLevel;

                    let bgClass = 'bg-surface-container text-on-surface-variant';
                    if (row.level >= 4 && freqLevel >= 4) {
                      bgClass = isHotspot
                        ? 'bg-error text-on-error font-bold shadow-md animate-pulse'
                        : 'bg-error-container text-on-error-container font-bold';
                    } else if (count > 80) {
                      bgClass = 'bg-amber-950/60 text-amber-300 font-semibold';
                    } else if (count > 40) {
                      bgClass = 'bg-surface-container-high text-on-surface';
                    }

                    return (
                      <div
                        key={fIdx}
                        onClick={() =>
                          setSelectedMatrixCell({
                            consequence: row.level,
                            frequency: freqLevel,
                            count,
                            label: `[C${row.level} × F${freqLevel}] ${row.level >= 4 ? 'CRITICAL' : row.level === 3 ? 'MODERATE' : 'LOW'}`
                          })
                        }
                        className={`h-10 rounded flex flex-col items-center justify-center font-label-code-sm text-label-code-sm transition-all cursor-pointer hover:scale-105 ${bgClass} ${
                          isSelected ? 'ring-2 ring-primary scale-105' : ''
                        }`}
                      >
                        <span>{count}</span>
                        {isHotspot && (
                          <span className="text-[8px] font-mono leading-none tracking-tighter uppercase">
                            Hotspot
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* X Axis Headers */}
              <div className="grid grid-cols-6 gap-1 items-center pt-2">
                <span className="font-label-code-sm text-label-code-sm text-transparent">Scale</span>
                <span className="font-label-code-sm text-label-code-sm text-outline text-center">1 Rare</span>
                <span className="font-label-code-sm text-label-code-sm text-outline text-center">2 Unlikely</span>
                <span className="font-label-code-sm text-label-code-sm text-outline text-center">3 Possible</span>
                <span className="font-label-code-sm text-label-code-sm text-outline text-center">4 Probable</span>
                <span className="font-label-code-sm text-label-code-sm text-outline text-center">5 Frequent</span>
              </div>
            </div>
          </div>

          {/* Matrix Footer & Legend */}
          <div className="flex items-center justify-between pt-space-md mt-space-sm border-t border-outline-variant/30 flex-wrap gap-2">
            <div className="flex items-center gap-space-md flex-wrap">
              <span className="font-label-code-sm text-label-code-sm text-outline">
                RISK CALIBRATION:
              </span>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-surface-container"></span>
                <span className="font-label-code-sm text-label-code-sm text-on-surface-variant">Low (&lt;20)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-950/70"></span>
                <span className="font-label-code-sm text-label-code-sm text-amber-300">Moderate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-error-container"></span>
                <span className="font-label-code-sm text-label-code-sm text-error">Critical Zone</span>
              </div>
            </div>
            {selectedMatrixCell ? (
              <span className="font-label-code-sm text-label-code-sm text-error font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">filter_list</span>
                <span>Active Cell: [C{selectedMatrixCell.consequence} × F{selectedMatrixCell.frequency}]</span>
              </span>
            ) : (
              <span className="font-label-code-sm text-label-code-sm text-primary">
                Click cell to filter causal chain
              </span>
            )}
          </div>
        </div>

        {/* Precursor Density by Asset (5 cols) */}
        <div className="xl:col-span-5 relative bg-surface-container-low rounded-xl shadow-md border border-surface-container-high/40">
          {/* Fixed to the matrix card's height on xl (absolute = does not stretch the row); the facility list scrolls inside. */}
          <div className="flex flex-col p-space-lg h-[560px] max-h-[80vh] xl:h-auto xl:max-h-none xl:absolute xl:inset-0">
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between mb-space-xs">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[20px]">data_usage</span>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                  Precursor Density by Asset
                </h2>
              </div>
              <span className="px-space-xs py-0.5 rounded bg-surface-container text-on-surface font-label-code-sm text-label-code-sm border border-surface-container-high/40">
                Cross-Site Benchmarking
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
              Global HSE Target Benchmark:{' '}
              <span className="font-label-code-md text-label-code-md text-primary font-semibold">
                &lt; 5.0% SIF Precursor Ratio
              </span>
            </p>

            {/* Benchmark Visual Cards (scrollable) */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-space-xs space-y-space-md [scrollbar-width:thin]">
              {filteredFacilities.length === 0 ? (
                <div className="p-6 rounded-lg bg-surface-container text-center text-on-surface-variant font-label-code-sm border border-dashed border-outline-variant/50">
                  <span className="material-symbols-outlined text-[28px] text-outline block mb-1">domain_disabled</span>
                  No facilities match the combined filter criteria.
                </div>
              ) : (
                filteredFacilities.map((site) => {
                  const metrics = getScaledSiteMetrics(site);
                  const isOverCeiling = metrics.scaledDensity > 5.0;
                  const deltaFromCeiling = Number((metrics.scaledDensity - 5.0).toFixed(1));
                  const barWidth = Math.min(100, Math.round((metrics.scaledDensity / 20) * 100));

                  const borderClass =
                    site.riskClassification === 'Critical'
                      ? 'border-error'
                      : site.riskClassification === 'High'
                      ? 'border-secondary-container'
                      : 'border-primary';

                  const badgeClass =
                    site.riskClassification === 'Critical'
                      ? 'bg-error-container text-on-error-container'
                      : site.riskClassification === 'High'
                      ? 'bg-secondary-container/40 text-secondary'
                      : 'bg-surface-bright text-primary';

                  const textValClass =
                    site.riskClassification === 'Critical'
                      ? 'text-error'
                      : site.riskClassification === 'High'
                      ? 'text-secondary'
                      : 'text-primary';

                  const barBgClass =
                    site.riskClassification === 'Critical'
                      ? 'bg-error'
                      : site.riskClassification === 'High'
                      ? 'bg-secondary-container'
                      : 'bg-primary';

                  return (
                    <div
                      key={site.id}
                      className={`p-space-sm rounded-lg bg-surface-container flex flex-col gap-1.5 border-l-2 ${borderClass}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-space-xs">
                          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                            {site.name}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded-full font-label-code-sm text-[9px] uppercase font-bold ${badgeClass}`}>
                            {site.riskClassification}
                          </span>
                        </div>
                        <span className={`font-label-code-md text-label-code-md font-bold ${textValClass}`}>
                          {metrics.scaledDensity}% SIF
                        </span>
                      </div>
                      <div className="w-full h-2 rounded bg-surface-container-highest overflow-hidden relative">
                        <div className={`h-full ${barBgClass} rounded`} style={{ width: `${barWidth}%` }}></div>
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-primary z-10"
                          style={{ left: '25%' }}
                          title="5.0% Industry Ceiling"
                        ></div>
                      </div>
                      <div className="flex items-center justify-between font-label-code-sm text-label-code-sm text-on-surface-variant">
                        <span>{metrics.scaledPrecursors} SIF / {metrics.scaledReports.toLocaleString()} Total Observations</span>
                        <span className={isOverCeiling ? 'text-error font-semibold' : 'text-primary font-semibold'}>
                          {isOverCeiling ? `+${deltaFromCeiling}% over ceiling` : `${Math.abs(deltaFromCeiling)}% under ceiling`}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="shrink-0 mt-space-md pt-space-md border-t border-outline-variant/30 flex items-center justify-between font-label-code-sm text-label-code-sm text-outline">
            <span>Aggregated across {filteredFacilities.length} facilities</span>
            <button
              onClick={async () => {
                await fetchRiskIntelligence();
                showFeedback('Ceilings recalculated from current data.');
              }}
              className="text-primary hover:underline font-semibold"
            >
              Recalibrate Ceilings
            </button>
          </div>
          </div>
        </div>
      </div>

      </Disclosure>
    </div>
  );
};
