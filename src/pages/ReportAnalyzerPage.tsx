import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { AIAnalysisResult } from '../services/aiService';
import { useAuth } from '../auth/AuthProvider';
import { Disclosure } from '../components/ui/Disclosure';

// Pre-defined scenarios matching the Stitch design
const SCENARIOS = {
  confined_space: {
    text: 'During vessel purge inspection, crew entered the confined space [TK-402] at 03:15 hrs without continuous gas telemetry. Isolation valve V-12 was tagged but not mechanically locked. Technician initiated Stop Work Authority (SWA) prior to oxygen depletion event.',
    unit: 'Hydrocracker Unit 4B',
    cat: 'HSE Class I (Process)'
  },
  loto_bypass: {
    text: 'Maintenance fitter was changing out mechanical seal on crude booster pump P-102. Tagged the main disconnect switchboard breaker B-4 but failed to apply padlock and hasp. Pressure bleed valve was cracked open while piping still held 45 PSI residual hydrocarbon head.',
    unit: 'Distillation Train 2',
    cat: 'Mechanical Isolation'
  },
  crane_rigging: {
    text: 'Mobile crane RT-80 was hoisting a 6.2-ton manifold section across pipe rack deck. Wind gusts exceeded 28 knots at boom tip. Secondary tag-line severed under tension and load swung within 1.2 meters of pressurized natural gas metering riser before rigger blew emergency air-horn.',
    unit: 'Offshore Platform Topside',
    cat: 'Heavy Lift & Logistics'
  }
};

export const ReportAnalyzerPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [activeScenario, setActiveScenario] = useState<'confined_space' | 'loto_bypass' | 'crane_rigging'>('confined_space');
  const [inputTab, setInputTab] = useState<'paste' | 'file' | 'stream'>('paste');
  const [narrativeText, setNarrativeText] = useState(SCENARIOS.confined_space.text);
  const [selectedUnit, setSelectedUnit] = useState(SCENARIOS.confined_space.unit);
  const [selectedCategory, setSelectedCategory] = useState(SCENARIOS.confined_space.cat);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [progressPhase, setProgressPhase] = useState('Tokenizing incident tokens...');

  // Current analysis output
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Active highlighted token / barrier
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [selectedBarrierNode, setSelectedBarrierNode] = useState<string>('barrier_prevention_1');

  // Human audit pill status
  const [auditStatus, setAuditStatus] = useState<'pending' | 'committed' | 'reclassified' | 'escalated'>('pending');

  // Toast HUD
  const [toast, setToast] = useState<{ show: boolean; title: string; desc: string }>({
    show: false,
    title: '',
    desc: ''
  });

  const triggerToast = (title: string, desc: string) => {
    setToast({ show: true, title, desc });
    setTimeout(() => {
      setToast({ show: false, title: '', desc: '' });
    }, 3200);
  };

  // If arriving from the Knowledge Graph with a specific node, load that node's real
  // name/description into the console instead of showing a generic default scenario.
  useEffect(() => {
    const nodeName = searchParams.get('node');
    const nodeDesc = searchParams.get('nodeDesc');
    if (nodeName) {
      setNarrativeText(
        nodeDesc
          ? `[Loaded from Knowledge Graph: ${nodeName}]\n\n${nodeDesc}`
          : `[Loaded from Knowledge Graph: ${nodeName}]\n\nPaste or describe the operational narrative related to this node to run precursor extraction.`
      );
      triggerToast('Loaded from Knowledge Graph', `Console pre-filled with context for "${nodeName}"`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run NLP analysis
  const executeAnalysis = async (customText?: string) => {
    const textToAnalyze = customText !== undefined ? customText : narrativeText;
    setIsAnalyzing(true);
    setAnalysisProgress(20);
    setProgressPhase('Tokenizing incident tokens & SIF taxonomy...');

    setTimeout(() => {
      setAnalysisProgress(65);
      setProgressPhase('Correlating CCPS barrier failure taxonomy...');
    }, 180);

    setTimeout(async () => {
      setAnalysisProgress(100);
      setProgressPhase('Precursor vector extracted. Updating models.');

      setAnalysisError(null);
      try {
        const result = await api.analyzeReport(textToAnalyze, {
          unit: selectedUnit,
          category: selectedCategory
        });
        setAnalysisResult(result);
        triggerToast('Analysis Complete', `Identified latent SIF precursors with ${result.confidencePct}% model confidence`);
      } catch (err: any) {
        const msg = err.message || 'Cannot reach the analysis service.';
        setAnalysisError(msg);
        triggerToast('AI Analysis Unavailable', msg);
      } finally {
        setIsAnalyzing(false);
      }
    }, 420);
  };

  // Scenario Loader
  const handleLoadScenario = (key: 'confined_space' | 'loto_bypass' | 'crane_rigging') => {
    setActiveScenario(key);
    const scen = SCENARIOS[key];
    setNarrativeText(scen.text);
    setSelectedUnit(scen.unit);
    setSelectedCategory(scen.cat);
    executeAnalysis(scen.text);
    triggerToast('Scenario Loaded', `Switched narrative to ${key.replace('_', ' ').toUpperCase()}`);
  };

  // File Upload Parser for TXT, CSV, LOG, JSON, MD
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'txt' || extension === 'log' || extension === 'json' || extension === 'md') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setNarrativeText(content);
        triggerToast('File Ingested', `Loaded ${extension.toUpperCase()}: ${file.name} (${content.length} characters)`);
      };
      reader.readAsText(file);
    } else if (extension === 'csv') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        const lines = content.split('\n').filter(Boolean);
        const parsed = lines.slice(0, 10).join('\n');
        setNarrativeText(parsed);
        triggerToast('CSV Ingested', `Parsed incident text from ${file.name}`);
      };
      reader.readAsText(file);
    } else {
      // Binary document - inform user clearly without inventing text
      triggerToast(
        'Format Not Supported',
        'Direct PDF/DOCX binary parsing requires external OCR/extraction. Please upload plain text (.txt, .log, .csv, .json, .md) or paste narrative directly.'
      );
    }
  };

  // Token click interaction
  const handleTokenClick = (tokenId: string, barrierKey: string) => {
    setActiveToken(tokenId);
    setSelectedBarrierNode(barrierKey);
    triggerToast('Barrier Highlighted', `Linked token to ${getBarrierDetail(barrierKey)?.title || barrierKey}`);
  };

  // Human governance decision commit (saved by the backend)
  const handleCommit = async (decision: 'committed' | 'reclassified' | 'escalated') => {
    if (!analysisResult) {
      triggerToast('No Analysis', 'Please execute an AI analysis before committing governance decisions.');
      return;
    }

    try {
      const res = await api.commitReportGovernance({
        report_id: analysisResult.report_id,
        review_id: analysisResult.review_id,
        decision: decision.toUpperCase() as any,
        notes: `Governance action executed from Report Analyzer console.`
      });
      setAuditStatus(decision);
      triggerToast('Decision Persisted', res.message);
    } catch (err: any) {
      triggerToast('Persistence Failed', err.message || 'Could not persist decision to backend.');
    }
  };

  // Get active barrier detail dynamically strictly from analysis result without fabrication
  const getBarrierDetail = (key: string) => {
    if (analysisResult) {
      if (key === 'barrier_prevention_1' || key === 'barrier_gas') {
        const b = analysisResult.barrierFailures?.[0];
        if (b) {
          return {
            title: b.name,
            badge: `${b.status} BARRIER`,
            badgeClass: b.status === 'FAILED' || b.status === 'BYPASSED' ? 'bg-rose-950 text-rose-300' : 'bg-emerald-950 text-emerald-300',
            icon: 'shield_locked',
            text: b.description || 'Pre-event operational barrier record.'
          };
        }
        return {
          title: 'Not identified',
          badge: 'NOT RECORDED',
          badgeClass: 'bg-surface-container text-outline',
          icon: 'shield',
          text: 'No primary prevention barrier identified in current AI analysis.'
        };
      }
      if (key === 'barrier_prevention_2' || key === 'barrier_loto') {
        const b = analysisResult.barrierFailures?.[1];
        if (b) {
          return {
            title: b.name,
            badge: `${b.status} BARRIER`,
            badgeClass: b.status === 'FAILED' || b.status === 'BYPASSED' ? 'bg-rose-950 text-rose-300' : 'bg-emerald-950 text-emerald-300',
            icon: 'lock_open',
            text: b.description || 'Secondary operational defense boundary.'
          };
        }
        return {
          title: 'Not identified',
          badge: 'NOT RECORDED',
          badgeClass: 'bg-surface-container text-outline',
          icon: 'shield',
          text: 'No secondary prevention barrier identified in current AI analysis.'
        };
      }
      if (key === 'barrier_mitigation_1' || key === 'barrier_swa') {
        const m = analysisResult.mitigatingControls?.[0];
        if (m) {
          return {
            title: m.name,
            badge: `${m.status} MITIGATION`,
            badgeClass: m.status === 'EFFECTIVE' ? 'bg-emerald-950 text-emerald-300' : 'bg-surface-bright text-on-surface',
            icon: 'front_hand',
            text: m.description || 'Mitigating action arrested exposure sequence.'
          };
        }
        return {
          title: 'Not identified',
          badge: 'NOT RECORDED',
          badgeClass: 'bg-surface-container text-outline',
          icon: 'front_hand',
          text: 'No primary mitigation control identified in current AI analysis.'
        };
      }
      if (key === 'barrier_mitigation_2' || key === 'barrier_rescue') {
        const m = analysisResult.mitigatingControls?.[1];
        if (m) {
          return {
            title: m.name,
            badge: `${m.status} MITIGATION`,
            badgeClass: m.status === 'EFFECTIVE' ? 'bg-emerald-950 text-emerald-300' : 'bg-surface-bright text-on-surface',
            icon: 'emergency',
            text: m.description || 'Secondary mitigation control posture.'
          };
        }
        return {
          title: 'Not identified',
          badge: 'NOT RECORDED',
          badgeClass: 'bg-surface-container text-outline',
          icon: 'emergency',
          text: 'No secondary mitigation control identified in current AI analysis.'
        };
      }
      if (key === 'top_event') {
        return {
          title: `Top Event: ${analysisResult.title || 'Not Recorded'}`,
          badge: 'CENTRAL KNOT',
          badgeClass: 'bg-rose-950 text-rose-300',
          icon: 'crisis_alert',
          text: analysisResult.explanation || 'No narrative explanation available.'
        };
      }
      if (key === 'threat_1' || key === 'threat_h2s') {
        const h = analysisResult.hazards?.[0];
        return {
          title: h?.name ? `Root Threat: ${h.name}` : 'Root Threat: Not identified',
          badge: h ? 'PRIMARY THREAT VECTOR' : 'NOT RECORDED',
          badgeClass: 'bg-amber-950 text-amber-300',
          icon: 'warning',
          text: h?.threshold ? `Threshold parameter: ${h.threshold}` : 'No threshold parameter recorded.'
        };
      }
      if (key === 'threat_2' || key === 'threat_energy') {
        const h = analysisResult.hazards?.[1];
        return {
          title: h?.name ? `Root Threat: ${h.name}` : 'Root Threat: Not identified',
          badge: h ? 'SECONDARY THREAT VECTOR' : 'NOT RECORDED',
          badgeClass: 'bg-amber-950 text-amber-300',
          icon: 'fluid',
          text: h?.threshold ? `Threshold parameter: ${h.threshold}` : 'No threshold parameter recorded.'
        };
      }
      if (key === 'outcome_controlled') {
        const c = analysisResult.consequences?.[1];
        return {
          title: c?.title ? `Mitigated Outcome: ${c.title}` : 'Mitigated Outcome: Not identified',
          badge: c ? 'CONTROLLED TERMINATION' : 'NOT RECORDED',
          badgeClass: 'bg-emerald-950 text-emerald-300',
          icon: 'task_alt',
          text: c?.regulatoryTier ? `Operational tier: ${c.regulatoryTier}` : 'No regulatory tier data recorded.'
        };
      }
      if (key === 'outcome_fatal') {
        const c = analysisResult.consequences?.[0];
        return {
          title: c?.title ? `Credible Consequence: ${c.title}` : 'Credible Consequence: Not identified',
          badge: c ? 'CONSEQUENCE VECTOR' : 'NOT RECORDED',
          badgeClass: 'bg-rose-950 text-rose-300',
          icon: 'dangerous',
          text: c?.severity ? `Regulatory severity: ${c.severity} (${c?.regulatoryTier || 'Tier Not Recorded'})` : 'No severity data recorded.'
        };
      }
    }
    return {
      title: 'Not Available',
      badge: 'NO DATA',
      badgeClass: 'bg-surface-container text-outline',
      icon: 'info',
      text: 'Awaiting AI analysis to extract barrier intelligence telemetry from incident narrative.'
    };
  };

  const activeBarrierDetail = getBarrierDetail(selectedBarrierNode);

  // Severity styling follows the AI's SIF potential level: red for CRITICAL, HIGH and MODERATE (as in the original design).
  const ORD = ['', 'order-1 xl:order-none', 'order-2 xl:order-none', 'order-3 xl:order-none', 'order-4 xl:order-none', 'order-5 xl:order-none', 'order-6 xl:order-none', 'order-7 xl:order-none', 'order-8 xl:order-none'];
  const ORD_ACTIVE = analysisResult ? ORD : ['', '', '', '', '', '', '', '', ''];
  const sifLevel = analysisResult?.sifPotential;
  const sifLevelLabel = sifLevel ? sifLevel.charAt(0) + sifLevel.slice(1).toLowerCase() : '';
  const sifTone =
    sifLevel === 'CRITICAL' || sifLevel === 'HIGH' || sifLevel === 'MODERATE'
      ? { ring: 'text-rose-500', text: 'text-error', dot: 'bg-error', border: 'border-error/40' }
      : { ring: 'text-primary-container', text: 'text-primary', dot: 'bg-primary-container', border: 'border-surface-container-high/40' };
  const failedBarriers = (analysisResult?.barrierFailures || []).filter((b) => b.status === 'FAILED' || b.status === 'BYPASSED');
  const topPrecursors = [...(analysisResult?.precursors || [])].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 3);
  const failedBarrierCount = (analysisResult?.barrierFailures || []).filter((b) => b.status === 'FAILED' || b.status === 'BYPASSED').length;
  const impairedBarrierCount = (analysisResult?.barrierFailures || []).filter((b) => b.status !== 'EFFECTIVE').length;

  return (
    <div className="flex flex-col w-full">
      {/* Toast Feedback HUD */}
      <div
        className={`fixed bottom-6 right-3 sm:right-6 max-w-[calc(100vw-1.5rem)] z-50 transition-all duration-300 pointer-events-none flex items-center gap-space-sm px-space-lg py-space-md rounded-xl bg-surface-container-highest shadow-xl text-on-surface border border-surface-container-high ${
          toast.show ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0'
        }`}
      >
        <span className="material-symbols-outlined text-primary text-[20px]">verified</span>
        <div className="flex flex-col">
          <span className="font-headline-sm text-headline-sm text-on-surface">{toast.title}</span>
          <span className="font-label-code-sm text-label-code-sm text-on-surface-variant">
            {toast.desc}
          </span>
        </div>
      </div>

      {/* Page header: purpose first */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md mb-space-xl">
        <div className="flex flex-col min-w-0">
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">Report Analyzer</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            What risks and precursors exist in this report?
          </p>
        </div>

        <div className="flex items-center gap-space-sm flex-wrap">
          <div
            className={`flex items-center gap-space-xs px-space-md py-1.5 rounded-lg border ${
              auditStatus === 'committed'
                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                : auditStatus === 'reclassified'
                ? 'bg-amber-950/70 border-amber-500/40 text-amber-300'
                : auditStatus === 'escalated'
                ? 'bg-rose-950/70 border-rose-500/40 text-rose-300'
                : 'bg-surface-container-high text-on-surface-variant border-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {auditStatus === 'committed' ? 'check_circle' : auditStatus === 'escalated' ? 'gavel' : 'pending_actions'}
            </span>
            <span className="font-label-code-md text-label-code-md font-semibold">
              {auditStatus === 'committed'
                ? 'Verified and committed'
                : auditStatus === 'reclassified'
                ? 'Score adjusted by reviewer'
                : auditStatus === 'escalated'
                ? 'Sent to human review'
                : 'Awaiting human decision'}
            </span>
          </div>

          <button
            onClick={() => {
              setNarrativeText('');
              setAuditStatus('pending');
              triggerToast('Session Reset', 'Console cleared for new narrative input');
            }}
            className="px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface text-body-sm font-body-sm transition-colors flex items-center gap-space-xs border border-surface-container-high/40"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* AI Unavailable / Error Alert Banner */}
      {analysisError && (
        <div role="alert" className="mb-space-lg p-space-md rounded-xl bg-error/15 border border-error/40 text-error flex flex-wrap items-center justify-between gap-space-sm animate-fade-in">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-[22px]">cloud_off</span>
            <div className="flex flex-col">
              <span className="font-headline-sm text-sm font-semibold">Analysis unavailable</span>
              <span className="font-body-sm text-xs opacity-90">{analysisError}</span>
            </div>
          </div>
          <button
            onClick={() => executeAnalysis()}
            className="px-space-md py-1 rounded bg-error text-on-error font-label-code-sm text-xs font-semibold hover:bg-error/90 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            <span>Retry Analysis</span>
          </button>
        </div>
      )}

      {/* Main Split Console Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg">
        {/* Left 5 Cols: Input Ingestion Console */}
        <div className="contents xl:flex xl:flex-col xl:col-span-5 xl:gap-space-lg">
          {/* Ingestion Card */}
          <div className={`${ORD_ACTIVE[8]} bg-surface-container-low rounded-xl p-space-lg shadow-md flex flex-col gap-space-md border border-surface-container-high/40`}>
            {/* Preset Archetypes */}
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center justify-between">
                <span className="font-label-code-sm text-label-code-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                  Example reports
                </span>
                
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-xs">
                <button
                  onClick={() => handleLoadScenario('confined_space')}
                  className={`px-space-sm py-2 rounded-lg text-left transition-all group flex flex-col border ${
                    activeScenario === 'confined_space'
                      ? 'bg-surface-container-high border-primary/40'
                      : 'bg-surface-container border-transparent hover:bg-surface-container-high'
                  }`}
                >
                  <span
                    className={`font-label-code-sm text-label-code-sm font-semibold break-words ${
                      activeScenario === 'confined_space' ? 'text-primary' : 'text-outline'
                    }`}
                  >
                    Confined Space
                  </span>
                  <span className="font-label-code-sm text-[11px] text-on-surface-variant break-words">
                    Gas test omission
                  </span>
                </button>

                <button
                  onClick={() => handleLoadScenario('loto_bypass')}
                  className={`px-space-sm py-2 rounded-lg text-left transition-all group flex flex-col border ${
                    activeScenario === 'loto_bypass'
                      ? 'bg-surface-container-high border-primary/40'
                      : 'bg-surface-container border-transparent hover:bg-surface-container-high'
                  }`}
                >
                  <span
                    className={`font-label-code-sm text-label-code-sm font-semibold break-words ${
                      activeScenario === 'loto_bypass' ? 'text-primary' : 'text-outline'
                    }`}
                  >
                    LOTO Bypass
                  </span>
                  <span className="font-label-code-sm text-[11px] text-on-surface-variant break-words">
                    Valve tagged not locked
                  </span>
                </button>

                <button
                  onClick={() => handleLoadScenario('crane_rigging')}
                  className={`px-space-sm py-2 rounded-lg text-left transition-all group flex flex-col border ${
                    activeScenario === 'crane_rigging'
                      ? 'bg-surface-container-high border-primary/40'
                      : 'bg-surface-container border-transparent hover:bg-surface-container-high'
                  }`}
                >
                  <span
                    className={`font-label-code-sm text-label-code-sm font-semibold break-words ${
                      activeScenario === 'crane_rigging' ? 'text-primary' : 'text-outline'
                    }`}
                  >
                    Crane Rig Shift
                  </span>
                  <span className="font-label-code-sm text-[11px] text-on-surface-variant break-words">
                    Tag line parted / sway
                  </span>
                </button>
              </div>
            </div>

            {/* Mode Tabs */}
            <div className="flex items-center p-0.5 rounded-lg bg-surface-container-lowest border border-surface-container-high/40">
              <button
                onClick={() => setInputTab('paste')}
                className={`flex-1 py-1.5 rounded text-center font-label-code-sm text-label-code-sm font-semibold transition-all ${
                  inputTab === 'paste'
                    ? 'bg-surface-container-high text-on-surface shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Quick Paste
              </button>
              <button
                onClick={() => {
                  setInputTab('file');
                  fileInputRef.current?.click();
                }}
                className={`flex-1 py-1.5 rounded text-center font-label-code-sm text-label-code-sm font-semibold transition-all ${
                  inputTab === 'file'
                    ? 'bg-surface-container-high text-on-surface shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Upload Audit File
              </button>
              <button
                onClick={() => {
                  setInputTab('stream');
                  triggerToast('Telemetry Stream', 'Subscribed to MQTT live broker: hse/permian/telemetry');
                }}
                className={`flex-1 py-1.5 rounded text-center font-label-code-sm text-label-code-sm font-semibold transition-all ${
                  inputTab === 'stream'
                    ? 'bg-surface-container-high text-on-surface shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Telemetry Stream
              </button>
            </div>

            {/* Hidden real file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv,.log,.json,.md"
              className="hidden"
              onChange={handleFileUpload}
            />

            {/* Narrative Input Box */}
            <div className="relative flex flex-col">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-label-code-sm text-label-code-sm text-outline uppercase tracking-wider">
                  Unstructured Shift Log / Incident Report
                </span>
                <span className="font-label-code-sm text-label-code-sm text-outline">
                  {narrativeText.length} chars
                </span>
              </div>
              <textarea
                className="w-full bg-surface-container-lowest p-space-md rounded-lg text-on-surface font-body-sm text-body-sm leading-relaxed focus:outline-none focus:bg-surface-container-highest transition-colors resize-none shadow-inner border border-surface-container-high/40"
                placeholder="Paste near-miss observation, safety audit, or shift handover log..."
                rows={7}
                value={narrativeText}
                onChange={(e) => setNarrativeText(e.target.value)}
              />
            </div>

            {/* Contextual Meta Selectors */}
            <div className="grid grid-cols-2 gap-space-sm pt-space-xs">
              <div className="flex flex-col gap-1">
                <span className="font-label-code-sm text-label-code-sm text-outline uppercase tracking-wider">
                  Operating Unit
                </span>
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="px-space-md py-1.5 rounded-lg bg-surface-container text-on-surface font-body-sm text-body-sm shadow-sm focus:outline-none border border-surface-container-high/40"
                >
                  <option value="Hydrocracker Unit 4B">Hydrocracker Unit 4B</option>
                  <option value="Distillation Train 2">Distillation Train 2</option>
                  <option value="Offshore Platform Topside">Offshore Platform Topside</option>
                  <option value="Desander Vessel TK-402">Desander Vessel TK-402</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="font-label-code-sm text-label-code-sm text-outline uppercase tracking-wider">
                  Risk Matrix Category
                </span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-space-md py-1.5 rounded-lg bg-surface-container text-on-surface font-body-sm text-body-sm shadow-sm focus:outline-none border border-surface-container-high/40"
                >
                  <option value="HSE Class I (Process)">HSE Class I (Process)</option>
                  <option value="Mechanical Isolation">Mechanical Isolation</option>
                  <option value="Heavy Lift & Logistics">Heavy Lift & Logistics</option>
                  <option value="Fall Protection Vector">Fall Protection Vector</option>
                </select>
              </div>
            </div>

            {/* Run Engine CTA */}
            <div className="pt-space-xs flex items-center gap-space-sm">
              <button
                disabled={isAnalyzing || !narrativeText.trim()}
                onClick={() => executeAnalysis()}
                className="flex-1 py-2.5 px-space-lg rounded-lg bg-primary-container text-on-primary-container font-headline-sm text-headline-sm font-semibold hover:bg-primary transition-all flex items-center justify-center gap-space-sm shadow-lg shadow-primary-container/20 active:scale-[0.99] disabled:opacity-50"
              >
                <span
                  className={`material-symbols-outlined text-[18px] ${
                    isAnalyzing ? 'animate-spin' : ''
                  }`}
                >
                  psychology
                </span>
                <span>
                  {isAnalyzing ? 'Parsing Latent Precursors...' : 'Execute Precursor Analysis'}
                </span>
              </button>

              <button
                onClick={() => setNarrativeText('')}
                className="p-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors shadow-sm border border-surface-container-high/40"
                title="Clear text"
              >
                <span className="material-symbols-outlined text-[18px]">backspace</span>
              </button>
            </div>

            {/* Progress Indicator */}
            {isAnalyzing && (
              <div className="flex flex-col gap-1.5 pt-space-xs">
                <div className="flex items-center justify-between font-label-code-sm text-label-code-sm">
                  <span className="text-primary font-medium">{progressPhase}</span>
                  <span className="text-on-surface font-semibold">{analysisProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-surface-container-lowest rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${analysisProgress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          {/* Live Interactive Annotated Narrative */}
          <div className={`${ORD_ACTIVE[3]} bg-surface-container-low rounded-xl p-space-lg shadow-md flex flex-col gap-space-md border border-surface-container-high/40`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[18px]">find_in_page</span>
                <span className="font-headline-sm text-headline-sm text-on-surface">
                  Extracted Causal Tokens
                </span>
              </div>
              <span className="font-label-code-sm text-label-code-sm text-outline">
                Click token to trace barrier
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              Interactive token stream derived from NLP pipeline. Selecting any highlighted element
              highlights the failing barrier node below.
            </p>

            {/* Highlighted Tokens Flow */}
            <div className="p-space-md rounded-lg bg-surface-container-lowest font-body-md text-body-md text-on-surface leading-loose shadow-inner border border-surface-container-high/40">
              {(() => {
                const tokens = analysisResult?.annotatedTokens || [];
                if (!narrativeText || tokens.length === 0) {
                  return <span>{narrativeText || 'Paste or select an incident scenario to extract precursor evidence tokens.'}</span>;
                }

                // Map token occurrences in narrativeText
                const patternParts: { text: string; isToken: boolean; token?: (typeof tokens)[0] }[] = [];
                const remaining = narrativeText;

                // Sort tokens by their first position in the current text
                const activeMatches: { token: (typeof tokens)[0]; index: number }[] = [];
                tokens.forEach((t) => {
                  const idx = remaining.toLowerCase().indexOf(t.text.toLowerCase());
                  if (idx !== -1) {
                    activeMatches.push({ token: t, index: idx });
                  }
                });

                activeMatches.sort((a, b) => a.index - b.index);

                let cursor = 0;
                activeMatches.forEach((m) => {
                  const idx = remaining.toLowerCase().indexOf(m.token.text.toLowerCase(), cursor);
                  if (idx >= cursor) {
                    if (idx > cursor) {
                      patternParts.push({ text: remaining.slice(cursor, idx), isToken: false });
                    }
                    const matchedActualText = remaining.slice(idx, idx + m.token.text.length);
                    patternParts.push({ text: matchedActualText, isToken: true, token: m.token });
                    cursor = idx + m.token.text.length;
                  }
                });

                if (cursor < remaining.length) {
                  patternParts.push({ text: remaining.slice(cursor), isToken: false });
                }

                if (patternParts.length === 0) {
                  return <span>{narrativeText}</span>;
                }

                return patternParts.map((part, pIdx) => {
                  if (!part.isToken || !part.token) {
                    return <span key={pIdx}>{part.text}</span>;
                  }

                  const tok = part.token;
                  const targetBarrier =
                    tok.type === 'critical-precursor'
                      ? 'barrier_gas'
                      : tok.type === 'barrier-breach'
                      ? 'barrier_loto'
                      : tok.type === 'mitigating-action'
                      ? 'barrier_swa'
                      : 'top_event';

                  const isSelected = activeToken === tok.id;

                  const colorStyles =
                    tok.type === 'critical-precursor'
                      ? isSelected
                        ? 'ring-2 ring-rose-400 bg-rose-900 text-rose-200'
                        : 'bg-rose-950/70 text-rose-300 hover:bg-rose-900'
                      : tok.type === 'barrier-breach'
                      ? isSelected
                        ? 'ring-2 ring-amber-400 bg-amber-900 text-amber-200'
                        : 'bg-amber-950/70 text-amber-300 hover:bg-amber-900'
                      : tok.type === 'mitigating-action'
                      ? isSelected
                        ? 'ring-2 ring-sky-400 bg-sky-900 text-sky-200'
                        : 'bg-sky-950/70 text-sky-300 hover:bg-sky-900'
                      : isSelected
                      ? 'ring-2 ring-primary bg-primary/40 text-on-surface'
                      : 'bg-surface-container-high text-primary hover:bg-surface-bright';

                  const dotColor =
                    tok.type === 'critical-precursor'
                      ? 'bg-rose-400 animate-pulse'
                      : tok.type === 'barrier-breach'
                      ? 'bg-amber-400'
                      : tok.type === 'mitigating-action'
                      ? 'bg-sky-400'
                      : 'bg-primary';

                  return (
                    <button
                      key={pIdx}
                      onClick={() => handleTokenClick(tok.id, targetBarrier)}
                      title={`${tok.description} (Click to inspect barrier)`}
                      className={`mx-0.5 px-1.5 py-0.5 rounded font-label-code-md text-label-code-md transition-all cursor-pointer inline-flex items-center gap-1 ${colorStyles}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
                      {part.text}
                    </button>
                  );
                });
              })()}
            </div>

            <div className="flex items-center justify-between text-label-code-sm font-label-code-sm pt-space-xs text-on-surface-variant flex-wrap gap-2">
              <div className="flex items-center gap-space-sm flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded bg-rose-500"></span> SIF Precursor (Critical)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded bg-amber-500"></span> Barrier Deviation
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded bg-sky-400"></span> Mitigating Action
                </span>
              </div>
              <span className="text-outline">
                Confidence: {analysisResult?.confidencePct !== undefined ? `${analysisResult.confidencePct}%` : 'N/A'}
              </span>
            </div>
          </div>

          {/* Human Decision Bar */}
          <div id="human-decision" className={`${ORD_ACTIVE[4]} bg-surface-container-low rounded-xl p-space-lg shadow-md flex flex-col gap-space-md border border-surface-container-high/40`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[18px]">
                  verified_user
                </span>
                <span className="font-headline-sm text-headline-sm text-on-surface">
                  Human decision
                </span>
              </div>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              An HSE lead must sign off before this classification is saved and used in risk models.
            </p>

            {/* Authenticated Reviewer Display (Read-Only) */}
            <div className="flex flex-col gap-1">
              <label className="font-label-code-sm text-label-code-sm text-outline uppercase font-semibold flex items-center gap-1">
                <span>Authenticated Reviewer</span>
              </label>
              <div className="bg-surface-container px-3 py-1.5 rounded text-on-surface font-body-sm text-body-sm flex items-center justify-between border border-surface-container-high/50">
                <span className="font-semibold text-white">{user?.full_name || user?.email || 'Authenticated Operator'}</span>
                <span className="font-label-code-sm text-[10px] text-primary uppercase bg-primary-container px-2 py-0.5 rounded font-mono">
                  {user?.role || 'Safety Engineer'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm pt-space-xs">
              <button
                onClick={() => handleCommit('committed')}
                className="py-2.5 px-space-sm rounded-lg bg-primary hover:bg-primary-fixed-dim text-on-primary font-headline-sm text-headline-sm font-semibold transition-all flex flex-col items-center justify-center gap-1 shadow-md active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-[18px]">thumb_up</span>
                <span className="text-[12px] text-center leading-tight">Commit and sync</span>
              </button>
              <button
                onClick={() => handleCommit('reclassified')}
                className="py-2.5 px-space-sm rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-headline-sm text-headline-sm font-semibold transition-all flex flex-col items-center justify-center gap-1 shadow-sm active:scale-[0.98] border border-surface-container-high/50"
              >
                <span className="material-symbols-outlined text-[18px]">edit_note</span>
                <span className="text-[12px] text-center leading-tight">Modify score</span>
              </button>
              <button
                onClick={() => {
                  handleCommit('escalated');
                  navigate('/human-review');
                }}
                className="py-2.5 px-space-sm rounded-lg bg-error-container hover:bg-rose-900 text-on-error-container font-headline-sm text-headline-sm font-semibold transition-all flex flex-col items-center justify-center gap-1 shadow-md active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-[18px]">gavel</span>
                <span className="text-[12px] text-center leading-tight">Send to human review</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right 7 Cols: Triage Intelligence & Structured Findings */}
        <div className="contents xl:flex xl:flex-col xl:col-span-7 xl:gap-space-lg">
          {/* Risk Gauge & SIF Severity Hero Header Card */}
          <div className={`${ORD_ACTIVE[1]} bg-surface-container-low rounded-xl p-space-lg shadow-md flex flex-col gap-space-lg border ${sifTone.border}`}>
           {/* Before analysis: gauge | headline text | figures. After analysis: gauge + figures on the first row, the full-width text underneath. */}
           <div className={analysisResult
             ? 'grid grid-cols-[auto_minmax(0,1fr)] gap-x-space-lg gap-y-space-md items-center'
             : 'grid grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)_13rem] gap-space-lg items-center'}>
            {/* Radial Gauge & Score */}
              <div className={`relative w-28 h-28 flex items-center justify-center shrink-0 ${analysisResult ? 'col-start-1 row-start-1' : ''}`}>
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    className="text-surface-container"
                    cx="50"
                    cy="50"
                    fill="transparent"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                  />
                  <circle
                    className={`${sifTone.ring} transition-all duration-700`}
                    cx="50"
                    cy="50"
                    fill="transparent"
                    r="40"
                    stroke="currentColor"
                    strokeDasharray="251.2"
                    strokeDashoffset={analysisResult ? 251.2 - (251.2 * analysisResult.sifScorePct) / 100 : 251.2}
                    strokeLinecap="round"
                    strokeWidth="8"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-headline-xl text-headline-xl text-on-surface font-label-code-lg font-bold">
                    {analysisResult?.sifScorePct !== undefined ? `${analysisResult.sifScorePct}%` : 'N/A'}
                  </span>
                  <span className={`font-label-code-sm text-label-code-sm font-semibold ${sifTone.text}`}>
                    SIF risk
                  </span>
                </div>
              </div>

              <div className={`flex flex-col gap-1 min-w-0 ${analysisResult ? 'col-span-2 row-start-2' : ''}`}>
                <div className="flex items-center gap-space-xs">
                  <span className={`w-2.5 h-2.5 rounded-full ${analysisResult ? sifTone.dot : 'bg-outline'}`}></span>
                  <span className={`font-body-md text-body-md font-semibold ${analysisResult ? sifTone.text : 'text-on-surface-variant'}`}>
                    {analysisResult ? `${sifLevelLabel} serious injury or fatality potential` : 'Awaiting analysis'}
                  </span>
                </div>
                <h2 className="font-headline-md text-headline-md text-on-surface font-semibold break-words [overflow-wrap:anywhere]">
                  {analysisResult?.title || (isAnalyzing ? 'Analyzing report…' : 'Ready for analysis')}
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant break-words [overflow-wrap:anywhere]">
                  {analysisResult
                    ? analysisResult.explanation
                    : (isAnalyzing ? 'Extracting precursors and checking barrier health…' : 'Paste an incident or near-miss narrative, then run the analysis.')}
                </p>
              </div>

            {/* Supporting figures */}
            <div className={analysisResult
              ? 'col-start-2 row-start-1 grid grid-cols-1 gap-space-xs min-w-0'
              : 'col-span-2 md:col-span-1 grid grid-cols-1 sm:grid-cols-3 md:grid-cols-1 w-full gap-space-xs'}>
              <div className="px-space-md py-1.5 rounded-lg bg-surface-container flex flex-wrap items-center justify-between gap-x-space-sm gap-y-0.5 border border-surface-container-high/40">
                <span className="font-body-sm text-body-sm text-outline">Consequence tier</span>
                <span className="font-label-code-md text-label-code-md text-rose-300 font-semibold text-right">
                  {analysisResult?.consequences?.[0]?.regulatoryTier || 'N/A'}
                </span>
              </div>
              <div className="px-space-md py-1.5 rounded-lg bg-surface-container flex flex-wrap items-center justify-between gap-x-space-sm gap-y-0.5 border border-surface-container-high/40">
                <span className="font-body-sm text-body-sm text-outline">Barriers impaired</span>
                <span className={`font-label-code-md text-label-code-md font-semibold ${failedBarrierCount > 0 ? 'text-error' : impairedBarrierCount > 0 ? 'text-amber-300' : 'text-on-surface'}`}>
                  {analysisResult?.barrierFailures ? impairedBarrierCount : 'N/A'}
                </span>
              </div>
              <div
                className="px-space-md py-1.5 rounded-lg bg-surface-container flex flex-wrap items-center justify-between gap-x-space-sm gap-y-0.5 border border-surface-container-high/40"
                title="How confident the AI is in what it extracted. This is not the risk score."
              >
                <span className="font-body-sm text-body-sm text-outline">AI extraction confidence</span>
                <span className="font-label-code-md text-label-code-md text-on-surface font-semibold">
                  {analysisResult?.confidencePct !== undefined ? `${analysisResult.confidencePct}%` : 'N/A'}
                </span>
              </div>
            </div>
           </div>

           {analysisResult && (
            <div className="flex flex-wrap items-center justify-between gap-space-md pt-space-md border-t border-surface-container-high/40">
              <p className="font-body-sm text-body-sm text-on-surface-variant max-w-xl">
                {auditStatus === 'pending'
                  ? 'The AI result is a recommendation. A human reviewer must confirm it before it is committed.'
                  : 'A reviewer decision has been recorded for this analysis.'}
              </p>
              <button
                type="button"
                onClick={() => document.getElementById('human-decision')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                className="px-space-lg py-2 min-h-[40px] rounded-lg bg-primary-container text-on-primary-container font-label-code-md text-label-code-md font-semibold hover:bg-primary transition-colors"
              >
                Review and decide
              </button>
            </div>
           )}
          </div>

          {/* Key findings: failed barriers and strongest precursors, in full */}
          {analysisResult && (
            <div className={`${ORD_ACTIVE[2]} bg-surface-container-low rounded-xl p-space-lg shadow-md flex flex-col gap-space-lg border border-surface-container-high/40`}>
              <section aria-label="Barriers that failed" className="flex flex-col gap-space-sm">
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Barriers that failed or were bypassed</h2>
                {failedBarriers.length === 0 ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">No failed or bypassed barriers were identified in this report.</p>
                ) : (
                  <ul className="flex flex-col gap-space-xs">
                    {failedBarriers.map((b) => (
                      <li key={b.id} className="p-space-sm rounded-lg bg-surface-container border border-error/30 flex flex-col gap-0.5">
                        <div className="flex flex-wrap items-center justify-between gap-space-sm">
                          <span className="font-body-md text-body-md text-on-surface font-semibold break-words">{b.name}</span>
                          <span className="font-label-code-sm text-label-code-sm text-error font-semibold">{b.status === 'BYPASSED' ? 'Bypassed' : 'Failed'}</span>
                        </div>
                        <span className="font-body-sm text-body-sm text-on-surface-variant break-words">{b.description}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section aria-label="Strongest precursors" className="flex flex-col gap-space-sm">
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Strongest precursors</h2>
                {topPrecursors.length === 0 ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">No precursors were recorded for this report.</p>
                ) : (
                  <ul className="flex flex-col gap-space-xs">
                    {topPrecursors.map((p, i) => (
                      <li key={i} className="p-space-sm rounded-lg bg-surface-container flex flex-col gap-0.5">
                        <span className="font-body-md text-body-md text-on-surface font-semibold break-words">{p.name}</span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant break-words">{p.evidence}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {(analysisResult.precursors?.length ?? 0) > topPrecursors.length && (
                  <p className="font-body-sm text-body-sm text-outline">
                    {analysisResult.precursors.length - topPrecursors.length} more in the full findings below.
                  </p>
                )}
              </section>
            </div>
          )}

          {/* Full findings: hazards, all precursors, all barriers, consequences */}
          <div className={`${ORD_ACTIVE[5]}`}>
            <Disclosure
              title="Full findings"
              summary={analysisResult ? (analysisResult.hazards?.length ?? 0) + ' hazards · ' + (analysisResult.precursors?.length ?? 0) + ' precursors · ' + (analysisResult.barrierFailures?.length ?? 0) + ' barriers · ' + (analysisResult.consequences?.length ?? 0) + ' consequences' : 'Available after an analysis runs'}
            >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            {/* Card 1: Identified Hazards */}
            <div
              className={`bg-surface-container-low rounded-xl p-space-md shadow-md flex flex-col justify-between gap-space-sm transition-all duration-200 border ${
                activeToken === 'token-confined'
                  ? 'ring-2 ring-primary bg-surface-container-high border-primary/50'
                  : 'border-surface-container-high/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-rose-400 text-[18px]">warning</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                    Identified Hazards
                  </span>
                </div>
                <span className="font-label-code-sm text-label-code-sm px-2 py-0.5 rounded-full bg-rose-950/60 text-rose-300 font-semibold">
                  {analysisResult?.hazards ? `${analysisResult.hazards.length} Detected` : 'N/A'}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {(analysisResult?.hazards || []).length > 0 ? (
                  analysisResult!.hazards.map((h, i) => (
                    <div
                      key={i}
                      className="p-space-sm rounded-lg bg-surface-container flex items-center justify-between gap-space-sm"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="font-body-sm text-body-sm text-on-surface font-medium break-words [overflow-wrap:anywhere]">
                          {h.name}
                        </span>
                        <span className="font-label-code-sm text-label-code-sm text-outline break-words [overflow-wrap:anywhere]">
                          {h.threshold}
                        </span>
                      </div>
                      <span className="material-symbols-outlined text-rose-400 text-[16px] shrink-0">
                        priority_high
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-outline font-label-code-sm">
                    {isAnalyzing ? 'Detecting hazard vectors...' : 'No hazards recorded'}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="font-label-code-sm text-label-code-sm text-on-surface-variant font-medium">
                  {analysisResult?.lifeSavingRule?.standardsRef || 'Not Recorded'}
                </span>

              </div>
            </div>

            {/* Card 2: Precursor Flags */}
            <div
              className={`bg-surface-container-low rounded-xl p-space-md shadow-md flex flex-col justify-between gap-space-sm transition-all duration-200 border ${
                activeToken === 'token-gas'
                  ? 'ring-2 ring-primary bg-surface-container-high border-primary/50'
                  : 'border-surface-container-high/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-amber-400 text-[18px]">flag</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                    Precursor Flags
                  </span>
                </div>
                <span className="font-label-code-sm text-label-code-sm px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300 font-semibold">
                  {analysisResult?.precursors ? `${analysisResult.precursors.length} Patterns` : 'N/A'}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {(analysisResult?.precursors || []).length > 0 ? (
                  analysisResult!.precursors.map((p, i) => (
                    <div
                      key={i}
                      className="p-space-sm rounded-lg bg-surface-container flex items-start gap-space-sm"
                    >
                      <span className="material-symbols-outlined text-amber-400 text-[16px] shrink-0 mt-0.5">
                        error_outline
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="font-body-sm text-body-sm text-on-surface font-medium break-words [overflow-wrap:anywhere]">
                          {p.name}
                        </span>
                        <span className="font-label-code-sm text-label-code-sm text-outline break-words [overflow-wrap:anywhere]">
                          {p.evidence}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-outline font-label-code-sm">
                    {isAnalyzing ? 'Extracting precursor flags...' : 'No precursor flags recorded'}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="font-label-code-sm text-label-code-sm text-on-surface-variant font-medium">
                  Causal Vector
                </span>
                <span className="font-label-code-md text-label-code-md text-amber-400 font-semibold">
                  {analysisResult?.precursors?.[0]?.weight !== undefined ? `Weight Index: ${analysisResult.precursors[0].weight}` : (analysisResult ? 'Not Recorded' : 'N/A')}
                </span>
              </div>
            </div>

            {/* Card 3: Barrier Health Breakdown */}
            <div
              className={`bg-surface-container-low rounded-xl p-space-md shadow-md flex flex-col justify-between gap-space-sm transition-all duration-200 border ${
                activeToken === 'token-loto'
                  ? 'ring-2 ring-primary bg-surface-container-high border-primary/50'
                  : 'border-surface-container-high/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-primary text-[18px]">
                    health_and_safety
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                    Barrier Status
                  </span>
                </div>
                <span className="font-label-code-sm text-label-code-sm px-2 py-0.5 rounded-full bg-rose-950/60 text-rose-300 font-semibold">
                  {analysisResult?.barrierFailures ? `${analysisResult.barrierFailures.filter(b => b.status !== 'EFFECTIVE').length} of ${analysisResult.barrierFailures.length} Impaired` : 'N/A'}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {(analysisResult?.barrierFailures || []).length > 0 ? (
                  analysisResult!.barrierFailures.map((b, i) => (
                    <div
                      key={i}
                      className="p-space-sm rounded-lg bg-surface-container flex items-center justify-between gap-space-sm"
                    >
                      <span className="font-body-sm text-body-sm text-on-surface min-w-0 break-words [overflow-wrap:anywhere]">{b.name}</span>
                      <span
                        className={`px-space-xs py-0.5 rounded font-label-code-sm text-label-code-sm font-semibold shrink-0 ${
                          b.status === 'FAILED'
                            ? 'bg-rose-950/80 text-rose-300'
                            : b.status === 'BYPASSED'
                            ? 'bg-amber-950/80 text-amber-300'
                            : 'bg-emerald-950/80 text-emerald-300'
                        }`}
                      >
                        {b.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-outline font-label-code-sm">
                    {isAnalyzing ? 'Auditing barrier health...' : 'No barrier telemetry evaluated yet'}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="font-label-code-sm text-label-code-sm text-on-surface-variant font-medium">
                  Bowtie Barrier Model
                </span>
                <span className="font-label-code-sm text-label-code-sm text-primary font-medium">
                  Synced Below ↓
                </span>
              </div>
            </div>

            {/* Card 4: Credible Consequence Matrix */}
            <div className="bg-surface-container-low rounded-xl p-space-md shadow-md flex flex-col justify-between gap-space-sm border border-surface-container-high/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-rose-400 text-[18px]">skull</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                    Potential Consequence
                  </span>
                </div>
                <span className="font-label-code-sm text-label-code-sm px-2 py-0.5 rounded-full bg-rose-950/60 text-rose-300 font-semibold">
                  {analysisResult?.sifScorePct !== undefined ? (analysisResult.sifScorePct >= 70 ? 'SIF Actualized' : 'Residual Threat') : 'N/A'}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="p-space-sm rounded-lg bg-surface-container flex items-center justify-between gap-space-sm">
                  <span className="font-body-sm text-body-sm text-on-surface min-w-0 break-words [overflow-wrap:anywhere]">
                    {analysisResult?.consequences?.[0]?.title || (isAnalyzing ? 'Modeling consequences...' : 'Not Recorded')}
                  </span>
                  <span className="font-label-code-sm text-label-code-sm text-rose-400 font-bold uppercase shrink-0">
                    {analysisResult?.consequences?.[0]?.severity || 'N/A'}
                  </span>
                </div>
                <div className="p-space-sm rounded-lg bg-surface-container flex items-center justify-between">
                  <span className="font-body-sm text-body-sm text-on-surface">
                    Standards Mandate
                  </span>
                  <span className="font-label-code-md text-label-code-md text-on-surface font-medium">
                    {analysisResult?.lifeSavingRule?.standardsRef || 'N/A'}
                  </span>
                </div>
                <div className="p-space-sm rounded-lg bg-surface-container flex items-center justify-between">
                  <span className="font-body-sm text-body-sm text-on-surface">
                    Regulatory Reporting Tier
                  </span>
                  <span className="font-label-code-sm text-label-code-sm text-amber-300 font-medium">
                    {analysisResult?.consequences?.[0]?.regulatoryTier || 'N/A'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="font-label-code-sm text-label-code-sm text-on-surface-variant font-medium">
                  Intervention Action
                </span>
                <span className="font-label-code-md text-label-code-md text-emerald-400 font-semibold">
                  {analysisResult ? 'Precursor Isolated' : 'N/A'}
                </span>
              </div>
            </div>
          </div>
            </Disclosure>
          </div>

          {/* Interactive Bowtie Barrier Diagram */}
          <div className={`${ORD_ACTIVE[6]} bg-surface-container-low rounded-xl p-space-lg shadow-md flex flex-col gap-space-md border border-surface-container-high/40`}>
            <div className="flex flex-wrap items-center justify-between gap-space-sm">
              <div className="flex flex-col">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-primary text-[18px]">hub</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                    Bowtie diagram: threats, barriers, consequences
                  </span>
                </div>
                <span className="font-label-code-sm text-label-code-sm text-on-surface-variant">
                  Select a node to see the evidence behind it
                </span>
              </div>
            </div>

            {/* SVG Flow Container with Interactive Nodes */}
            <div className="relative w-full rounded-xl bg-surface-container-lowest p-space-md overflow-x-auto shadow-inner border border-surface-container-high/30">
              <div className="min-w-[620px]">
                <svg className="w-full h-44" fill="none" viewBox="0 0 620 170">
                  {/* Grid Delimiter Guides */}
                  <line
                    className="text-surface-bright opacity-40"
                    stroke="currentColor"
                    strokeDasharray="4 4"
                    x1="20"
                    x2="600"
                    y1="85"
                    y2="85"
                  />
                  <line
                    className="text-surface-bright opacity-50"
                    stroke="currentColor"
                    strokeDasharray="2 2"
                    x1="310"
                    x2="310"
                    y1="15"
                    y2="155"
                  />

                  {/* Left Branch Lines (Threat to Top Event) */}
                  <path d="M 90 40 L 190 40 L 310 85" stroke="#f43f5e" strokeWidth="2" strokeOpacity="0.6" />
                  <path d="M 90 130 L 190 130 L 310 85" stroke="#f43f5e" strokeWidth="2" strokeOpacity="0.6" />

                  {/* Right Branch Lines (Top Event to Consequence) */}
                  <path d="M 310 85 L 430 40 L 530 40" stroke="#10b981" strokeWidth="2" strokeOpacity="0.6" />
                  <path d="M 310 85 L 430 130 L 530 130" stroke="#353942" strokeWidth="2" />

                  {/* Threat Nodes Left */}
                  <g className="cursor-pointer" onClick={() => setSelectedBarrierNode('threat_1')}>
                    <rect
                      className="fill-surface-container hover:fill-surface-container-high transition-colors"
                      height="32"
                      rx="4"
                      width="85"
                      x="10"
                      y="24"
                    />
                    <text fill="#dfe2ee" fontFamily="IBM Plex Mono" fontSize="9" fontWeight="600" textAnchor="middle" x="52" y="44">
                      {(analysisResult?.hazards?.[0]?.name ? analysisResult.hazards[0].name.slice(0, 13) : (analysisResult ? 'NOT RECORDED' : 'AWAITING')).toUpperCase()}
                    </text>
                  </g>

                  <g className="cursor-pointer" onClick={() => setSelectedBarrierNode('threat_2')}>
                    <rect
                      className="fill-surface-container hover:fill-surface-container-high transition-colors"
                      height="32"
                      rx="4"
                      width="85"
                      x="10"
                      y="114"
                    />
                    <text fill="#dfe2ee" fontFamily="IBM Plex Mono" fontSize="9" fontWeight="600" textAnchor="middle" x="52" y="134">
                      {(analysisResult?.hazards?.[1]?.name ? analysisResult.hazards[1].name.slice(0, 13) : (analysisResult ? 'NOT RECORDED' : 'AWAITING')).toUpperCase()}
                    </text>
                  </g>

                  {/* Prevention Barrier 1 */}
                  <g className="cursor-pointer group" onClick={() => setSelectedBarrierNode('barrier_prevention_1')}>
                    <rect
                      className={`transition-colors ${
                        selectedBarrierNode === 'barrier_prevention_1' || selectedBarrierNode === 'barrier_gas'
                          ? 'fill-rose-900 stroke-rose-400 stroke-2'
                          : 'fill-rose-950/80 stroke-rose-500'
                      }`}
                      height="36"
                      rx="4"
                      width="105"
                      x="140"
                      y="22"
                    />
                    <text fill="#ffb4ab" fontFamily="Inter" fontSize="9" fontWeight="600" textAnchor="middle" x="192" y="38">
                      {(analysisResult?.barrierFailures?.[0]?.name || (analysisResult ? 'Not identified' : 'Awaiting')).slice(0, 16)}
                    </text>
                    <text fill="#fca5a5" fontFamily="IBM Plex Mono" fontSize="8" textAnchor="middle" x="192" y="50">
                      [{analysisResult?.barrierFailures?.[0]?.status || (analysisResult ? 'Not available' : 'N/A')}]
                    </text>
                  </g>

                  {/* Prevention Barrier 2 */}
                  <g className="cursor-pointer group" onClick={() => setSelectedBarrierNode('barrier_prevention_2')}>
                    <rect
                      className={`transition-colors ${
                        selectedBarrierNode === 'barrier_prevention_2' || selectedBarrierNode === 'barrier_loto'
                          ? 'fill-rose-900 stroke-rose-400 stroke-2'
                          : 'fill-rose-950/80 stroke-rose-500'
                      }`}
                      height="36"
                      rx="4"
                      width="105"
                      x="140"
                      y="112"
                    />
                    <text fill="#ffb4ab" fontFamily="Inter" fontSize="9" fontWeight="600" textAnchor="middle" x="192" y="128">
                      {(analysisResult?.barrierFailures?.[1]?.name || (analysisResult ? 'Not identified' : 'Awaiting')).slice(0, 16)}
                    </text>
                    <text fill="#fca5a5" fontFamily="IBM Plex Mono" fontSize="8" textAnchor="middle" x="192" y="140">
                      [{analysisResult?.barrierFailures?.[1]?.status || (analysisResult ? 'Not available' : 'N/A')}]
                    </text>
                  </g>

                  {/* Central Top Event (Knot) */}
                  <g className="cursor-pointer group" onClick={() => setSelectedBarrierNode('top_event')}>
                    <circle
                      className="fill-surface-container-high group-hover:fill-surface-bright transition-colors stroke-primary"
                      cx="310"
                      cy="85"
                      r="28"
                    />
                    <circle className="fill-rose-500/20 stroke-rose-500 animate-pulse" cx="310" cy="85" r="12" />
                    <text fill="#dfe2ee" fontFamily="Inter" fontSize="8" fontWeight="700" textAnchor="middle" x="310" y="81">
                      TOP EVENT
                    </text>
                    <text fill="#38bdf8" fontFamily="IBM Plex Mono" fontSize="7" textAnchor="middle" x="310" y="93">
                      {(analysisResult?.title ? analysisResult.title.slice(0, 14) : (analysisResult ? 'Not Recorded' : 'Awaiting'))}
                    </text>
                  </g>

                  {/* Mitigating Barrier 1 */}
                  <g className="cursor-pointer group" onClick={() => setSelectedBarrierNode('barrier_mitigation_1')}>
                    <rect
                      className={`transition-colors ${
                        selectedBarrierNode === 'barrier_mitigation_1' || selectedBarrierNode === 'barrier_swa'
                          ? 'fill-emerald-900 stroke-emerald-400 stroke-2'
                          : 'fill-emerald-950/80 stroke-emerald-500'
                      }`}
                      height="36"
                      rx="4"
                      width="105"
                      x="375"
                      y="22"
                    />
                    <text fill="#a7f3d0" fontFamily="Inter" fontSize="9" fontWeight="600" textAnchor="middle" x="427" y="38">
                      {(analysisResult?.mitigatingControls?.[0]?.name || (analysisResult ? 'Not identified' : 'Awaiting')).slice(0, 16)}
                    </text>
                    <text fill="#34d399" fontFamily="IBM Plex Mono" fontSize="8" textAnchor="middle" x="427" y="50">
                      [{analysisResult?.mitigatingControls?.[0]?.status || (analysisResult ? 'Not available' : 'N/A')}]
                    </text>
                  </g>

                  {/* Mitigating Barrier 2 */}
                  <g className="cursor-pointer group" onClick={() => setSelectedBarrierNode('barrier_mitigation_2')}>
                    <rect
                      className={`transition-colors ${
                        selectedBarrierNode === 'barrier_mitigation_2' || selectedBarrierNode === 'barrier_rescue'
                          ? 'fill-surface-container-high stroke-primary stroke-2'
                          : 'fill-surface-container stroke-surface-bright'
                      }`}
                      height="36"
                      rx="4"
                      width="105"
                      x="375"
                      y="112"
                    />
                    <text fill="#bdc8d1" fontFamily="Inter" fontSize="9" fontWeight="600" textAnchor="middle" x="427" y="128">
                      {(analysisResult?.mitigatingControls?.[1]?.name || (analysisResult ? 'Not identified' : 'Awaiting')).slice(0, 16)}
                    </text>
                    <text fill="#87929a" fontFamily="IBM Plex Mono" fontSize="8" textAnchor="middle" x="427" y="140">
                      [{analysisResult?.mitigatingControls?.[1]?.status || (analysisResult ? 'Not available' : 'N/A')}]
                    </text>
                  </g>

                  {/* Outcomes Right */}
                  <g className="cursor-pointer" onClick={() => setSelectedBarrierNode('outcome_controlled')}>
                    <rect
                      className="fill-surface-container hover:fill-surface-container-high transition-colors"
                      height="32"
                      rx="4"
                      width="85"
                      x="525"
                      y="24"
                    />
                    <text fill="#38bdf8" fontFamily="Inter" fontSize="9" fontWeight="600" textAnchor="middle" x="567" y="38">
                      {(analysisResult?.consequences?.[1]?.title || (analysisResult ? 'Not identified' : 'Awaiting')).slice(0, 13)}
                    </text>
                    <text fill="#93ccff" fontFamily="IBM Plex Mono" fontSize="8" textAnchor="middle" x="567" y="49">
                      {analysisResult ? (analysisResult.consequences?.[1]?.regulatoryTier || 'Outcome Tier') : 'No Data'}
                    </text>
                  </g>

                  <g className="cursor-pointer" onClick={() => setSelectedBarrierNode('outcome_fatal')}>
                    <rect
                      className="fill-surface-container hover:fill-surface-container-high transition-colors"
                      height="32"
                      rx="4"
                      width="85"
                      x="525"
                      y="114"
                    />
                    <text fill="#ffb4ab" fontFamily="Inter" fontSize="9" fontWeight="600" textAnchor="middle" x="567" y="128">
                      {(analysisResult?.consequences?.[0]?.title || (analysisResult ? 'Not identified' : 'Awaiting')).slice(0, 13)}
                    </text>
                    <text fill="#fca5a5" fontFamily="IBM Plex Mono" fontSize="8" textAnchor="middle" x="567" y="139">
                      {analysisResult ? (analysisResult.consequences?.[0]?.severity || 'Consequence') : 'No Data'}
                    </text>
                  </g>
                </svg>
              </div>
            </div>

            {/* Dynamic Context Box on Barrier Selection */}
            <div className="p-space-md rounded-lg bg-surface-container flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md shadow-sm border border-surface-container-high/40">
              <div className="flex items-start gap-space-sm">
                <div className="w-8 h-8 rounded bg-surface-container-high flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-primary text-[18px]">
                    {activeBarrierDetail.icon}
                  </span>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-space-xs">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                      Selected Node: {activeBarrierDetail.title}
                    </span>
                    <span
                      className={`font-label-code-sm text-label-code-sm px-1.5 py-0.5 rounded font-semibold ${activeBarrierDetail.badgeClass}`}
                    >
                      {activeBarrierDetail.badge}
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    {activeBarrierDetail.text}
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* Technical details: diagnostics stay accessible */}
          {analysisResult && (
            <div className={`${ORD_ACTIVE[7]}`}>
              <Disclosure title="Technical details" summary="AI model, confidence, processing time and record IDs">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-space-xl gap-y-space-md font-body-sm text-body-sm">
                  <div><dt className="text-outline">AI model</dt><dd className="text-on-surface break-words">{analysisResult.ai_model || 'Not recorded'}</dd></div>
                  <div><dt className="text-outline">AI extraction confidence</dt><dd className="text-on-surface">{analysisResult.confidencePct !== undefined ? analysisResult.confidencePct + '%' : 'Not recorded'}</dd></div>
                  <div><dt className="text-outline">SIF risk estimate (a risk estimate, not a measure of AI accuracy)</dt><dd className="text-on-surface">{analysisResult.sifScorePct}%</dd></div>
                  <div><dt className="text-outline">Tokens detected</dt><dd className="text-on-surface">{analysisResult.tokensDetectedCount}</dd></div>
                  <div><dt className="text-outline">Processing time</dt><dd className="text-on-surface">{analysisResult.processingTimeMs} ms</dd></div>
                  <div><dt className="text-outline">Life-saving rule</dt><dd className="text-on-surface break-words">{analysisResult.lifeSavingRule?.code} {analysisResult.lifeSavingRule?.name}</dd></div>
                  <div><dt className="text-outline">Report ID</dt><dd className="text-on-surface break-all">{analysisResult.report_id || 'Not recorded'}</dd></div>
                  <div><dt className="text-outline">Review ID</dt><dd className="text-on-surface break-all">{analysisResult.review_id || 'Not recorded'}</dd></div>
                </dl>
              </Disclosure>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
