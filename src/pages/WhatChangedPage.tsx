import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, WhatChangedResult } from '../services/api';
import { ChartXGuideLayer, TooltipCard, TooltipLabel, TooltipRow } from '../components/charts/ChartHoverLayer';
import { Disclosure } from '../components/ui/Disclosure';

export const WhatChangedPage: React.FC = () => {
  const navigate = useNavigate();

  // Period selectors
  const [baselinePeriod, setBaselinePeriod] = useState('30d_prev');
  const [activePeriod, setActivePeriod] = useState('7d_curr');
  const [differentialData, setDifferentialData] = useState<WhatChangedResult | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const computeDifferential = useCallback(async (base: string, act: string) => {
    setIsComputing(true);
    setError(null);
    try {
      const data = await api.getWhatChangedDifferential(base, act);
      setDifferentialData(data);
    } catch (err: any) {
      setError(err.message || 'Could not reach the safety intelligence service.');
    } finally {
      setIsComputing(false);
    }
  }, []);

  // Compute on mount and when selectors change
  useEffect(() => {
    computeDifferential(baselinePeriod, activePeriod);
  }, [baselinePeriod, activePeriod, computeDifferential]);

  const handleRunDifferential = async () => {
    setIsComputing(true);
    await computeDifferential(baselinePeriod, activePeriod);
    showToast(`Recomputed velocity differential for ${baselinePeriod} vs ${activePeriod}`);
  };

  const handleDeployCapa = async (item: WhatChangedResult['flaggedPrecursors'][0]) => {
    try {
      // Backend FastAPI will deterministically generate authoritative UUID and CAPA code
      await api.createIntervention({
        title: item.recommendedCapaTitle,
        description: `Targeted operational CAPA deployed from Velocity Differential monitor. Vector: ${item.recommendedCapaVector}. Location: ${item.asset}.`,
        targetFacility: item.asset,
        targetedVector: item.recommendedCapaVector,
        priority: item.recommendedPriority,
        status: 'Proposed',
        owner: '',
        ownerRole: null,
        dueDate: null,
        progressPct: 0
      });

      showToast(`Deployed CAPA for ${item.name} to Interventions Register`);
      setTimeout(() => {
        navigate('/interventions');
      }, 800);
    } catch {
      showToast('Error deploying CAPA');
    }
  };

  const data = differentialData;

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
            onClick={() => computeDifferential(baselinePeriod, activePeriod)}
            className="px-3 py-1 rounded bg-error text-on-error font-label-code-sm text-label-code-sm flex items-center gap-1 hover:bg-error/90 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Header & Interval Comparison Sub-Bar */}
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
              What Changed?
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-0.5">
              What has materially changed, and why?
            </p>
          </div>

          {/* Interval Pickers & Compute Action */}
          <div className="flex flex-wrap items-center gap-space-sm">
            <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-1.5 rounded border border-surface-container-high/40">
              <span className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold">
                Baseline:
              </span>
              <select
                aria-label="Baseline Period"
                value={baselinePeriod}
                onChange={(e) => setBaselinePeriod(e.target.value)}
                className="bg-transparent text-on-surface font-label-code-sm text-label-code-sm focus:outline-none cursor-pointer"
              >
                <option value="30d_prev" className="bg-surface-container">Previous 30 Days (Baseline)</option>
                <option value="90d_prev" className="bg-surface-container">Previous 90 Days</option>
                <option value="q2_2024" className="bg-surface-container">Q2 2024 Normal Operations</option>
              </select>
            </div>

            <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-1.5 rounded border border-surface-container-high/40">
              <span className="font-label-code-sm text-label-code-sm text-primary uppercase font-semibold">
                Active Window:
              </span>
              <select
                aria-label="Active Window"
                value={activePeriod}
                onChange={(e) => setActivePeriod(e.target.value)}
                className="bg-transparent text-on-surface font-label-code-sm text-label-code-sm focus:outline-none cursor-pointer"
              >
                <option value="7d_curr" className="bg-surface-container">Trailing 7 Days (Turnaround Active)</option>
                <option value="14d_curr" className="bg-surface-container">Trailing 14 Days</option>
                <option value="today" className="bg-surface-container">Current 24h Emergency Window</option>
              </select>
            </div>

            <button
              onClick={handleRunDifferential}
              disabled={isComputing}
              className="px-space-md py-1.5 rounded bg-primary-container text-on-primary-container font-headline-sm text-headline-sm flex items-center gap-space-xs hover:bg-primary transition-colors shadow-md font-semibold disabled:opacity-60 cursor-pointer"
            >
              <span className={`material-symbols-outlined text-[18px] ${isComputing ? 'animate-spin' : ''}`}>
                {isComputing ? 'sync' : 'difference'}
              </span>
              <span>{isComputing ? 'Calculating...' : 'Run Velocity Differential'}</span>
            </button>
          </div>
        </div>
      </section>

      {!data ? (
        <div className="p-12 text-center flex flex-col items-center justify-center gap-3 bg-surface-container-low rounded-xl border border-surface-container-high/40 min-h-[300px]">
          {isComputing ? (
            <>
              <span className="material-symbols-outlined animate-spin text-primary text-[36px]">progress_activity</span>
              <span className="font-label-code-sm text-label-code-sm text-outline">Comparing the two periods…</span>
            </>
          ) : error ? (
            <>
              <span className="material-symbols-outlined text-error text-[36px]">error</span>
              <span className="font-headline-sm text-headline-sm text-error">{error}</span>
              <button
                onClick={() => computeDifferential(baselinePeriod, activePeriod)}
                className="mt-2 px-3 py-1 rounded bg-error text-on-error font-label-code-sm text-label-code-sm flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">refresh</span>
                <span>Retry</span>
              </button>
            </>
          ) : (
            <span className="font-label-code-sm text-label-code-sm text-outline">No differential telemetry available.</span>
          )}
        </div>
      ) : (
        <>
          {/* Supporting measurements and the divergence curve */}
          <Disclosure
            title="Supporting measurements and curve"
            summary={'Precursor acceleration ' + data.precursorAcceleration + ' · barrier integrity ' + data.barrierIntegrityDrop + ' · ' + data.highEnergySpikes + ' high-energy release(s) in the active period'}
          >
            <div className="flex flex-col gap-space-lg">
              {/* Top Velocity Delta Cards */}
              <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
            <div className="flex flex-col p-space-lg rounded-xl bg-surface-container-low shadow-md relative overflow-hidden border border-surface-container-high/40 border-t-2 border-t-error">
              <div className="flex items-center justify-between">
                <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline font-semibold">
                  Precursor Acceleration
                </span>
                <span className="material-symbols-outlined text-error text-[20px]">speed</span>
              </div>
              <div className="flex items-baseline gap-space-xs mt-space-md">
                <span className="font-label-code-lg text-headline-xl text-error font-bold tracking-tight">
                  {data.precursorAcceleration}
                </span>
                <span className="font-label-code-sm text-label-code-sm text-error font-semibold">
                  vs baseline period
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface-variant mt-space-sm">
                {data.eventsInActive} events in active vs {data.eventsInBaseline} baseline avg
              </span>
            </div>

            <div className="flex flex-col p-space-lg rounded-xl bg-surface-container-low shadow-md relative overflow-hidden border border-surface-container-high/40 border-t-2 border-t-error">
              <div className="flex items-center justify-between">
                <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline font-semibold">
                  Barrier Integrity Drop
                </span>
                <span className="material-symbols-outlined text-error text-[20px]">trending_down</span>
              </div>
              <div className="flex items-baseline gap-space-xs mt-space-md">
                <span className="font-label-code-lg text-headline-xl text-error font-bold tracking-tight">
                  {data.barrierIntegrityDrop}
                </span>
                <span className="font-label-code-sm text-label-code-sm text-outline">
                  vs baseline period
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface-variant mt-space-sm">
                Fell from {data.baselineIntegrity != null ? `${data.baselineIntegrity}%` : 'N/A'} baseline to {data.currentIntegrity != null ? `${data.currentIntegrity}%` : 'N/A'} current
              </span>
            </div>

            <div className="flex flex-col p-space-lg rounded-xl bg-surface-container-low shadow-md relative overflow-hidden border border-surface-container-high/40 border-t-2 border-t-error">
              <div className="flex items-center justify-between">
                <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline font-semibold">
                  Emergent Failure Modes
                </span>
                <span className="material-symbols-outlined text-amber-400 text-[20px]">new_releases</span>
              </div>
              <div className="flex items-baseline gap-space-xs mt-space-md">
                <span className="font-label-code-lg text-headline-xl text-amber-300 font-bold tracking-tight">
                  {data.emergentFailureModes}
                </span>
                <span className="font-label-code-sm text-label-code-sm text-amber-300 font-semibold">
                  Newly Emerged
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface-variant mt-space-sm">
                Previously unseen triad combinations
              </span>
            </div>

            <div className="flex flex-col p-space-lg rounded-xl bg-surface-container-low shadow-md relative overflow-hidden border border-surface-container-high/40 border-t-2 border-t-secondary-container">
              <div className="flex items-center justify-between">
                <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline font-semibold">
                  High-Energy Spikes
                </span>
                <span className="material-symbols-outlined text-secondary text-[20px]">bolt</span>
              </div>
              <div className="flex items-baseline gap-space-xs mt-space-md">
                <span className="font-label-code-lg text-headline-xl text-secondary font-bold tracking-tight">
                  {data.highEnergySpikes > 0 ? `+${data.highEnergySpikes}` : data.highEnergySpikes}
                </span>
                <span className="font-label-code-sm text-label-code-sm text-outline">
                  Near Miss Incidents
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface-variant mt-space-sm">
                {data.highEnergySpikes > 0 ? 'High-consequence threshold exceedances observed' : 'Zero high-energy releases recorded'}
              </span>
            </div>
          </section>

          {/* Visual Shift Differential Radar & Shift Breakdown */}
          <section className="bg-surface-container-low p-space-xl rounded-xl shadow-md flex flex-col gap-space-lg border border-surface-container-high/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
              <div className="flex flex-col">
                <span className="font-label-code-sm text-label-code-sm text-primary uppercase font-semibold">
                  Baseline vs active period
                </span>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                  Velocity divergence curve
                </h2>
              </div>
              <div className="flex items-center gap-space-md font-label-code-sm text-label-code-sm">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-outline"></span> Baseline ({baselinePeriod.replace('_', ' ').toUpperCase()})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-1 bg-error"></span> Active ({activePeriod.replace('_', ' ').toUpperCase()} Surge)
                </span>
              </div>
            </div>

            {/* SVG Velocity Divergence Chart or Empty State */}
            {(!data.divergenceCurve?.baselinePath || !data.divergenceCurve?.activePath) ? (
              <div className="w-full bg-surface-container-lowest p-space-xl rounded-xl flex flex-col items-center justify-center min-h-[180px] border border-surface-container-high/30 text-center gap-2">
                <span className="material-symbols-outlined text-outline text-[32px]">query_stats</span>
                <span className="font-headline-sm text-headline-sm text-on-surface">No Divergence Telemetry Recorded</span>
                <span className="font-body-sm text-body-sm text-outline">
                  Insufficient precursor observation records for the selected periods.
                </span>
              </div>
            ) : (
              <div className="w-full bg-surface-container-lowest p-space-lg rounded-xl relative overflow-visible border border-surface-container-high/30">
                <ChartXGuideLayer
                  series={data.velocitySeries ?? []}
                  viewBoxWidth={700}
                  viewBoxHeight={160}
                  renderTooltip={(pt) => (
                    <TooltipCard>
                      <TooltipLabel>{pt.timestamp ?? 'N/A'}</TooltipLabel>
                      <TooltipRow label="Events" value={pt.events ?? 'N/A'} />
                      <TooltipRow label="Precursor Obs." value={pt.precursorObservations ?? 'N/A'} />
                    </TooltipCard>
                  )}
                >
                <svg className="w-full h-44" preserveAspectRatio="none" viewBox="0 0 700 160">
                  <line stroke="#31353e" strokeDasharray="3 3" strokeWidth="1" x1="0" x2="700" y1="40" y2="40" />
                  <line stroke="#31353e" strokeDasharray="3 3" strokeWidth="1" x1="0" x2="700" y1="80" y2="80" />
                  <line stroke="#31353e" strokeDasharray="3 3" strokeWidth="1" x1="0" x2="700" y1="120" y2="120" />

                  {/* Baseline Path */}
                  <path
                    d={data.divergenceCurve.baselinePath}
                    fill="none"
                    stroke="#8e9099"
                    strokeDasharray="4 4"
                    strokeWidth="2"
                  />

                  {/* Active Surge Path */}
                  <path
                    d={data.divergenceCurve.activePath}
                    fill="none"
                    stroke="#ffb4ab"
                    strokeLinecap="round"
                    strokeWidth="3.5"
                  />

                  {/* Acute Peak Point */}
                  <circle
                    cx={data.divergenceCurve.activePeakX}
                    cy={data.divergenceCurve.activePeakY}
                    r="7"
                    fill="#ffb4ab"
                    className="animate-ping opacity-75"
                  />
                  <circle
                    cx={data.divergenceCurve.activePeakX}
                    cy={data.divergenceCurve.activePeakY}
                    r="4.5"
                    fill="#93000a"
                    stroke="#ffb4ab"
                    strokeWidth="2"
                  />
                </svg>

                {/* Callout Marker */}
                <div
                  className="absolute top-4 bg-surface-container-high px-space-md py-1 rounded shadow-lg border border-error/40 flex items-center gap-space-xs pointer-events-none transition-all"
                  style={{ left: `${(data.divergenceCurve.activePeakX / 700) * 85}%` }}
                >
                  <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>
                  <span className="font-label-code-sm text-label-code-sm text-on-surface font-semibold">
                    {data.divergenceCurve.peakLabel}
                  </span>
                </div>
                </ChartXGuideLayer>

                {/* Time axis */}
                <div className="flex items-center justify-between text-label-code-sm text-label-code-sm text-outline pt-2 border-t border-surface-container-high/30 mt-2 font-mono">
                  {data.velocitySeries && data.velocitySeries.length > 0 ? (
                    <>
                      <span>{data.velocitySeries[0].timestamp}</span>
                      {data.velocitySeries.length > 2 && (
                        <span>{data.velocitySeries[Math.floor(data.velocitySeries.length / 2)].timestamp}</span>
                      )}
                      <span className="text-primary font-bold">{data.velocitySeries[data.velocitySeries.length - 1].timestamp}</span>
                    </>
                  ) : (
                    <>
                      <span>Baseline Window Start</span>
                      <span>Transition</span>
                      <span className="text-primary font-bold">Active Window End</span>
                    </>
                  )}
                </div>
              </div>
            )}

          </section>

            </div>
          </Disclosure>

          {/* Main answer: what changed and why */}
          <section className="bg-surface-container-low p-space-xl rounded-xl border border-error/40 flex flex-col gap-space-sm">
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {data.baselinePeriod} compared with {data.activePeriod}
            </span>
            <p className="font-headline-md text-headline-md text-on-surface font-semibold break-words">
              {data.keyShiftObservation || 'No material shift was identified between these periods.'}
            </p>
          </section>

      {/* The shifts themselves: the answer to "what changed" */}
      <section className="bg-surface-container-low p-space-xl rounded-xl shadow-md flex flex-col gap-space-md border border-surface-container-high/40">
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <div className="flex flex-col">
            <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
              Signals that increased
            </h2>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Ranked by acceleration, comparing {data.baselinePeriod} with {data.activePeriod}
            </span>
          </div>
          <span className="font-label-code-sm text-label-code-sm text-outline bg-surface-container px-space-sm py-1 rounded">
            {data.flaggedPrecursors.length} flagged
          </span>
        </div>

        {data.flaggedPrecursors.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            No precursor signals were flagged between these two periods.
          </p>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container text-outline font-label-code-sm text-label-code-sm">
                    <th className="py-space-sm px-space-md font-semibold">Precursor</th>
                    <th className="py-space-sm px-space-md font-semibold">Location</th>
                    <th className="py-space-sm px-space-md font-semibold text-center">Baseline rate</th>
                    <th className="py-space-sm px-space-md font-semibold text-center">Active rate</th>
                    <th className="py-space-sm px-space-md font-semibold text-center">Change</th>
                    <th className="py-space-sm px-space-md font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-high/50 font-body-sm text-body-sm">
                  {data.flaggedPrecursors.map((item) => (
                    <tr key={item.id} className="hover:bg-surface-container transition-colors">
                      <td className="py-space-md px-space-md">
                        <div className="flex flex-col min-w-0">
                          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold break-words">{item.name}</span>
                          <span className="font-label-code-sm text-label-code-sm text-error break-words">{item.lsr}</span>
                        </div>
                      </td>
                      <td className="py-space-md px-space-md text-on-surface-variant break-words">{item.asset}</td>
                      <td className="py-space-md px-space-md text-center text-outline">{item.baselineRate}</td>
                      <td className="py-space-md px-space-md text-center text-error font-bold">{item.activeRate}</td>
                      <td className="py-space-md px-space-md text-center">
                        <span className={`px-2 py-0.5 rounded font-label-code-md text-label-code-md font-bold ${item.badgeClass}`}>{item.delta}</span>
                      </td>
                      <td className="py-space-md px-space-md text-right">
                        <button
                          onClick={() => handleDeployCapa(item)}
                          className="px-space-sm py-1 rounded bg-primary-container text-on-primary-container font-label-code-sm text-label-code-sm font-semibold hover:bg-primary transition-colors inline-flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[14px]">send</span>
                          <span>Deploy CAPA</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="md:hidden flex flex-col divide-y divide-surface-container-high/50">
              {data.flaggedPrecursors.map((item) => (
                <li key={item.id} className="py-space-md flex flex-col gap-space-sm">
                  <div className="flex items-start justify-between gap-space-sm">
                    <div className="min-w-0">
                      <p className="font-headline-sm text-headline-sm text-on-surface font-semibold break-words">{item.name}</p>
                      <p className="font-label-code-sm text-label-code-sm text-on-surface-variant break-words">{item.lsr} · {item.asset}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded font-label-code-md text-label-code-md font-bold shrink-0 ${item.badgeClass}`}>{item.delta}</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Baseline {item.baselineRate} → active <span className="text-error font-bold">{item.activeRate}</span>
                  </p>
                  <button
                    onClick={() => handleDeployCapa(item)}
                    className="self-start px-space-md py-1.5 rounded bg-primary-container text-on-primary-container font-label-code-sm text-label-code-sm font-semibold hover:bg-primary transition-colors inline-flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">send</span>
                    <span>Deploy CAPA</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      </>
      )}
    </div>
  );
};
