import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { PrecursorPattern } from '../types';
import { Disclosure } from '../components/ui/Disclosure';

export const SafetyDnaPage: React.FC = () => {
  const navigate = useNavigate();

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [patterns, setPatterns] = useState<PrecursorPattern[]>([]);
  const [selectedPattern, setSelectedPattern] = useState<PrecursorPattern | null>(null);
  const [causalChain, setCausalChain] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showDetailedTopology, setShowDetailedTopology] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // Real export of the current pattern set as JSON, built from live backend data
  const handleExportPatternGenome = () => {
    if (patterns.length === 0) {
      showToast('No patterns loaded to export.');
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      patternCount: patterns.length,
      patterns
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `safety_dna_pattern_genome_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${patterns.length} pattern(s) as a patterns file.`);
  };

  const fetchDnaData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [pList, mData] = await Promise.all([
        api.getSafetyDnaPatterns(undefined, searchQuery),
        api.getSafetyDnaMetrics()
      ]);
      setPatterns(pList || []);
      setMetrics(mData);
      if (pList && pList.length > 0) {
        setSelectedPattern((prev) => {
          if (prev) {
            const found = pList.find((p) => p.id === prev.id);
            if (found) return found;
          }
          return pList[0];
        });
      } else {
        setSelectedPattern(null);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load Safety DNA patterns.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchDnaData();
  }, [fetchDnaData]);

  const [linkedPrecedents, setLinkedPrecedents] = useState<any[]>([]);

  // Load causal chain whenever selected pattern changes
  useEffect(() => {
    if (selectedPattern?.id) {
      api.getSafetyDnaCausalChain(selectedPattern.id)
        .then((res) => setCausalChain(res))
        .catch((err) => console.error('Failed to load causal chain:', err));

      api.searchSafetyMemory('', {
        category: selectedPattern.keyVector || selectedPattern.category || ''
      })
        .then((res) => setLinkedPrecedents(res.results.slice(0, 2)))
        .catch(() => setLinkedPrecedents([]));
    } else {
      setLinkedPrecedents([]);
    }
  }, [selectedPattern?.id, selectedPattern?.keyVector, selectedPattern?.category]);

  const filteredPatterns = patterns;

  const visiblePatterns = filteredPatterns;

  return (
    <div className="flex flex-col w-full gap-space-xl">
      {/* Backend Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-error-container/30 border border-error/50 flex items-center justify-between gap-3 text-on-surface">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error text-[20px]">error</span>
            <span className="font-body-md text-body-md text-error">{error}</span>
          </div>
          <button
            onClick={fetchDnaData}
            className="px-3 py-1 rounded bg-error text-on-error font-label-code-sm text-label-code-sm flex items-center gap-1 hover:bg-error/90 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Toast Feedback */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-surface-container-highest border border-primary/40 text-on-surface px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 font-label-code-sm text-label-code-sm">
          <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Command & Filter Deck */}
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-space-lg">
          <div className="flex flex-col gap-space-xs">
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
              Safety DNA
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-0.5">
              What recurring patterns are emerging?
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-space-sm">
            <button
              onClick={async () => {
                await fetchDnaData();
                showToast(`Refreshed ${patterns.length} pattern(s).`);
              }}
              className="flex items-center gap-space-xs px-space-md py-space-sm rounded bg-surface-container-high text-on-surface font-body-md text-body-md hover:bg-surface-bright transition-colors shadow-sm border border-surface-container-high/40"
            >
              <span className="material-symbols-outlined text-[16px] text-primary">autorenew</span>
              <span>Refresh patterns</span>
            </button>
            <button
              onClick={handleExportPatternGenome}
              className="flex items-center gap-space-xs px-space-md py-space-sm rounded bg-primary text-on-primary font-headline-sm text-headline-sm hover:bg-primary-fixed transition-colors shadow-md"
            >
              <span className="material-symbols-outlined text-[16px]">strikethrough_s</span>
              <span>Export patterns</span>
            </button>
          </div>
        </div>

        {/* Pattern search */}
        <div className="flex items-center gap-space-sm px-space-md py-space-sm rounded-lg bg-surface-container-low border border-surface-container-high/40 max-w-xl">
          <span className="material-symbols-outlined text-outline text-[18px]">search</span>
          <input
            aria-label="Search patterns"
            className="w-full bg-transparent font-body-sm text-body-sm text-on-surface placeholder-outline focus:outline-none"
            placeholder="Search patterns by hazard, behavior or barrier"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </section>

      {/* Pattern Statistics Metric Banners */}
      <Disclosure
        title="Pattern statistics"
        summary={patterns.length + ' pattern' + (patterns.length === 1 ? '' : 's') + ' identified in total'}
      >
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
          <div className="flex flex-col p-space-lg rounded-xl bg-surface-container shadow-md relative overflow-hidden border border-surface-container-high/40">
            <div className="flex items-center justify-between">
              <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline font-semibold">
                Total Precursor Patterns
              </span>
              <span className="material-symbols-outlined text-primary text-[20px]">bubble_chart</span>
            </div>
            <div className="flex items-baseline gap-space-xs mt-space-md">
              <span className="font-label-code-lg text-headline-xl text-on-surface font-bold tracking-tight">
                {isLoading ? '--' : patterns.length}
              </span>
              <span className="font-label-code-sm text-label-code-sm text-primary font-medium">
                Active patterns
              </span>
            </div>
            <div className="flex items-center gap-space-xs mt-space-sm">
              <span className="material-symbols-outlined text-[14px] text-primary">sensors</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Continuously mapped across facilities
              </span>
            </div>
          </div>

          <div className="flex flex-col p-space-lg rounded-xl bg-surface-container shadow-md relative overflow-hidden border border-surface-container-high/40">
            <div className="flex items-center justify-between">
              <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline font-semibold">
                High-frequency patterns
              </span>
              <span className="w-2 h-2 rounded-full bg-error animate-ping"></span>
            </div>
            <div className="flex items-baseline gap-space-xs mt-space-md">
              <span className="font-label-code-lg text-headline-xl text-error font-bold tracking-tight">
                {isLoading
                  ? '--'
                  : ((metrics?.activeGenomicThreatVectors ?? metrics?.systemicBlindspotsIdentified) != null
                      ? (metrics?.activeGenomicThreatVectors ?? metrics?.systemicBlindspotsIdentified)!.toString().padStart(2, '0')
                      : 'N/A')}
              </span>
              <span className="font-label-code-sm text-label-code-sm text-error font-medium">
                Critical Triads
              </span>
            </div>
            <div className="flex items-center gap-space-xs mt-space-sm">
              <span className="material-symbols-outlined text-[14px] text-error">warning</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Immediate intervention recommended
              </span>
            </div>
          </div>

          <div className="flex flex-col p-space-lg rounded-xl bg-surface-container shadow-md relative overflow-hidden border border-surface-container-high/40">
            <div className="flex items-center justify-between">
              <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline font-semibold">
                Stability index
              </span>
              <span className="material-symbols-outlined text-tertiary text-[20px]">share_location</span>
            </div>
            <div className="flex items-baseline gap-space-xs mt-space-md">
              <span className="font-label-code-lg text-headline-xl text-on-surface font-bold tracking-tight">
                {isLoading ? '--' : (metrics?.genomicStabilityIndex != null ? `${metrics.genomicStabilityIndex}%` : 'N/A')}
              </span>
              <span className="font-label-code-sm text-label-code-sm text-outline">
                Systemic
              </span>
            </div>
            <div className="flex items-center gap-space-xs mt-space-sm">
              <span className="material-symbols-outlined text-[14px] text-outline">schema</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Mean recurrence: {metrics?.meanTimeToPrecursorRecurrenceDays != null ? `${metrics.meanTimeToPrecursorRecurrenceDays} days` : 'N/A'}
              </span>
            </div>
          </div>

          <div className="flex flex-col p-space-lg rounded-xl bg-surface-container shadow-md relative overflow-hidden border border-surface-container-high/40">
            <div className="flex items-center justify-between">
              <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline font-semibold">
                Barrier Circumvention Velocity
              </span>
              <span className="material-symbols-outlined text-error text-[20px]">speed</span>
            </div>
            <div className="flex items-baseline gap-space-xs mt-space-md">
              <span className="font-label-code-lg text-headline-xl text-error font-bold tracking-tight">
                {isLoading ? '--' : (metrics?.precursorVelocityGrowthPct != null ? `${metrics.precursorVelocityGrowthPct > 0 ? '+' : ''}${metrics.precursorVelocityGrowthPct}%` : 'N/A')}
              </span>
              <span className="font-label-code-sm text-label-code-sm text-outline">
                Database Metric
              </span>
            </div>
            <div className="flex items-center gap-space-xs mt-space-sm">
              <span className="material-symbols-outlined text-[14px] text-error">trending_up</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Calculated from pattern observations
              </span>
            </div>
          </div>
        </section>
      </Disclosure>

      {/* Precursor Pattern Genomic Cards */}
      <section className="flex flex-col gap-space-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <h3 className="font-headline-md text-headline-md text-on-surface font-bold">
              Strongest recurring patterns
            </h3>
            <span className="font-label-code-sm text-label-code-sm px-space-xs py-0.5 rounded-full bg-secondary-container text-on-secondary font-bold">
              {filteredPatterns.length} found
            </span>
          </div>
          <span className="font-label-code-sm text-label-code-sm text-outline">
            Ranked by SIF probability
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
          {isLoading ? (
            <div className="md:col-span-2 py-12 text-center text-on-surface-variant font-label-code-sm">
              <div className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined animate-spin text-primary text-[20px]">progress_activity</span>
                <span>Loading patterns…</span>
              </div>
            </div>
          ) : filteredPatterns.length === 0 ? (
            <div className="md:col-span-2 py-12 text-center text-outline font-label-code-sm">
              No precursor patterns found.
            </div>
          ) : (
            visiblePatterns.map((pattern, idx) => (
            <div
              key={pattern.id}
              onClick={() => {
                setSelectedPattern(pattern);
              }}
              className={`flex flex-col p-space-lg rounded-xl transition-all cursor-pointer border ${
                selectedPattern?.id === pattern.id
                  ? 'bg-surface-container-high border-primary ring-1 ring-primary shadow-lg'
                  : 'bg-surface-container hover:bg-surface-container-high border-surface-container-high/40 shadow-md'
              }`}
            >
              <div className="flex items-start justify-between gap-space-md">
                <div className="flex flex-col">
                  <div className="flex items-center gap-space-xs mb-space-xs">
                    <span className="font-label-code-sm text-label-code-sm text-primary-container font-semibold">
                      Pattern {idx + 1}
                    </span>
                    <span className="font-label-code-sm text-label-code-sm text-outline">
                      / {pattern.code}
                    </span>
                  </div>
                  <h4 className="font-headline-md text-headline-md text-on-surface font-semibold">
                    {pattern.name}
                  </h4>
                </div>

                <span
                  className={`font-label-code-sm text-label-code-sm px-space-sm py-0.5 rounded-full font-bold flex items-center gap-1 shrink-0 ${
                    pattern.sifPotential === 'CRITICAL'
                      ? 'bg-error-container text-on-error-container'
                      : pattern.sifPotential === 'HIGH'
                      ? 'bg-surface-container-highest text-error'
                      : 'bg-surface-container-highest text-primary'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      pattern.sifPotential === 'CRITICAL' || pattern.sifPotential === 'HIGH'
                        ? 'bg-error'
                        : 'bg-primary'
                    }`}
                  ></span>
                  {pattern.sifScore}% {pattern.sifPotential}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm my-space-lg p-space-md rounded-lg bg-surface-container-low border border-surface-container-high/30">
                <div className="flex flex-col">
                  <span className="font-label-code-sm text-label-code-sm text-outline uppercase">
                    Occurrences
                  </span>
                  <span className="font-label-code-md text-label-code-md text-on-surface font-bold">
                    {pattern.occurrences} events
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-code-sm text-label-code-sm text-outline uppercase">
                    Sites affected
                  </span>
                  <span className="font-label-code-md text-label-code-md text-on-surface font-bold">
                    {pattern.affectedSitesCount} sites
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-code-sm text-label-code-sm text-outline uppercase">
                    30-day trend
                  </span>
                  <span
                    className={`font-label-code-md text-label-code-md font-bold flex items-center gap-0.5 ${
                      pattern.trend30dPct > 0 ? 'text-error' : 'text-primary'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {pattern.trend30dPct > 0 ? 'arrow_upward' : 'arrow_downward'}
                    </span>{' '}
                    {Math.abs(pattern.trend30dPct)}%
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-code-sm text-label-code-sm text-outline uppercase">
                    Avg. time between
                  </span>
                  <span className="font-label-code-md text-label-code-md text-on-surface font-bold">
                    {pattern.mtboDays != null ? `${pattern.mtboDays} days` : 'N/A'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-space-xs text-body-sm text-body-sm text-on-surface-variant mb-space-md">
                <div className="flex items-start justify-between gap-space-sm">
                  <div className="flex items-start gap-space-xs min-w-0">
                    <span className="material-symbols-outlined text-outline text-[16px] shrink-0 mt-0.5">domain</span>
                    <span className="break-words">
                      {pattern.affectedSites && pattern.affectedSites.length > 0 ? pattern.affectedSites.join(', ') : 'No affected sites recorded'}
                    </span>
                  </div>
                  <span className="font-label-code-sm text-label-code-sm px-space-xs py-0.5 rounded bg-surface-container-highest text-error font-semibold uppercase shrink-0">
                    {pattern.status}
                  </span>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPattern(pattern);
                  showToast(`Showing evidence for ${pattern.code}`);
                }}
                className="w-full flex items-center justify-center gap-space-xs px-space-md py-space-sm rounded bg-primary-container text-on-primary-container font-headline-sm text-headline-sm font-semibold hover:bg-primary transition-colors"
              >
                <span>View pattern evidence</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          )))}
        </div>
      </section>


      {/* Evidence for the selected pattern: pathway, correlations, precedents, policy */}
      <Disclosure
        title="Evidence for the selected pattern"
        summary={selectedPattern ? selectedPattern.name + ' (' + selectedPattern.code + '): causal pathway, site comparison, linked precedents' : 'Select a pattern above to see its causal pathway and linked precedents'}
      >
        <div className="flex flex-col gap-space-xl">
      {/* Interactive Visual Precursor Pattern Network */}
      {!selectedPattern ? (
        <section className="flex flex-col items-center justify-center p-space-xl rounded-xl bg-surface-container-low border border-surface-container-high/40 text-on-surface-variant min-h-[260px]">
          {isLoading ? (
            <div className="flex items-center gap-3 font-label-code-sm">
              <span className="material-symbols-outlined animate-spin text-primary text-[24px]">progress_activity</span>
              <span>Loading patterns…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 font-label-code-sm text-outline">
              <span className="material-symbols-outlined text-[36px]">filter_alt_off</span>
              <span>No matching precursor patterns found for search query.</span>
            </div>
          )}
        </section>
      ) : (
      <section className="flex flex-col rounded-xl bg-surface-container-low p-space-xl shadow-lg relative border border-surface-container-high/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md mb-space-lg">
          <div className="flex flex-col">
            <div className="flex items-center gap-space-sm">
              <span className="font-label-code-sm text-label-code-sm px-space-xs py-0.5 rounded bg-primary-container text-on-primary-container font-semibold uppercase">
                Selected pattern
              </span>
              <span className="font-label-code-sm text-label-code-sm text-outline">
                {selectedPattern.code}
              </span>
            </div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface mt-space-xs font-semibold">
              Active Causal Chain Network: {selectedPattern.name}
            </h2>
          </div>

          <div className="flex items-center gap-space-sm">
            <div className="flex items-center gap-space-xs px-space-md py-1 rounded bg-surface-container font-label-code-sm text-label-code-sm text-on-surface-variant border border-surface-container-high/30">
              <span className="w-2 h-2 rounded-full bg-error animate-ping"></span>
              <span>SIF S-1 Potential ({selectedPattern.sifScore}%)</span>
            </div>
            <button
              onClick={() => {
                setShowDetailedTopology((prev) => !prev);
                showToast(`Detailed topology spline rendering ${!showDetailedTopology ? 'enabled' : 'disabled'}`);
              }}
              className={`p-space-xs rounded transition-colors ${
                showDetailedTopology
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
              title="Toggle Detailed Topology"
            >
              <span className="material-symbols-outlined text-[20px]">account_tree</span>
            </button>
          </div>
        </div>

        {/* Node Pathway Visualizer SVG */}
        <div className="relative w-full rounded-lg bg-surface-container-lowest p-space-lg overflow-x-auto min-h-[380px] flex items-center justify-center border border-surface-container-high/30">
          <svg
            className="w-full h-full min-w-[920px] max-w-5xl"
            fill="none"
            viewBox="0 0 960 300"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Splines — solid/thicker when detailed topology is enabled, dashed/thin otherwise */}
            <path d="M 180 150 C 240 150, 250 80, 310 80" stroke="#38bdf8" strokeDasharray={showDetailedTopology ? undefined : '4 4'} strokeWidth={showDetailedTopology ? 3 : 2} className="opacity-70" />
            <path d="M 180 150 C 240 150, 250 220, 310 220" stroke="#38bdf8" strokeDasharray={showDetailedTopology ? undefined : '4 4'} strokeWidth={showDetailedTopology ? 3 : 2} className="opacity-70" />
            <path d="M 490 80 C 540 80, 560 150, 610 150" stroke="#3198dc" strokeWidth={showDetailedTopology ? 3 : 2} />
            <path d="M 490 220 C 540 220, 560 150, 610 150" stroke="#3198dc" strokeWidth={showDetailedTopology ? 3 : 2} />
            <path d="M 760 150 L 820 150" stroke="#ffb4ab" strokeWidth={showDetailedTopology ? 4 : 3} />

            {/* Node 1: Root Hazard Class */}
            <g className="cursor-pointer group" transform="translate(30, 110)">
              <rect className="group-hover:fill-surface-container-high transition-colors" fill="#1c2028" height="80" rx="8" width="150" />
              <rect fill="#38bdf8" height="80" rx="2" width="4" x="0" y="0" />
              <text fill="#87929a" fontFamily="IBM Plex Mono" fontSize="10" fontWeight="600" x="14" y="24">
                HAZARD CLASS
              </text>
              <text fill="#dfe2ee" fontFamily="Inter" fontSize="12" fontWeight="600" x="14" y="44">
                {selectedPattern.triad?.hazardClass ? selectedPattern.triad.hazardClass.slice(0, 18) : 'Hazard Vector'}
              </text>
              <text fill="#bdc8d1" fontFamily="Inter" fontSize="11" x="14" y="60">
                Primary Root Vector
              </text>
            </g>

            {/* Node 2A: Trigger Node */}
            <g className="cursor-pointer group" transform="translate(310, 40)">
              <rect className="group-hover:fill-surface-container-high transition-colors" fill="#1c2028" height="80" rx="8" width="180" />
              <rect fill="#38bdf8" height="80" rx="2" width="4" x="0" y="0" />
              <text fill="#8ed5ff" fontFamily="IBM Plex Mono" fontSize="10" fontWeight="600" x="14" y="22">
                TRIGGER
              </text>
              <text fill="#dfe2ee" fontFamily="Inter" fontSize="12" fontWeight="600" x="14" y="42">
                {selectedPattern.triad?.trigger ? selectedPattern.triad.trigger.slice(0, 22) : 'Trigger Vector'}
              </text>
              <text fill="#bdc8d1" fontFamily="Inter" fontSize="11" x="14" y="58">
                Initiating Hazard
              </text>
            </g>

            {/* Node 2B: Procedural Breach */}
            <g className="cursor-pointer group" transform="translate(310, 180)">
              <rect className="group-hover:fill-surface-container-high transition-colors" fill="#1c2028" height="80" rx="8" width="180" />
              <rect fill="#38bdf8" height="80" rx="2" width="4" x="0" y="0" />
              <text fill="#ffdad6" fontFamily="IBM Plex Mono" fontSize="10" fontWeight="600" x="14" y="22">
                PROCEDURAL BREACH
              </text>
              <text fill="#dfe2ee" fontFamily="Inter" fontSize="12" fontWeight="600" x="14" y="42">
                {selectedPattern.triad?.proceduralBreach ? selectedPattern.triad.proceduralBreach.slice(0, 22) : 'Breach Record'}
              </text>
              <text fill="#bdc8d1" fontFamily="Inter" fontSize="11" x="14" y="58">
                Barrier Breakdown
              </text>
            </g>

            {/* Node 3: Behavioral Variance */}
            <g className="cursor-pointer group" transform="translate(610, 110)">
              <rect className="group-hover:fill-surface-container-high transition-colors" fill="#1c2028" height="80" rx="8" width="150" />
              <rect fill="#93ccff" height="80" rx="2" width="4" x="0" y="0" />
              <text fill="#93ccff" fontFamily="IBM Plex Mono" fontSize="10" fontWeight="600" x="14" y="22">
                BEHAVIORAL VARIANCE
              </text>
              <text fill="#dfe2ee" fontFamily="Inter" fontSize="12" fontWeight="600" x="14" y="42">
                {selectedPattern.triad?.behavioralVariance ? selectedPattern.triad.behavioralVariance.slice(0, 18) : 'Not Recorded'}
              </text>
              <text fill="#bdc8d1" fontFamily="Inter" fontSize="11" x="14" y="58">
                Operational Drift
              </text>
            </g>

            {/* Node 4: SIF Outcome */}
            <g className="cursor-pointer group" transform="translate(820, 110)">
              <rect className="group-hover:fill-error-container transition-colors" fill="#93000a" height="80" rx="8" width="120" />
              <text fill="#ffdad6" fontFamily="IBM Plex Mono" fontSize="10" fontWeight="700" x="14" y="24">
                SIF OUTCOME
              </text>
              <text fill="#ffdad6" fontFamily="Inter" fontSize="13" fontWeight="700" x="14" y="44">
                {selectedPattern.triad?.consequence ? selectedPattern.triad.consequence.slice(0, 14) : 'Potential SIF'}
              </text>
              <text fill="#ffdad6" fontFamily="Inter" fontSize="11" x="14" y="60">
                Exposure Outcome
              </text>
            </g>
          </svg>
        </div>

        {/* Node Explanatory Mini-Drawer Banner */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-space-md mt-space-md p-space-md rounded bg-surface-container border border-surface-container-high/40">
          <div className="flex items-center gap-space-md">
            <span className="material-symbols-outlined text-primary text-[22px]">lightbulb</span>
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-on-surface">
                Algorithmic Correlation Insight
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                {selectedPattern.description || 'Precursor pattern mapped across operational observations.'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-space-sm">
            <span className="font-label-code-sm text-label-code-sm text-primary font-bold">
              Confidence: {selectedPattern.confidence != null ? `${selectedPattern.confidence}%` : 'N/A'}
            </span>
            <span className="font-label-code-sm text-label-code-sm px-space-sm py-0.5 rounded bg-surface-container-high text-on-surface-variant border border-surface-container-high/40">
              Recorded pattern
            </span>
          </div>
        </div>
      </section>
      )}

      {/* Visual Asset Showcase & Pattern Correlation Matrix */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        {/* Correlation Matrix & Phenotype Inspector (8 cols) */}
        <div className="lg:col-span-8 flex flex-col p-space-lg rounded-xl bg-surface-container shadow-md border border-surface-container-high/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm mb-space-md">
            <div className="flex flex-col">
              <span className="font-label-code-sm text-label-code-sm text-primary font-semibold uppercase">
                Correlation detail
              </span>
              <h4 className="font-headline-md text-headline-md text-on-surface font-semibold">
                {selectedPattern ? `${selectedPattern.name} × ${selectedPattern.affectedSites?.length ? selectedPattern.affectedSites.join(', ') : 'Cross-Facility Matrix'}` : 'Phenotype Correlation Deep Dive'}
              </h4>
            </div>
            <div className="flex items-center gap-space-xs">
              <span className="font-label-code-sm text-label-code-sm text-outline">Cluster Overlap:</span>
              <span className="font-label-code-md text-label-code-md text-primary font-semibold">
                {selectedPattern?.confidence != null ? `${selectedPattern.confidence}% Match` : 'N/A'}
              </span>
            </div>
          </div>

          {/* Recurrence Timeline */}
          <div className="flex flex-col gap-space-xs p-space-md rounded-lg bg-surface-container-low mb-space-md border border-surface-container-high/30">
            <div className="flex items-center justify-between">
              <span className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">
                60-Day Recurrence Spike Frequency
              </span>
              <span className="font-label-code-sm text-label-code-sm text-on-surface-variant font-medium">
                {selectedPattern?.mtboDays != null ? `Observed MTBO: ${selectedPattern.mtboDays} days` : 'Recurrence Schedule: Insufficient Data'}
              </span>
            </div>
            <div className="py-6 px-4 w-full mt-space-xs flex flex-col items-center justify-center text-center bg-surface-container-lowest rounded-lg border border-surface-container-high/20">
              <span className="material-symbols-outlined text-outline text-[28px] mb-1">show_chart</span>
              <span className="font-label-code-sm text-label-code-sm text-on-surface-variant font-medium">
                Insufficient historical observations to generate recurrence curve
              </span>
              <span className="font-body-sm text-body-sm text-outline mt-0.5 text-xs">
                Time-series progression requires at least 5 chronological sensor snapshots.
              </span>
            </div>
          </div>

          {/* Linked Historical Incident Reports */}
          <div className="flex flex-col gap-space-sm mb-space-md">
            <span className="font-label-code-sm text-label-code-sm text-outline uppercase tracking-wider font-semibold">
              Identified Genotypic Precedents
            </span>
            {linkedPrecedents.length === 0 ? (
              <div className="p-space-md rounded bg-surface-container-low border border-surface-container-high/30 text-center text-outline font-label-code-sm text-xs">
                No historical precedent records are linked to this pattern.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                {linkedPrecedents.map((prec) => (
                  <div
                    key={prec.id}
                    onClick={() => navigate('/safety-memory')}
                    className="p-space-sm rounded bg-surface-container-low flex flex-col gap-space-xs hover:bg-surface-container-high transition-colors cursor-pointer border border-surface-container-high/30"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-label-code-sm text-label-code-sm text-primary font-bold">
                        {prec.precedentCode || prec.code || prec.id}
                      </span>
                      <span className="font-label-code-sm text-label-code-sm text-outline">
                        {prec.year || prec.date || 'Historical'}
                      </span>
                    </div>
                    <span className="font-body-sm text-body-sm text-on-surface font-medium break-words">
                      {prec.title}
                    </span>
                    <span className="font-label-code-sm text-label-code-sm text-on-surface-variant break-words">
                      {prec.operationalContext || prec.summary || 'Historical precedent record.'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actionable Barrier Reinforcement Policy */}
          <div className="flex flex-col gap-space-xs p-space-md rounded-lg bg-surface-container-high border border-surface-container-high/60">
            <div className="flex items-center gap-space-xs text-primary">
              <span className="material-symbols-outlined text-[18px]">verified</span>
              <span className="font-label-code-sm text-label-code-sm uppercase font-bold">
                Prescriptive Barrier Reinforcement Directive
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {selectedPattern?.triad?.proceduralBreach ? (
                <>
                  Mandatory control verification required for <strong>{selectedPattern.triad.proceduralBreach}</strong> across affected operational units. Protocol interlock triggered when {selectedPattern.triad.trigger || 'systemic precursor variance'} is detected.
                </>
              ) : (
                <>
                  Deploy targeted barrier verification protocol for {selectedPattern?.keyVector || 'operational vector'}. Refer to Interventions registry for active CAPAs.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Operational Reality Imagery (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-space-md">
          <div className="flex flex-col rounded-xl bg-surface-container overflow-hidden shadow-md border border-surface-container-high/40">
            <div className="relative h-44 w-full">
              <img
                className="w-full h-full object-cover"
                alt="Industrial facility unit"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAs4pajcJ23BhmGyrOCY9KekPTeycrpf_n1dFxdk-RP7AqfpifacuHnF-Dhyc69omKtmwLfgK0prPXBNOiye5jX9-hdBJGItkxern07mBjKr8Vk_updgG6T0SkQX8PCM-eYGIKP1uxcYOOQS_BMXoti5nsptDzVsGyoSv74cX2sO00iVIe7YYGKqxVqcH8mlmKlFc4xMR7rGsMjwO1GjU7UZtfmquWjm9Yi6WobrDQcKvK6dW2smvOW"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-container via-surface-container/40 to-transparent"></div>
              <span className="absolute bottom-3 left-3 right-3 font-label-code-sm text-label-code-sm px-space-xs py-0.5 rounded bg-surface-container-lowest/80 backdrop-blur-md text-primary font-medium break-words w-fit max-w-full">
                {selectedPattern?.affectedSites?.length ? selectedPattern.affectedSites[0].toUpperCase() : 'ENTERPRISE PRODUCTION'}
              </span>
            </div>
            <div className="p-space-md flex flex-col gap-space-xs">
              <div className="flex items-center justify-between">
                <span className="font-label-code-sm text-label-code-sm uppercase text-outline">
                  Physical Context
                </span>
                <span className="font-label-code-sm text-label-code-sm text-on-surface font-semibold">
                  {selectedPattern?.keyVector || 'Operational Vector'}
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface">
                {selectedPattern?.description || 'Precursor pattern mapped across operational observations.'}
              </span>
            </div>
          </div>

          <div className="flex flex-col rounded-xl bg-surface-container overflow-hidden shadow-md border border-surface-container-high/40">
            <div className="relative h-44 w-full">
              <img
                className="w-full h-full object-cover"
                alt="Heavy duty lockout tagout padlocks"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAnFpTp6u6sHO-dj3xlO9VGXgIrK8GsvncPOQViSvZArek1IgPRNQQ8iruXbXsZ-EWUUNsxPMsojdOPsULbVe78sLY-zQWqELxIrLsPppUVhuhFvVwtoyOngZ7DKZTHYbLAHs11dS4bf3vVi2UzFF4FPLp-jRdfHbZZxcjEC4h-sYE7K6AIrDU3OKMnsOFxZbbFCACIjAeu0JN9-GG5XDP6YObyG5QmODcKHmpxL3bxF9FdCX-lTXbH"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-container via-surface-container/40 to-transparent"></div>
              <span className="absolute bottom-3 left-3 font-label-code-sm text-label-code-sm px-space-xs py-0.5 rounded bg-surface-container-lowest/80 backdrop-blur-md text-error font-medium">
                BARRIER DEFENSE AUDIT
              </span>
            </div>
            <div className="p-space-md flex flex-col gap-space-xs">
              <div className="flex items-center justify-between">
                <span className="font-label-code-sm text-label-code-sm uppercase text-outline">
                  Governing Barrier
                </span>
                <span className="font-label-code-sm text-label-code-sm text-primary font-bold">
                  {selectedPattern?.triad?.proceduralBreach || 'Barrier Not Recorded'}
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface">
                {selectedPattern?.triad?.trigger ? `Active trigger vector: ${selectedPattern.triad.trigger}` : 'Monitoring active barrier health telemetry.'}
              </span>
            </div>
          </div>
        </div>
      </section>
        </div>
      </Disclosure>
    </div>
  );
};
