import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, FacilityItem } from '../services/api';
import { SafetyMemoryItem } from '../types';
import { Disclosure } from '../components/ui/Disclosure';

export const SafetyMemoryPage: React.FC = () => {
  const navigate = useNavigate();

  // Search state
  const [searchQuery, setSearchQuery] = useState('atmospheric gas testing omission confined space night shift handover');
  const [searchMode, setSearchMode] = useState<'semantic' | 'keyword' | 'fingerprint'>('semantic');
  const [selectedFacility, setSelectedFacility] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [selectedPrecedent, setSelectedPrecedent] = useState<SafetyMemoryItem | null>(null);

  // Facilities from backend
  const [facilities, setFacilities] = useState<FacilityItem[]>([]);

  // Results state
  const [results, setResults] = useState<SafetyMemoryItem[]>([]);
  const [meanSimilarity, setMeanSimilarity] = useState<number | null>(null);
  const [totalCorpusRecords, setTotalCorpusRecords] = useState<number>(0);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    api.getFacilities().then((facs) => {
      if (facs && facs.length > 0) {
        setFacilities(facs);
      }
    }).catch(() => {});
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // Real export of the current search results, built from live backend data
  const handleExportPrecedentDossier = () => {
    if (results.length === 0) {
      showToast('No precedent results to export.');
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      query: searchQuery,
      searchMode,
      meanSimilarity,
      resultCount: results.length,
      results
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `precedent_analysis_dossier_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${results.length} precedent record(s) to dossier.`);
  };

  const executeSearch = useCallback(async (query: string, mode: 'semantic' | 'keyword' | 'fingerprint', fac: string, cat: string, sev: string) => {
    setIsSearching(true);
    setError(null);
    try {
      const data = await api.searchSafetyMemory(query, {
        mode,
        facility: fac,
        category: cat,
        severity: sev
      });
      setResults(data.results || []);
      setMeanSimilarity(data.meanSimilarity !== undefined ? data.meanSimilarity : null);
      if (data.totalRecords !== undefined) {
        setTotalCorpusRecords(data.totalRecords);
      }
    } catch (err: any) {
      setError(err.message || 'Could not search Safety Memory.');
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    executeSearch(searchQuery, searchMode, selectedFacility, selectedCategory, selectedSeverity);
  }, [searchQuery, searchMode, selectedFacility, selectedCategory, selectedSeverity, executeSearch]);

  const handleModeChange = (newMode: 'semantic' | 'keyword' | 'fingerprint') => {
    setSearchMode(newMode);
    if (newMode === 'semantic') {
      showToast('Switched to Multi-Field Database Search (weighted across precursors, narrative, title, LSR)');
    } else if (newMode === 'keyword') {
      showToast('Switched to Keyword Match: Exact term frequency & substring matching across database records');
    } else {
      showToast('Switched to Fingerprint Match: Precursor failure-vector Jaccard overlap');
    }
  };

  const handleSearchClick = () => {
    executeSearch(searchQuery, searchMode, selectedFacility, selectedCategory, selectedSeverity);
    showToast(`${searchMode.toUpperCase()} query refreshed for "${searchQuery.slice(0, 30)}..."`);
  };

  const rankedResults = [...results].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

  const renderPrecedent = (item: SafetyMemoryItem) => {
            const isActualized = (item.sifClassification || '').toLowerCase().includes('actualized');
    const isCritical = item.sifPotential === 'CRITICAL';

    const borderColor = isActualized
      ? 'border-l-error'
      : isCritical
      ? 'border-l-secondary-container'
      : 'border-l-primary';

    return (
      <div
        key={item.id}
        className={`bg-surface-container-low p-space-xl rounded-xl shadow-md flex flex-col gap-space-md border border-surface-container-high/40 border-l-4 ${borderColor} hover:bg-surface-container/40 transition-colors`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-sm flex-wrap">
            <span className="font-label-code-sm text-label-code-sm px-2 py-0.5 rounded font-mono font-bold bg-surface-container text-on-surface border border-surface-container-high/50">
              {item.code}
            </span>
            <span
              className={`font-label-code-sm text-label-code-sm px-2 py-0.5 rounded uppercase font-bold ${
                isActualized
                  ? 'bg-error-container text-on-error-container'
                  : isCritical
                  ? 'bg-secondary-container/30 text-secondary'
                  : 'bg-surface-container-high text-primary'
              }`}
            >
              {item.sifClassification || 'UNCLASSIFIED'}
            </span>
            <span className="font-label-code-sm text-label-code-sm text-outline">
              {item.date || 'N/A'} • {item.facility}{item.unit ? ` (${item.unit})` : ''}
            </span>
          </div>

          <div className="flex items-center gap-space-sm shrink-0">
            <span className="font-label-code-sm text-label-code-sm text-outline">
              Similarity:
            </span>
            <span
              className={`font-label-code-lg text-label-code-lg font-bold ${
                item.matchScore >= 90
                  ? 'text-error'
                  : item.matchScore >= 75
                  ? 'text-secondary'
                  : 'text-primary'
              }`}
            >
              {item.matchScore}%
            </span>
          </div>
        </div>

        <div>
          <h3 className="font-headline-md text-headline-md text-on-surface font-bold mb-1">
            {item.title}
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
            {item.narrative}
          </p>
        </div>

        {/* Precursor vector tag pills */}
        <div className="flex flex-wrap items-center gap-space-xs pt-1">
          <span className="font-label-code-sm text-label-code-sm text-outline mr-1">
            Precursors:
          </span>
          {(item.extractedPrecursors || []).map((p, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-code-sm text-[11px] border border-surface-container-high/40"
            >
              {p}
            </span>
          ))}
        </div>

        {/* Barrier Failure & Lessons Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md pt-space-xs mt-space-xs border-t border-surface-container-high/30">
          <div className="flex flex-col gap-1 bg-surface-container-lowest/60 p-space-sm rounded-lg">
            <div className="flex items-center gap-1.5 text-error">
              <span className="material-symbols-outlined text-[16px]">cancel</span>
              <span className="font-label-code-sm text-label-code-sm font-semibold uppercase">
                Barrier that failed
              </span>
            </div>
            <span className="font-body-sm text-body-sm text-on-surface">
              {item.brokenBarrier}
            </span>
          </div>

          <div className="flex flex-col gap-1 bg-surface-container-lowest/60 p-space-sm rounded-lg">
            <div className="flex items-center gap-1.5 text-primary">
              <span className="material-symbols-outlined text-[16px]">lightbulb</span>
              <span className="font-label-code-sm text-label-code-sm font-semibold uppercase">
                Key lesson
              </span>
            </div>
            <span className="font-body-sm text-body-sm text-on-surface">
              {item.lessonsLearned}
            </span>
          </div>
        </div>

        {/* Card Action Cluster */}
        <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs border-t border-surface-container-high/20">
          <span className="font-label-code-sm text-label-code-sm text-outline">
            Governing rule: <strong className="text-on-surface">{item.governingLsr}</strong>
          </span>
          <div className="flex items-center gap-space-xs">
            <button
              onClick={() => setSelectedPrecedent(item)}
              className="px-space-sm py-1 rounded bg-surface-container text-on-surface hover:bg-surface-bright font-label-code-sm text-label-code-sm flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">visibility</span>
              <span>Full root cause analysis</span>
            </button>
            <button
              onClick={() => {
                showToast(`Adopted lessons learned from ${item.code}`);
                navigate('/interventions');
              }}
              className="px-space-sm py-1 rounded bg-primary-container text-on-primary-container font-label-code-sm text-label-code-sm font-semibold hover:bg-primary transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">add_task</span>
              <span>Generate CAPA</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full gap-space-xl">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-surface-container-highest border border-primary/40 text-on-surface px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 font-label-code-sm text-label-code-sm">
          <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
          <span>{toastMsg}</span>
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
            onClick={handleSearchClick}
            className="px-3 py-1 rounded bg-error text-on-error font-label-code-sm text-label-code-sm flex items-center gap-1 hover:bg-error/90 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Institutional Corpus Search Header */}
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
              Safety Memory
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-0.5">
              What relevant historical cases can inform this decision?
            </p>
          </div>

          <div className="flex items-center gap-space-sm flex-wrap">
            <button
              onClick={handleExportPrecedentDossier}
              className="px-space-md py-1.5 rounded bg-surface-container-high text-on-surface hover:bg-surface-bright font-headline-sm text-headline-sm flex items-center gap-space-xs transition-colors border border-surface-container-high/40"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              <span>Export dossier</span>
            </button>
            <button
              onClick={() => {
                navigate('/dashboard');
              }}
              className="px-space-md py-1.5 rounded bg-surface-container-high text-on-surface font-headline-sm text-headline-sm flex items-center gap-space-xs hover:bg-surface-brightainer transition-colors shadow-md"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              <span>Back to dashboard</span>
            </button>
          </div>
        </div>

        {/* Large Search Console */}
        <div className="bg-surface-container-low p-space-lg rounded-xl shadow-md flex flex-col gap-space-md border border-surface-container-high/40">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-space-md text-primary text-[24px]">
              manage_search
            </span>
            <input
              type="text"
              aria-label="Search safety memory corpus"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchClick()}
              placeholder="Describe the situation, hazard, barrier or equipment"
              className="w-full bg-surface-container-lowest pl-12 pr-28 py-3.5 rounded-lg text-on-surface font-body-md text-body-md placeholder-outline focus:outline-none focus:bg-surface-container-highest transition-colors border border-surface-container-high/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-24 text-outline hover:text-on-surface transition-colors"
                title="Clear search query"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
            <button
              onClick={handleSearchClick}
              disabled={isSearching}
              className="absolute right-2 px-space-md py-2 rounded-md bg-primary-container text-on-primary-container font-headline-sm text-headline-sm font-semibold hover:bg-primary transition-colors flex items-center gap-1 disabled:opacity-60"
            >
              <span>{isSearching ? 'Searching…' : 'Search'}</span>
            </button>
          </div>

          {/* Search Mode Toggles & Suggestion Chips */}
          <div className="flex flex-wrap items-center gap-space-sm pt-space-xs">
            {/* Quick Suggestion Chips */}
            <div className="flex items-center gap-space-xs flex-wrap">
              <span className="font-label-code-sm text-label-code-sm text-outline">Try:</span>
              {[
                'LOTO bypass pump seal',
                'Atmospheric sniff night shift',
                'Scaffold anchor high wind',
                'Crane tagline boom sway'
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setSearchQuery(suggestion)}
                  className="px-2 py-0.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-label-code-sm text-[11px] transition-colors border border-surface-container-high/30"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          <Disclosure
            title="Search options and filters"
            summary={(searchMode === 'semantic' ? 'Multi-field search' : searchMode === 'keyword' ? 'Keyword match' : 'Precursor fingerprint') + ' · facility: ' + (selectedFacility === 'all' ? 'all' : (facilities.find((x) => x.id === selectedFacility)?.name ?? selectedFacility)) + ' · category: ' + selectedCategory + ' · severity: ' + selectedSeverity}
            className="bg-surface-container"
          >
            <div className="flex flex-col gap-space-md">
            <div className="flex items-center gap-space-xs flex-wrap">
              <span className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">
                Search method:
              </span>
              {(['semantic', 'keyword', 'fingerprint'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  className={`px-space-sm py-1 rounded font-label-code-sm text-label-code-sm capitalize transition-all ${
                    searchMode === mode
                      ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                      : 'bg-surface-container text-outline hover:text-on-surface'
                  }`}
                >
                  {mode === 'semantic' ? 'Multi-Field Search' : mode === 'keyword' ? 'Keyword Match' : 'Precursor Fingerprint'}
                </button>
              ))}
            </div>

          {/* Filtering Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-space-sm pt-space-xs border-t border-surface-container-high/30">
            <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-1.5 rounded">
              <span className="material-symbols-outlined text-outline text-[16px]">factory</span>
              <select
                aria-label="Filter by Facility"
                value={selectedFacility}
                onChange={(e) => setSelectedFacility(e.target.value)}
                className="bg-transparent text-on-surface font-label-code-sm text-label-code-sm focus:outline-none w-full cursor-pointer"
              >
                <option value="all" className="bg-surface-container">All Global Facilities</option>
                {facilities.map((fac) => (
                  <option key={fac.id} value={fac.id} className="bg-surface-container">
                    {fac.code ? `${fac.code}: ` : ''}{fac.name} {fac.region ? `(${fac.region})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-1.5 rounded">
              <span className="material-symbols-outlined text-outline text-[16px]">category</span>
              <select
                aria-label="Filter by Category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-on-surface font-label-code-sm text-label-code-sm focus:outline-none w-full cursor-pointer"
              >
                <option value="all" className="bg-surface-container">All Categories</option>
                <option value="confined" className="bg-surface-container">Confined Space</option>
                <option value="isolation" className="bg-surface-container">Energy Isolation</option>
                <option value="hotwork" className="bg-surface-container">Process Safety</option>
              </select>
            </div>

            <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-1.5 rounded">
              <span className="material-symbols-outlined text-outline text-[16px]">bolt</span>
              <select
                aria-label="Filter by Severity"
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
                className="bg-transparent text-on-surface font-label-code-sm text-label-code-sm focus:outline-none w-full cursor-pointer"
              >
                <option value="all" className="bg-surface-container">All Severities</option>
                <option value="sif" className="bg-surface-container">SIF Actualized</option>
                <option value="psif" className="bg-surface-container">High Potential (pSIF)</option>
                <option value="nearmiss" className="bg-surface-container">Near Miss Only</option>
              </select>
            </div>
          </div>
            </div>
          </Disclosure>
        </div>
      </section>

      {/* Result Analytics Summary Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md p-space-md rounded-lg bg-surface-container border border-surface-container-high/40">
        <div className="flex items-center gap-space-sm flex-wrap">
          <span className="material-symbols-outlined text-primary text-[20px]">psychology</span>
          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
            {results.length} matching case{results.length === 1 ? '' : 's'}
          </span>
          {results.length > 0 && (
            <span className="font-label-code-sm text-label-code-sm px-2 py-0.5 rounded bg-primary-container text-on-primary-container font-semibold">
              Average similarity: {meanSimilarity != null ? `${meanSimilarity}%` : 'N/A'}
            </span>
          )}
        </div>
        <span className="font-label-code-sm text-label-code-sm text-outline">
          Search method: {searchMode === 'semantic' ? 'multi-field weighted query' : searchMode === 'keyword' ? 'keyword match' : 'precursor vector overlap'}
        </span>
      </div>

      {/* Precedent Cards List */}
      {results.length === 0 ? (
        <div className="bg-surface-container-low p-space-2xl rounded-xl border border-surface-container-high/40 text-center flex flex-col items-center justify-center gap-space-sm">
          <span className="material-symbols-outlined text-outline text-[48px]">search_off</span>
          <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">
            No institutional precedents found
          </h3>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
            No historical records match the specified search terms or filters in the safety archive.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedFacility('all');
              setSelectedCategory('all');
              setSelectedSeverity('all');
            }}
            className="mt-space-sm px-space-md py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-code-sm text-label-code-sm transition-colors border border-surface-container-high/40"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-space-lg">
          {rankedResults.slice(0, 3).map(renderPrecedent)}
          {rankedResults.length > 3 && (
            <Disclosure
              title={'More matches (' + (rankedResults.length - 3) + ')'}
              summary="Lower-ranked cases"
            >
              <ul className="flex flex-col divide-y divide-surface-container-high/40">
                {rankedResults.slice(3).map((item) => (
                  <li key={item.id} className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
                    <div className="min-w-0">
                      <p className="font-label-code-sm text-label-code-sm text-outline">
                        {item.code} · {item.sifClassification || 'Unclassified'} · {item.date || 'N/A'} · {item.facility}
                      </p>
                      <p className="font-body-md text-body-md text-on-surface font-semibold break-words">{item.title}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant break-words">Similarity {item.matchScore}%</p>
                    </div>
                    <button
                      onClick={() => setSelectedPrecedent(item)}
                      className="self-start px-space-sm py-1 rounded bg-surface-container text-on-surface hover:bg-surface-bright font-label-code-sm text-label-code-sm flex items-center gap-1 shrink-0"
                    >
                      <span className="material-symbols-outlined text-[16px]">visibility</span>
                      <span>Open case</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
        </div>
      )}

      {/* Full RCA Inspection Modal */}
      {selectedPrecedent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface-container-low border border-surface-container-high rounded-2xl max-w-2xl w-full p-space-xl shadow-2xl flex flex-col gap-space-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-surface-container-high/50 pb-space-md">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-outline text-label-code-sm">{selectedPrecedent.code}</span>
                  <span className="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-code-sm text-[10px] font-bold">
                    {selectedPrecedent.sifClassification || 'UNCLASSIFIED'}
                  </span>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface font-bold mt-1">
                  {selectedPrecedent.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPrecedent(null)}
                className="p-1 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-space-md">
              <div>
                <span className="font-label-code-sm text-label-code-sm text-outline uppercase block mb-1">
                  Full Investigation Narrative
                </span>
                <p className="font-body-md text-body-md text-on-surface bg-surface-container p-space-md rounded-lg">
                  {selectedPrecedent.narrative}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-space-md">
                <div className="bg-surface-container p-space-md rounded-lg">
                  <span className="font-label-code-sm text-label-code-sm text-error uppercase block mb-1">
                    Broken Barrier
                  </span>
                  <p className="font-body-sm text-body-sm text-on-surface">{selectedPrecedent.brokenBarrier}</p>
                </div>
                <div className="bg-surface-container p-space-md rounded-lg">
                  <span className="font-label-code-sm text-label-code-sm text-primary uppercase block mb-1">
                    Lesson Learned
                  </span>
                  <p className="font-body-sm text-body-sm text-on-surface">{selectedPrecedent.lessonsLearned}</p>
                </div>
              </div>

              <div>
                <span className="font-label-code-sm text-label-code-sm text-outline uppercase block mb-1">
                  Precursor Vectors
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedPrecedent.extractedPrecursors || []).map((p, idx) => (
                    <span key={idx} className="px-2.5 py-1 rounded bg-surface-container text-on-surface-variant font-label-code-sm text-xs">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-space-sm pt-space-md border-t border-surface-container-high/50">
              <button
                onClick={() => setSelectedPrecedent(null)}
                className="px-space-md py-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-bright font-label-code-sm text-label-code-sm"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedPrecedent(null);
                  navigate('/interventions');
                }}
                className="px-space-md py-1.5 rounded-lg bg-primary-container text-on-primary-container font-label-code-sm text-label-code-sm font-semibold hover:bg-primary"
              >
                Deploy Preventive CAPA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
