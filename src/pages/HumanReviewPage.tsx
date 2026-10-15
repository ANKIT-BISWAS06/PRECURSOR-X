import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { HumanReviewItem, SifPotentialLevel } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { Disclosure } from '../components/ui/Disclosure';
import { toneClasses, SeverityTone } from '../components/ui/Severity';

export const HumanReviewPage: React.FC = () => {
  const { user } = useAuth();
  // Backend state for human reviews strictly from PostgreSQL
  const [reviews, setReviews] = useState<HumanReviewItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected item strictly from backend
  const [selectedReview, setSelectedReview] = useState<HumanReviewItem | null>(null);

  // Calibration inputs (strictly null until a review is selected or calibrated)
  const [calibratedLevel, setCalibratedLevel] = useState<SifPotentialLevel | null>(null);
  const [calibratedScore, setCalibratedScore] = useState<number | null>(null);
  const [specialistNotes, setSpecialistNotes] = useState('');

  // Filters
  const [filterTab, setFilterTab] = useState<'pending' | 'disagreements' | 'all'>('pending');

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Height synchronization so left problem list ends exactly where right workspace ends
  const workspaceRef = React.useRef<HTMLDivElement>(null);
  const [workspaceHeight, setWorkspaceHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;

    const updateHeight = () => {
      if (el) {
        setWorkspaceHeight(el.offsetHeight);
      }
    };

    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        updateHeight();
      });
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, [selectedReview, reviews.length]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const loadReviews = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getReviewQueue();
      setReviews(data || []);
      if (data && data.length > 0) {
        setSelectedReview((prev) => {
          const firstPending = data.find((d) => d.status === 'PENDING_REVIEW');
          if (!prev) return firstPending || data[0];
          return data.find((d) => d.id === prev.id) || firstPending || data[0];
        });
      } else {
        setSelectedReview(null);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load review items.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSelectReview = async (item: HumanReviewItem) => {
    try {
      const detail = await api.getReviewItem(item.id);
      setSelectedReview(detail);
    } catch {
      setSelectedReview(item);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  // Update calibrate inputs when selectedReview changes
  useEffect(() => {
    if (selectedReview) {
      setCalibratedLevel(selectedReview.aiSifLevel || null);
      setCalibratedScore(
        selectedReview.aiSifScorePct !== null && selectedReview.aiSifScorePct !== undefined
          ? Math.round(selectedReview.aiSifScorePct)
          : null
      );
      setSpecialistNotes(selectedReview.specialistNotes || '');
    } else {
      setCalibratedLevel(null);
      setCalibratedScore(null);
      setSpecialistNotes('');
    }
  }, [selectedReview?.id]);

  // Actions with authoritative authenticated operator identity
  const handleApprove = async () => {
    if (!selectedReview) return;

    try {
      const response = await api.submitReviewDecision(
        selectedReview.id,
        'ACCEPT',
        specialistNotes
      );

      const updatedItem: HumanReviewItem = response.item || {
        ...selectedReview,
        status: response.status,
        decision: response.decision,
        verifiedBy: response.verifiedBy,
        verifiedAt: response.verifiedAt,
        specialistNotes: response.specialistNotes
      };

      setReviews((prev) => prev.map((r) => (r.id === selectedReview.id ? updatedItem : r)));
      setSelectedReview(updatedItem);
      showToast(`Certified AI classification for ${selectedReview.incidentCode}. Saved.`);
    } catch (err: any) {
      showToast(`Error submitting approval: ${err.message}`);
    }
  };

  const handleReclassify = async () => {
    if (!selectedReview) return;

    try {
      const response = await api.submitReviewDecision(
        selectedReview.id,
        'RECLASSIFY',
        specialistNotes,
        calibratedLevel || undefined,
        calibratedScore !== null ? calibratedScore : undefined
      );

      const updatedItem: HumanReviewItem = response.item || {
        ...selectedReview,
        status: response.status,
        decision: response.decision,
        aiSifLevel: calibratedLevel,
        aiSifScorePct: calibratedScore,
        verifiedBy: response.verifiedBy,
        verifiedAt: response.verifiedAt,
        specialistNotes: response.specialistNotes
      };

      setReviews((prev) => prev.map((r) => (r.id === selectedReview.id ? updatedItem : r)));
      setSelectedReview(updatedItem);
      showToast(`Reclassified ${selectedReview.incidentCode} to ${calibratedLevel || 'Calibrated'} (${calibratedScore !== null ? `${calibratedScore}%` : 'Unchanged'}).`);
    } catch (err: any) {
      showToast(`Error submitting reclassification: ${err.message}`);
    }
  };

  const handleEscalate = async () => {
    if (!selectedReview) return;

    try {
      const response = await api.submitReviewDecision(
        selectedReview.id,
        'ESCALATE',
        specialistNotes
      );

      const updatedItem: HumanReviewItem = response.item || {
        ...selectedReview,
        status: response.status,
        decision: response.decision,
        verifiedBy: response.verifiedBy,
        verifiedAt: response.verifiedAt,
        specialistNotes: response.specialistNotes
      };

      setReviews((prev) => prev.map((r) => (r.id === selectedReview.id ? updatedItem : r)));
      setSelectedReview(updatedItem);
      showToast(`Escalated ${selectedReview.incidentCode} to Corporate HSE Board.`);
    } catch (err: any) {
      showToast(`Error submitting escalation: ${err.message}`);
    }
  };

  const handleReject = async () => {
    if (!selectedReview) return;

    try {
      const response = await api.submitReviewDecision(
        selectedReview.id,
        'REJECT',
        specialistNotes
      );

      const updatedItem: HumanReviewItem = response.item || {
        ...selectedReview,
        status: response.status,
        decision: response.decision,
        verifiedBy: response.verifiedBy,
        verifiedAt: response.verifiedAt,
        specialistNotes: response.specialistNotes
      };

      setReviews((prev) => prev.map((r) => (r.id === selectedReview.id ? updatedItem : r)));
      setSelectedReview(updatedItem);
      showToast(`Rejected AI classification for ${selectedReview.incidentCode}. Overruled as false positive.`);
    } catch (err: any) {
      showToast(`Error submitting rejection: ${err.message}`);
    }
  };

  const filteredReviews = reviews.filter((r) => {
    if (filterTab === 'pending') return r.status === 'PENDING_REVIEW';
    if (filterTab === 'disagreements') return (r.aiConfidencePct != null && r.aiConfidencePct < 90) || r.status === 'RECLASSIFIED';
    return true;
  });

  const pendingCount = reviews.filter((r) => r.status === 'PENDING_REVIEW').length;
  const certifiedCount = reviews.filter((r) => r.status === 'CERTIFIED').length;
  const consensusRate = reviews.length > 0 ? `${((certifiedCount / reviews.length) * 100).toFixed(1)}%` : '--';

  const levelTone = (level?: string | null): SeverityTone =>
    level === 'CRITICAL' || level === 'HIGH' || level === 'MODERATE' ? 'critical' : 'neutral';

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
            onClick={loadReviews}
            className="px-3 py-1 rounded bg-error text-on-error font-label-code-sm text-label-code-sm flex items-center gap-1 hover:bg-error/90 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Header & Sub-Bar */}
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
              Human Review
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-0.5">
              What decision requires a human specialist?
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-space-md flex-wrap">
            <div className="px-space-md py-1.5 rounded-lg bg-surface-container-low border border-surface-container-high/40 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-error animate-ping"></span>
              <span className="font-label-code-sm text-label-code-sm text-outline">Queue:</span>
              <span className="font-label-code-md text-label-code-md text-error font-bold">
                {pendingCount} pending
              </span>
            </div>
            <div className="px-space-md py-1.5 rounded-lg bg-surface-container-low border border-surface-container-high/40 flex items-center gap-2">
              <span className="font-label-code-sm text-label-code-sm text-outline">Certified:</span>
              <span className="font-label-code-md text-label-code-md text-primary font-bold">
                {consensusRate}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Filters */}
        <div role="tablist" className="flex flex-wrap items-center gap-1 bg-surface-container-low p-1 rounded-lg border border-surface-container-high/40 self-start max-w-full">
          <button
            role="tab" aria-selected={filterTab === 'pending'}
            onClick={() => setFilterTab('pending')}
            className={`px-3 py-1.5 rounded font-label-code-sm text-label-code-sm transition-all ${
              filterTab === 'pending'
                ? 'bg-primary-container text-on-primary-container font-semibold'
                : 'text-outline hover:text-on-surface'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            role="tab" aria-selected={filterTab === 'disagreements'}
            onClick={() => setFilterTab('disagreements')}
            className={`px-3 py-1.5 rounded font-label-code-sm text-label-code-sm transition-all ${
              filterTab === 'disagreements'
                ? 'bg-primary-container text-on-primary-container font-semibold'
                : 'text-outline hover:text-on-surface'
            }`}
          >
            Disagreements
          </button>
          <button
            role="tab" aria-selected={filterTab === 'all'}
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 rounded font-label-code-sm text-label-code-sm transition-all ${
              filterTab === 'all'
                ? 'bg-primary-container text-on-primary-container font-semibold'
                : 'text-outline hover:text-on-surface'
            }`}
          >
            All records ({reviews.length})
          </button>
        </div>
      </section>

      {/* Split Queue Layout (4 cols list + 8 cols workspace) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
        {/* Left 4 Cols: Queue List (constrained to end at the exact same position as the right workspace) */}
        <div
          style={workspaceHeight ? { height: `${workspaceHeight}px`, maxHeight: `${workspaceHeight}px` } : undefined}
          className="xl:col-span-4 flex flex-col order-2 xl:order-none bg-surface-container-low p-space-lg rounded-xl border border-surface-container-high/40 shadow-md max-h-[560px] xl:max-h-none overflow-hidden min-h-0"
        >
          <div className="flex items-center justify-between pb-space-sm mb-space-sm border-b border-surface-container-high/40 shrink-0">
            <span className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold tracking-wider">
              Review queue
            </span>
            <span className="font-label-code-sm text-label-code-sm text-primary font-bold bg-surface-container px-2 py-0.5 rounded">
              {filteredReviews.length} {filteredReviews.length === 1 ? 'problem' : 'problems'}
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1.5 space-y-space-sm overscroll-contain">
            {filteredReviews.length === 0 ? (
              <div className="p-space-lg rounded-xl bg-surface-container text-center flex flex-col items-center justify-center gap-space-xs border border-surface-container-high/40 py-10">
                <span className="material-symbols-outlined text-outline text-[36px]">task_alt</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Queue Cleared
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant max-w-xs">
                  {filterTab === 'pending'
                    ? 'All pending classifications have been certified by safety governance.'
                    : 'No records match this filter.'}
                </p>
                <button
                  onClick={() => setFilterTab('all')}
                  className="mt-2 px-3 py-1 rounded bg-surface-container-high text-primary font-label-code-sm text-label-code-sm hover:bg-surface-bright"
                >
                  View All Records
                </button>
              </div>
            ) : (
              filteredReviews.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectReview(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectReview(item);
                    }
                  }}
                  className={`p-space-md rounded-xl transition-all cursor-pointer border ${
                    selectedReview?.id === item.id
                      ? 'bg-surface-container-high border-primary shadow-lg ring-1 ring-primary'
                      : 'bg-surface-container-low hover:bg-surface-container border-surface-container-high/40 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-label-code-sm text-label-code-sm text-primary font-bold">
                      {item.incidentCode}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-label-code-sm text-label-code-sm font-semibold ${
                        item.status === 'PENDING_REVIEW'
                          ? 'bg-amber-950/70 text-amber-300'
                          : item.status === 'CERTIFIED'
                          ? 'bg-emerald-950/70 text-emerald-300'
                          : item.status === 'RECLASSIFIED'
                          ? 'bg-primary-container text-on-primary-container'
                          : 'bg-rose-950/70 text-rose-300'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <h4 className="font-headline-sm text-headline-sm text-on-surface font-semibold break-words">
                    {item.title}
                  </h4>

                  <div className="flex items-start justify-between gap-2 text-label-code-sm text-label-code-sm text-on-surface-variant mt-2">
                    <span className="break-words min-w-0">{item.siteName || 'N/A'}</span>
                    <span className="text-error font-semibold shrink-0 whitespace-nowrap">
                      {item.aiSifScorePct !== null && item.aiSifScorePct !== undefined ? `${item.aiSifScorePct}%` : 'N/A'}{' '}
                      {item.aiSifLevel || 'N/A'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right 8 Cols: Active Review Workspace */}
        <div
          ref={workspaceRef}
          className="order-1 xl:order-none xl:col-span-8 bg-surface-container-low p-space-xl rounded-xl shadow-md flex flex-col gap-space-lg border border-surface-container-high/40"
        >
          {!selectedReview ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-outline gap-3 min-h-[240px]">
              {isLoading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-primary text-[32px]">progress_activity</span>
                  <span className="font-label-code-sm text-label-code-sm">Loading review queue…</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[42px]">fact_check</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface">No Incident Selected</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant max-w-sm">
                    Select an incident report from the review queue on the left to inspect AI inferences and certify safety classifications.
                  </span>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Header of Active Review */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pb-space-md border-b border-surface-container-high/40">
                <div className="flex flex-col">
                  <div className="flex items-center gap-space-xs mb-1 flex-wrap">
                    <span className="font-label-code-md text-label-code-md text-primary font-bold">
                      {selectedReview.incidentCode}
                    </span>
                    <span className="font-label-code-sm text-label-code-sm text-outline">
                      • {selectedReview.siteName || 'N/A'} • {selectedReview.unit || 'N/A'} • {selectedReview.eventTime}
                    </span>
                  </div>
                  <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold">
                    {selectedReview.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-space-md gap-y-1 mt-1 text-label-code-sm text-label-code-sm text-on-surface-variant">
                    <span>
                      Reporter:{' '}
                      <span className="text-on-surface font-semibold">
                        {selectedReview.reporter || 'Reporter Not Recorded'}
                      </span>
                    </span>
                    {selectedReview.verifiedBy && (
                      <span>
                        Verified By:{' '}
                        <span className="text-primary font-semibold">{selectedReview.verifiedBy}</span>
                        {selectedReview.verifiedAt && ` (${selectedReview.verifiedAt})`}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <span className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">
                    AI extraction confidence
                  </span>
                  <span className="font-label-code-lg text-headline-md text-primary font-bold">
                    {selectedReview.aiConfidencePct !== null && selectedReview.aiConfidencePct !== undefined
                      ? `${selectedReview.aiConfidencePct}%`
                      : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Primary finding: what the AI concluded, awaiting a human decision */}
              <div className={'flex flex-col gap-space-sm p-space-lg rounded-xl bg-surface-container border ' + toneClasses[levelTone(selectedReview.aiSifLevel)].border}>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  {selectedReview.status === 'PENDING_REVIEW'
                    ? 'AI finding awaiting your decision'
                    : 'AI finding (decision recorded: ' + selectedReview.status + ')'}
                </span>
                <p className={'font-headline-md text-headline-md font-bold break-words ' + toneClasses[levelTone(selectedReview.aiSifLevel)].text}>
                  {selectedReview.aiSifLevel || 'Unclassified'} SIF potential
                  {selectedReview.aiSifScorePct != null ? ' (' + selectedReview.aiSifScorePct + '% estimated risk)' : ' (score not available)'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md font-body-sm text-body-sm">
                  <div className="min-w-0">
                    <span className="text-outline">Standard involved</span>
                    <p className="text-on-surface font-medium break-words">{selectedReview.primaryLsr || 'No rule assigned'}</p>
                  </div>
                  <div className="min-w-0">
                    <span className="text-outline">Barriers affected</span>
                    <p className="text-on-surface font-medium break-words">
                      {selectedReview.barriers && selectedReview.barriers.length > 0
                        ? selectedReview.barriers.map((b) => b.name).join(', ')
                        : 'No barriers recorded'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Incident Narrative */}
              <div className="flex flex-col gap-space-xs">
                <span className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">
                  Incident narrative (as reported)
                </span>
                <div className="p-space-md rounded-lg bg-surface-container-lowest font-body-md text-body-md text-on-surface leading-relaxed border border-surface-container-high/30">
                  {selectedReview.narrative || 'No narrative provided.'}
                </div>
              </div>

              {/* Supporting evidence */}
              <Disclosure
                title="Supporting evidence"
                summary={(selectedReview.annotatedTokens?.length ?? 0) + ' extracted causal token(s) · ' + (selectedReview.opticalFeed ? 'optical capture attached' : 'no optical evidence recorded')}
                className="bg-surface-container"
              >
                <div className="flex flex-col gap-space-lg">
              {/* Annotated Causal Tokens (strictly persisted) */}
              <div className="flex flex-col gap-space-xs">
                <span className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">
                  Extracted causal tokens
                </span>
                {selectedReview.annotatedTokens && selectedReview.annotatedTokens.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedReview.annotatedTokens.map((tok) => (
                      <div
                        key={tok.id}
                        className="px-2.5 py-1 rounded bg-surface-container font-label-code-sm text-label-code-sm flex items-center gap-1.5 border border-surface-container-high/40"
                        title={tok.description ?? undefined}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            tok.type === 'critical-precursor'
                              ? 'bg-error'
                              : tok.type === 'barrier-breach'
                              ? 'bg-amber-400'
                              : tok.type === 'mitigating-action'
                              ? 'bg-primary'
                              : 'bg-purple-400'
                          }`}
                        ></span>
                        <span className="text-on-surface font-semibold">{tok.text}</span>
                        <span className="text-outline text-[10px]">({tok.weightPct}%)</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded bg-surface-container/40 text-outline font-label-code-sm text-label-code-sm">
                    No annotated tokens recorded in database.
                  </div>
                )}
              </div>

              {/* Optical Feed: strictly show real feed if exists, otherwise explicit 'No optical evidence recorded.' */}
              {selectedReview.opticalFeed ? (
                <div className="flex items-center gap-space-md p-space-sm rounded-lg bg-surface-container border border-surface-container-high/40">
                  <img
                    src={selectedReview.opticalFeed.imageUrl}
                    alt={selectedReview.opticalFeed.label}
                    className="w-24 h-16 object-cover rounded border border-surface-container-high"
                  />
                  <div className="flex flex-col">
                    <span className="font-label-code-sm text-label-code-sm text-primary font-bold">
                      {selectedReview.opticalFeed.camId} • {selectedReview.opticalFeed.label}
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface">
                      {selectedReview.opticalFeed.aiMaskNotes}
                    </span>
                    <span className="font-label-code-sm text-label-code-sm text-outline">
                      {selectedReview.opticalFeed.timestamp}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-space-sm px-space-md py-2.5 rounded-lg bg-surface-container/60 border border-surface-container-high/40 text-outline">
                  <span className="material-symbols-outlined text-[18px]">no_photography</span>
                  <span className="font-label-code-sm text-label-code-sm">
                    No optical evidence recorded.
                  </span>
                </div>
              )}

                </div>
              </Disclosure>

              {/* Specialist Calibration & Feedback Form */}
              <div className="flex flex-col gap-space-md p-space-lg rounded-xl bg-surface-container-high/50 border border-surface-container-high">
                <div className="flex flex-wrap items-center justify-between gap-space-sm">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">tune</span>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                      Your decision
                    </h3>
                  </div>
                  <span className="font-label-code-sm text-label-code-sm text-outline">
                    Current Status: <span className="text-on-surface font-semibold">{selectedReview.status}</span>
                  </span>
                </div>

                {/* Authenticated Reviewer Display (Read-Only) */}
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold flex items-center gap-1">
                    <span>Authenticated Reviewer</span>
                  </label>
                  <div className="bg-surface-container px-3 py-2 rounded text-on-surface font-body-sm text-body-sm flex items-center justify-between border border-surface-container-high/50">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[18px]">verified_user</span>
                      <span className="font-semibold text-white">{user?.full_name || user?.email || 'Authenticated Operator'}</span>
                    </div>
                    <span className="font-label-code-sm text-[10px] text-primary uppercase bg-primary-container px-2 py-0.5 rounded font-mono">
                      {user?.role || 'Safety Engineer'}
                    </span>
                  </div>
                </div>

                {/* Optional adjustment */}
                <Disclosure
                  title="Adjust classification or score (only if you disagree with the AI)"
                  summary={'Classification: ' + (calibratedLevel || 'not changed') + ' · Score: ' + (calibratedScore !== null ? calibratedScore + '%' : 'not changed')}
                  className="bg-surface-container"
                >
                {/* Classification & Score Adjusters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">
                      Calibrate Classification
                    </label>
                    <select
                      value={calibratedLevel || ''}
                      onChange={(e) => setCalibratedLevel((e.target.value as SifPotentialLevel) || null)}
                      className="bg-surface-container p-2 rounded text-on-surface font-body-sm text-body-sm focus:outline-none border border-surface-container-high/50 cursor-pointer"
                    >
                      <option value="">Select Classification (or Unclassified)</option>
                      <option value="CRITICAL">CRITICAL (Tier-1 SIF Precursor)</option>
                      <option value="HIGH">HIGH (High-pSIF Near Miss)</option>
                      <option value="MODERATE">MODERATE (Operational Variance)</option>
                      <option value="LOW">LOW (Minor Hazard Observation)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between font-label-code-sm text-label-code-sm">
                      <span className="text-outline uppercase font-semibold">
                        Calibrate SIF Probability
                      </span>
                      <span className="text-primary font-bold">
                        {calibratedScore !== null ? `${calibratedScore}%` : 'Not Calibrated'}
                      </span>
                    </div>
                    {/* `?? 0` below is ONLY the HTML range control's thumb position. The business value stays
                        null until the specialist moves the slider: the label above shows "Not Calibrated", and
                        handleReclassify sends adjustedSifScorePct only when calibratedScore !== null. */}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={calibratedScore ?? 0}
                      onChange={(e) => setCalibratedScore(Number(e.target.value))}
                      className="w-full accent-primary h-2 bg-surface-container rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                </Disclosure>

                {/* Specialist Notes */}
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">
                    Specialist Justification & Governance Log
                  </label>
                  <textarea
                    rows={3}
                    value={specialistNotes}
                    onChange={(e) => setSpecialistNotes(e.target.value)}
                    placeholder="Document your technical rationale for validation or reclassification (e.g. SWA exercised in time, valve mechanical integrity verified)..."
                    className="bg-surface-container p-space-md rounded text-on-surface font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-highest border border-surface-container-high/50 resize-none"
                  />
                </div>

                {/* Governance Decision Buttons: certify is the primary path; all four remain available */}
                <div className="flex flex-col gap-space-sm pt-space-xs">
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Certify if the AI classification is correct. Reclassify to record your adjustment. Escalate if the board must decide. Reject if the AI flag is wrong.
                  </p>
                  <div className="flex flex-wrap items-center gap-space-sm">
                    <button
                      onClick={handleApprove}
                      className="px-space-lg py-2 min-h-[44px] rounded bg-primary text-on-primary hover:bg-primary-container font-headline-sm text-headline-sm font-semibold transition-colors flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      <span>Certify AI classification</span>
                    </button>
                    <button
                      onClick={handleReclassify}
                      className="px-space-md py-2 min-h-[44px] rounded bg-surface-container-highest hover:bg-surface-bright text-on-surface font-headline-sm text-headline-sm font-semibold transition-colors flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit_note</span>
                      <span>Reclassify</span>
                    </button>
                    <button
                      onClick={handleEscalate}
                      className="px-space-md py-2 min-h-[44px] rounded bg-surface-container hover:bg-surface-container-highest text-error font-headline-sm text-headline-sm font-semibold transition-colors flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[18px]">gavel</span>
                      <span>Escalate to board</span>
                    </button>
                    <button
                      onClick={handleReject}
                      className="px-space-md py-2 min-h-[44px] rounded bg-surface-container hover:bg-surface-container-highest text-outline hover:text-error font-headline-sm text-headline-sm transition-colors flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[18px]">cancel</span>
                      <span>Reject AI flag</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
