import React, { useState, useEffect, useCallback } from 'react';
import { api, FacilityItem } from '../services/api';
import { Intervention } from '../types';
import { toneClasses } from '../components/ui/Severity';
import { Disclosure } from '../components/ui/Disclosure';

export const InterventionsPage: React.FC = () => {
  // Backend data state
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [facilitiesList, setFacilitiesList] = useState<FacilityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState<'all' | 'critical' | 'active' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  // New CAPA Form State - No fabricated operational defaults
  const [newTitle, setNewTitle] = useState('');
  const [newSite, setNewSite] = useState('');
  const [newPriority, setNewPriority] = useState<'Critical' | 'High' | 'Moderate' | 'Low'>('Moderate');
  const [newOwner, setNewOwner] = useState('');
  const [newVector, setNewVector] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // Real CSV export of the CAPA register, built from live interventions state
  const handleExportRegister = () => {
    if (interventions.length === 0) {
      showToast('No interventions to export.');
      return;
    }
    const header = ['Code', 'Title', 'Status', 'Priority', 'Target Facility', 'Owner', 'Due Date', 'Progress %'];
    const rows = interventions.map((i) => [
      i.code,
      i.title,
      i.status,
      i.priority || '',
      i.targetFacility || '',
      i.owner || '',
      i.dueDate || '',
      String(i.progressPct ?? '')
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', 'capa_register.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${interventions.length} CAPA records to CSV.`);
  };

  const loadInterventions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [interventionsData, facilitiesData] = await Promise.all([
        api.getInterventions(),
        api.getFacilities().catch(() => [])
      ]);
      setInterventions(interventionsData);
      setFacilitiesList(facilitiesData);
    } catch (err: any) {
      setError(err.message || 'Could not load interventions.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInterventions();
  }, [loadInterventions]);

  // Add new CAPA
  const handleCreateCapa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const created = await api.createIntervention({
        title: newTitle.trim(),
        description: newDesc.trim() || 'Targeted preventive engineering control dispatched via Precursor-X.',
        targetFacility: newSite || undefined,
        targetedVector: newVector.trim() || undefined,
        priority: newPriority,
        status: 'Proposed',
        owner: newOwner.trim() || undefined,
        dueDate: newDueDate || undefined,
        precursorPattern: undefined,
        lsrCode: undefined,
        lsrTitle: undefined,
        sifRiskPct: undefined,
        affectedSitesSummary: newSite ? `${newSite} (Operational Asset)` : undefined,
        observedRecurrence: undefined,
        protocolSteps: [],
        verificationMetric: undefined
      });

      setInterventions([created, ...interventions]);
      setShowNewModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewSite('');
      setNewOwner('');
      setNewVector('');
      setNewDueDate('');
      showToast(`Dispatched new CAPA to backend: ${created.code}`);
    } catch (err: any) {
      showToast(`Error creating CAPA: ${err.message}`);
    }
  };

  // Advance status
  const handleAdvanceStatus = async (id: string) => {
    const item = interventions.find((i) => i.id === id);
    if (!item) return;

    let newStatus = item.status;
    let newProgress = item.progressPct;
    let toast = '';

    if (item.status === 'Proposed') {
      newStatus = 'Approved';
      newProgress = 35;
      toast = `${item.code} moved to Approved`;
    } else if (item.status === 'Approved') {
      newStatus = 'In Progress';
      newProgress = 65;
      toast = `${item.code} moved to In Progress (65%)`;
    } else if (item.status === 'In Progress') {
      newStatus = 'Completed';
      newProgress = 100;
      toast = `${item.code} verified & completed by HSE Superintendent!`;
    } else {
      newStatus = 'In Progress';
      newProgress = 40;
      toast = `${item.code} reopened for continuous audit`;
    }

    try {
      const updated = await api.updateIntervention(id, {
        status: newStatus,
        progressPct: newProgress
      });
      setInterventions((prev) => prev.map((i) => (i.id === id ? updated : i)));
      showToast(toast);
    } catch (err: any) {
      showToast(`Error updating status: ${err.message}`);
    }
  };

  // Quick field verify
  const handleQuickVerify = async (id: string) => {
    try {
      const updated = await api.updateIntervention(id, {
        status: 'Completed',
        progressPct: 100
      });
      setInterventions((prev) => prev.map((i) => (i.id === id ? updated : i)));
      showToast('Field verification confirmed: barrier fully restored');
    } catch (err: any) {
      showToast(`Error verifying barrier: ${err.message}`);
    }
  };

  // Filtered interventions
  const filteredInterventions = interventions.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.targetFacility ? item.targetFacility.toLowerCase().includes(searchQuery.toLowerCase()) : false);

    if (!matchesSearch) return false;

    if (activeTab === 'critical') return item.priority === 'Critical';
    if (activeTab === 'active') return item.status === 'In Progress' || item.status === 'Approved';
    if (activeTab === 'completed') return item.status === 'Completed';
    return true;
  });

  const pendingItems = filteredInterventions.filter((i) => i.status === 'Proposed' || i.status === 'Under Review');
  const inProgressItems = filteredInterventions.filter((i) => i.status === 'Approved' || i.status === 'In Progress');
  const completedItems = filteredInterventions.filter((i) => i.status === 'Completed');

  const renderCard = (item: Intervention) => (
          <div
            key={item.id}
            className="p-space-lg rounded-xl bg-surface-container-low shadow-md flex flex-col justify-between gap-space-md border border-surface-container-high/40 hover:bg-surface-container transition-all"
          >
            {/* Top Card Info */}
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center justify-between gap-space-sm flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-label-code-md text-label-code-md text-primary font-bold">
                    {item.code}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-label-code-sm text-label-code-sm font-bold ${
                      item.priority === 'Critical'
                        ? 'bg-error-container text-on-error-container'
                        : item.priority === 'High'
                        ? 'bg-amber-950/60 text-amber-300'
                        : 'bg-surface-container text-on-surface'
                    }`}
                  >
                    {item.priority ? item.priority.toUpperCase() : 'UNSPECIFIED'}
                  </span>
                </div>

                <span
                  className={`px-2 py-0.5 rounded-full font-label-code-sm text-label-code-sm font-semibold ${
                    item.status === 'Completed'
                      ? 'bg-emerald-950/80 text-emerald-300'
                      : item.status === 'Approved'
                      ? 'bg-primary-container text-on-primary-container'
                      : item.status === 'In Progress'
                      ? 'bg-primary-container text-on-primary-container'
                      : 'bg-amber-950/60 text-amber-300'
                  }`}
                >
                  {item.status}
                </span>
              </div>

              <h3 className="font-headline-md text-headline-md text-on-surface font-semibold mt-1">
                {item.title}
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                {item.description}
              </p>
            </div>

            {/* Targeted Barrier & Assignment Strip */}
            <div className="flex flex-col gap-2 p-space-md rounded-lg bg-surface-container-lowest border border-surface-container-high/30">
              <div className="flex flex-col gap-0.5 text-label-code-sm font-label-code-sm">
                <span className="text-outline uppercase">Hazard targeted</span>
                <span className="text-primary font-semibold break-words">
                  {item.targetedVector || 'Not specified'}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 text-label-code-sm font-label-code-sm">
                <span className="text-outline uppercase">Facility</span>
                <span className="text-on-surface font-medium break-words">
                  {item.targetFacility || 'No facility selected'}
                </span>
              </div>
              <div className="flex items-center justify-between text-label-code-sm font-label-code-sm">
                <span className="text-outline uppercase">Owner</span>
                <span className="text-on-surface font-medium">
                  {item.owner || 'Unassigned'}{item.ownerRole ? ` (${item.ownerRole})` : ''}
                </span>
              </div>

              {/* Progress bar */}
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex items-center justify-between text-label-code-sm font-label-code-sm">
                  <span className="text-outline">Progress</span>
                  <span className="text-on-surface font-bold">
                    {item.progressPct != null ? `${item.progressPct}%` : 'Not recorded'}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      item.progressPct === 100
                        ? 'bg-emerald-400'
                        : item.priority === 'Critical'
                        ? 'bg-error'
                        : 'bg-primary'
                    }`}
                    style={{ width: `${item.progressPct != null ? Math.max(0, Math.min(100, item.progressPct)) : 0}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Card Actions */}
            <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs border-t border-surface-container-high/40">
              <div className="flex items-center gap-1 font-label-code-sm text-label-code-sm text-outline">
                <span className="material-symbols-outlined text-[16px]">schedule</span>
                <span>Due: {item.dueDate || 'Not recorded'}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleAdvanceStatus(item.id)}
                  className="px-space-md py-1.5 rounded bg-primary-container hover:bg-primary text-on-primary-container font-semibold font-label-code-sm text-label-code-sm transition-colors border border-surface-container-high/40 font-semibold"
                >
                  {item.status === 'Proposed'
                    ? 'Approve'
                    : item.status === 'Approved' || item.status === 'Under Review'
                    ? 'Start action'
                    : item.status === 'In Progress'
                    ? 'Verify and complete'
                    : 'Re-open action'}
                </button>

                {item.status !== 'Completed' && (
                  <button
                    onClick={() => handleQuickVerify(item.id)}
                    className="px-space-md py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-label-code-sm text-label-code-sm transition-colors font-semibold"
                  >
                    Quick Verify
                  </button>
                )}
              </div>
            </div>
          </div>
  );

  return (
    <div className="flex flex-col w-full gap-space-xl">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-surface-container-highest border border-primary/40 text-on-surface px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 font-label-code-sm text-label-code-sm">
          <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header & Sub-Bar */}
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
              Interventions
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-0.5">
              What actions are pending, active, or completed?
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-space-sm">
            <button
              onClick={handleExportRegister}
              className="px-space-md py-1.5 rounded bg-surface-container-high text-on-surface hover:bg-surface-bright font-headline-sm text-headline-sm flex items-center gap-space-xs transition-colors border border-surface-container-high/40"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              <span>Export register</span>
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="px-space-md py-1.5 rounded bg-primary text-on-primary font-headline-sm text-headline-sm flex items-center gap-space-xs hover:bg-primary-container transition-colors shadow-md font-semibold"
            >
              <span className="material-symbols-outlined text-[18px]">add_task</span>
              <span>Dispatch new CAPA</span>
            </button>
          </div>
        </div>

        {/* Filter Tabs & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md bg-surface-container-low p-space-sm rounded-lg border border-surface-container-high/40">
          <div className="flex flex-wrap items-center gap-1">
            {[
              { key: 'all', label: `All (${interventions.length})` },
              { key: 'critical', label: 'Critical' },
              { key: 'active', label: 'Active' },
              { key: 'completed', label: 'Completed' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-3 py-1.5 rounded font-label-code-sm text-label-code-sm transition-all ${
                  activeTab === tab.key
                    ? 'bg-primary-container text-on-primary-container font-semibold'
                    : 'text-outline hover:text-on-surface'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-auto sm:min-w-[220px]">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[16px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter actions or lead..."
              className="bg-surface-container pl-8 pr-3 py-1 rounded text-on-surface font-label-code-sm text-label-code-sm focus:outline-none w-full border border-surface-container-high/30"
            />
          </div>
        </div>
      </section>

      {/* Backend Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-error-container/30 border border-error/50 flex items-center justify-between gap-3 text-on-surface">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error text-[20px]">error</span>
            <span className="font-body-md text-body-md text-error">{error}</span>
          </div>
          <button
            onClick={loadInterventions}
            className="px-3 py-1 rounded bg-error text-on-error font-label-code-sm text-label-code-sm flex items-center gap-1 hover:bg-error/90 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Status summary: pending, active, completed, critical and still open */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-space-md">
        {(() => {
          const pending = interventions.filter((i) => i.status === 'Proposed' || i.status === 'Under Review').length;
          const activeList = interventions.filter((i) => i.status === 'Approved' || i.status === 'In Progress');
          const completed = interventions.filter((i) => i.status === 'Completed').length;
          const criticalOpen = interventions.filter((i) => i.priority === 'Critical' && i.status !== 'Completed').length;
          const withProgress = activeList.filter((i) => i.progressPct !== null && i.progressPct !== undefined);
          const avgProgress =
            withProgress.length > 0
              ? Math.round(withProgress.reduce((sum, i) => sum + (i.progressPct as number), 0) / withProgress.length)
              : null;
          const cards = [
            { label: 'Pending', value: pending, detail: 'Waiting for review or approval', tone: pending > 0 ? 'warning' : 'neutral' },
            { label: 'Active', value: activeList.length, detail: avgProgress != null ? `Average progress ${avgProgress}%` : 'Approved or in progress', tone: 'neutral' },
            { label: 'Completed', value: completed, detail: `${completed} of ${interventions.length} actions`, tone: completed > 0 ? 'good' : 'neutral' },
            { label: 'Critical and still open', value: criticalOpen, detail: 'Critical priority, not yet completed', tone: 'critical' },
          ] as const;
          return cards.map((c) => (
            <div
              key={c.label}
              className={`flex flex-col p-space-lg rounded-xl bg-surface-container-low border min-w-0 ${
                c.tone === 'neutral' ? 'border-surface-container-high/40' : toneClasses[c.tone].border
              }`}
            >
              <span className="font-body-sm text-body-sm text-on-surface-variant">{c.label}</span>
              <span className={`font-headline-lg text-headline-lg font-bold tracking-tight mt-1 ${c.tone === 'neutral' ? 'text-on-surface' : toneClasses[c.tone].text}`}>
                {c.value}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant mt-1 break-words">{c.detail}</span>
            </div>
          ));
        })()}
      </section>

      {/* CAPA Register Cards */}
      {filteredInterventions.length === 0 ? (
        <div className="bg-surface-container-low p-space-2xl rounded-xl border border-surface-container-high/40 text-center flex flex-col items-center justify-center gap-space-sm">
          <span className="material-symbols-outlined text-outline text-[48px]">assignment_late</span>
          <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">
            No interventions match your active filter
          </h3>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
            Adjust your search terms or switch tabs to view all operational CAPA protocols.
          </p>
          <button
            onClick={() => {
              setActiveTab('all');
              setSearchQuery('');
            }}
            className="mt-space-sm px-space-md py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-code-sm text-label-code-sm transition-colors border border-surface-container-high/40"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-space-xl">
          {pendingItems.length > 0 && (
            <section aria-label="Pending approval" className="flex flex-col gap-space-md">
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface font-semibold">Needs approval ({pendingItems.length})</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Proposed actions waiting for a decision to proceed.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">{pendingItems.map(renderCard)}</div>
            </section>
          )}
          {inProgressItems.length > 0 && (
            <section aria-label="Active actions" className="flex flex-col gap-space-md">
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface font-semibold">In progress ({inProgressItems.length})</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Approved or underway. Complete and verify each when the work is done.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">{inProgressItems.map(renderCard)}</div>
            </section>
          )}
          {completedItems.length > 0 && (
            <Disclosure
              title={'Completed (' + completedItems.length + ')'}
              summary="Verified and closed actions"
              defaultOpen={activeTab === 'completed'}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">{completedItems.map(renderCard)}</div>
            </Disclosure>
          )}
        </div>
      )}

      {/* New CAPA Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-low border border-surface-container-high/60 rounded-xl p-space-xl max-w-lg w-full shadow-2xl flex flex-col gap-space-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-space-xs border-b border-surface-container-high/40">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">add_task</span>
                <h3 className="font-headline-md text-headline-md text-on-surface font-bold">
                  Dispatch Preventive CAPA
                </h3>
              </div>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-outline hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateCapa} className="flex flex-col gap-space-md">
              <div className="flex flex-col gap-1">
                <label className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">
                  Action Title / Mitigation Target
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Dual-Custodian Digital Interlock for Night Turnaround"
                  className="bg-surface-container p-2.5 rounded text-on-surface font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-high border border-surface-container-high/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-space-sm">
                <div className="flex flex-col gap-1">
                  <label className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">
                    Target Facility
                  </label>
                  <select
                    value={newSite}
                    onChange={(e) => setNewSite(e.target.value)}
                    className="bg-surface-container p-2 rounded text-on-surface font-body-sm text-body-sm focus:outline-none border border-surface-container-high/40 cursor-pointer"
                  >
                    <option value="">No facility selected</option>
                    {facilitiesList.map((fac) => (
                      <option key={fac.id} value={fac.name}>
                        {fac.name} ({fac.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">
                    Priority Tier
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="bg-surface-container p-2 rounded text-on-surface font-body-sm text-body-sm focus:outline-none border border-surface-container-high/40 cursor-pointer"
                  >
                    <option value="Critical">Critical SIF</option>
                    <option value="High">High Risk</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-space-sm">
                <div className="flex flex-col gap-1">
                  <label className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">
                    Assigned Superintendent / Owner
                  </label>
                  <input
                    type="text"
                    required
                    value={newOwner}
                    onChange={(e) => setNewOwner(e.target.value)}
                    placeholder="Enter assigned owner name..."
                    className="bg-surface-container p-2 rounded text-on-surface font-body-sm text-body-sm focus:outline-none border border-surface-container-high/40"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">
                    Target Due Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="bg-surface-container p-2 rounded text-on-surface font-body-sm text-body-sm focus:outline-none border border-surface-container-high/40"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">
                  Targeted Threat Vector (Optional)
                </label>
                <input
                  type="text"
                  value={newVector}
                  onChange={(e) => setNewVector(e.target.value)}
                  placeholder="e.g. Atmospheric Gas Sniffing Interlock"
                  className="bg-surface-container p-2 rounded text-on-surface font-body-sm text-body-sm focus:outline-none border border-surface-container-high/40"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">
                  Preventive Instructions / Verification Criteria
                </label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Detail physical inspection steps, hardware interlocks, or testing calibrations required..."
                  className="bg-surface-container p-2.5 rounded text-on-surface font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-high border border-surface-container-high/40 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-space-xs">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-space-md py-2 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-code-sm text-label-code-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-space-lg py-2 rounded bg-primary text-on-primary hover:bg-primary-container font-headline-sm text-headline-sm font-semibold transition-colors shadow-md"
                >
                  Dispatch to Field
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
