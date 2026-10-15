import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  Shield,
  Lock,
  Menu,
  X,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  FileSearch,
  Dna,
  Database,
  Share2,
  Gauge,
  BellRing,
  UserPlus,
  Workflow,
  Activity,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { ParticleCanvas } from '../components/landing/ParticleCanvas';
import { api, PublicKnowledgeGraphSummary } from '../services/api';

export const LandingPage: React.FC = () => {
  const { isAuthenticated, openLoginModal, openRegisterModal } = useAuth();
  const navigate = useNavigate();

  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Real PostgreSQL-backed graph telemetry for the public landing page.
  // 'loading' until the first response; 'error' if the public endpoint is
  // unreachable — in both cases we show a neutral state, never a fabricated number.
  const [graphSummary, setGraphSummary] = useState<PublicKnowledgeGraphSummary | null>(null);
  const [graphSummaryStatus, setGraphSummaryStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    api.getPublicKnowledgeGraphSummary()
      .then((res) => {
        if (cancelled) return;
        setGraphSummary(res);
        setGraphSummaryStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setGraphSummaryStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mobileNavItems = [
    {
      href: '#platform',
      label: 'Platform Overview',
      sublabel: 'Executive SIF detection & live precursor graph',
      tag: '01',
      icon: <ShieldAlert className="w-4 h-4 text-cyan-400" />
    },
    {
      href: '#how-it-works',
      label: 'How It Works',
      sublabel: '5-stage closed-loop operational pipeline',
      tag: '02',
      icon: <Workflow className="w-4 h-4 text-cyan-400" />
    },
    {
      href: '#capabilities',
      label: 'Capabilities',
      sublabel: '6 specialized telemetry & CAPA modules',
      tag: '03',
      icon: <Gauge className="w-4 h-4 text-cyan-400" />
    },
    {
      href: '#risk-telemetry',
      label: 'Risk Telemetry',
      sublabel: 'Temporal dynamics & barrier decay run chart',
      tag: '04',
      icon: <Activity className="w-4 h-4 text-amber-400" />
    },
    {
      href: '#human-governance',
      label: 'Human Review',
      sublabel: 'Accredited specialist triage & sign-off',
      tag: '05',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />
    }
  ];

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleEnterPlatform = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      openLoginModal();
    }
  };

  const handleCapabilityClick = (route: string) => {
    if (isAuthenticated) {
      navigate(route);
    } else {
      openLoginModal();
    }
  };

  return (
    <div className="technical-grid relative selection:bg-cyan-500/30 selection:text-cyan-200 min-h-screen bg-[#090d16] text-[#f1f5f9] overflow-x-hidden font-sans">
      {/* Interactive Dynamic Safety Intelligence Particle Field Canvas */}
      <ParticleCanvas />

      {/* Fixed Technical Navigation Bar */}
      <header
        id="main-nav"
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b border-slate-800/80 ${
          isScrolled ? 'bg-[#090d16]/95 shadow-lg backdrop-blur-md' : 'bg-[#090d16]/80 backdrop-blur-md'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-6 xl:px-8 h-16 flex items-center justify-between gap-x-2 lg:gap-x-3 xl:gap-x-4">
          {/* Brand & Telemetry Status */}
          <div className="flex items-center min-w-0 shrink-0 space-x-3 xl:space-x-4">
            <a href="#" className="flex items-center space-x-2.5 sm:space-x-3 group min-w-0 shrink-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded border border-cyan-500/40 bg-cyan-950/40 flex items-center justify-center text-cyan-400 group-hover:border-cyan-400 transition-colors shadow-[0_0_12px_rgba(56,189,248,0.2)]">
                <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2 whitespace-nowrap">
                  <span className="font-mono font-bold tracking-wider text-sm sm:text-base text-white">PRECURSOR-X</span>
                  <span className="hidden sm:inline-block text-[10px] font-mono font-semibold tracking-wide px-1.5 py-0.5 rounded bg-slate-800/90 text-cyan-400 border border-cyan-500/20">
                    v4.8
                  </span>
                </div>
                <p className="hidden sm:block text-[11px] text-slate-400 font-sans tracking-tight truncate">Safety Intelligence Platform</p>
              </div>
            </a>

            {/* Telemetry status: only shown once there is ample room alongside the full nav, to stop it crowding "Human Review" / REQUEST ACCESS at lg/xl widths */}
            <div className="hidden 2xl:flex items-center space-x-2 pl-4 border-l border-slate-800 text-xs font-mono font-semibold tracking-wide text-slate-400 whitespace-nowrap shrink-0">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]"></span>
              <span className="text-slate-300">SYSTEM ONLINE</span>
              <span className="text-slate-600">//</span>
              <span className="text-slate-400">US-EAST-1</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-x-3 xl:gap-x-6 2xl:gap-x-8 text-[13px] xl:text-sm font-medium text-slate-300 whitespace-nowrap shrink-0">
            <a href="#platform" className="hover:text-cyan-400 transition-colors">
              Platform
            </a>
            <a href="#how-it-works" className="hover:text-cyan-400 transition-colors">
              How It Works
            </a>
            <a href="#capabilities" className="hover:text-cyan-400 transition-colors">
              Capabilities
            </a>
            <a href="#risk-telemetry" className="hover:text-cyan-400 transition-colors">
              Risk Telemetry
            </a>
            <a href="#human-governance" className="hover:text-cyan-400 transition-colors">
              Human Review
            </a>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center shrink-0 space-x-2 xl:space-x-2.5">
            <button
              onClick={openRegisterModal}
              className="hidden sm:inline-flex items-center whitespace-nowrap px-2.5 xl:px-3.5 py-1.5 text-[11px] xl:text-xs font-mono font-medium rounded border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white transition-all bg-slate-900/50 cursor-pointer"
            >
              REQUEST ACCESS
            </button>
            <button
              onClick={handleEnterPlatform}
              className="hidden sm:inline-flex items-center whitespace-nowrap space-x-1.5 px-3 xl:px-4 py-1.5 text-[11px] xl:text-xs font-mono font-semibold rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all shadow-[0_0_15px_rgba(56,189,248,0.35)] hover:shadow-[0_0_20px_rgba(56,189,248,0.5)] cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isAuthenticated ? 'CONSOLE' : 'LOGIN'}</span>
            </button>

            {/* Mobile Menu Toggle */}
            <button
              id="mobile-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`lg:hidden flex items-center justify-center w-9 h-9 shrink-0 rounded-lg border transition-all cursor-pointer shadow-sm ${
                mobileMenuOpen
                  ? 'border-cyan-500/60 bg-cyan-950/60 text-cyan-400 shadow-[0_0_15px_rgba(56,189,248,0.25)]'
                  : 'border-slate-700/80 bg-slate-900/80 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-400'
              }`}
              aria-label="Toggle mobile navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-cyan-400" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div
            id="mobile-menu"
            className="lg:hidden border-b border-cyan-500/30 bg-[#090d16]/98 backdrop-blur-2xl shadow-2xl transition-all duration-300 overflow-hidden"
          >
            {/* Top accent glowing separator */}
            <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

            <div className="px-4 py-4 space-y-4">
              {/* Telemetry status badge */}
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 text-[11px] font-mono font-semibold tracking-wide text-slate-400">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                  <span className="text-slate-200 font-semibold">PRECURSOR-X OS</span>
                  <span className="text-cyan-400 text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30">
                    v4.8
                  </span>
                </div>
                <span className="text-slate-500">STATION: US-EAST-1</span>
              </div>

              {/* Navigation Items Cards */}
              <div className="space-y-1.5">
                {mobileNavItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-slate-800/80 bg-slate-900/50 hover:bg-slate-800/80 hover:border-cyan-500/40 text-slate-200 hover:text-white transition-all group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg border border-slate-800 bg-slate-950/70 flex items-center justify-center group-hover:border-cyan-500/40 transition-colors shrink-0">
                        {item.icon}
                      </div>
                      <div>
                        <div className="text-xs font-mono font-semibold group-hover:text-cyan-300 transition-colors">
                          {item.label}
                        </div>
                        <div className="text-[10px] font-sans text-slate-400">
                          {item.sublabel}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1.5 text-slate-500 group-hover:text-cyan-400 transition-colors font-mono font-bold tracking-wide text-[10px] shrink-0">
                      <span>{item.tag}</span>
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </a>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleEnterPlatform();
                  }}
                  className="w-full py-2.5 px-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(56,189,248,0.35)] flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isAuthenticated ? 'ENTER CONSOLE' : 'SIGN IN TO TELEMETRY'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openRegisterModal();
                  }}
                  className="w-full py-2 px-4 rounded-lg border border-slate-700/80 hover:border-slate-500 bg-slate-900/60 text-slate-300 hover:text-white font-mono font-semibold tracking-wide text-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5 text-cyan-400" />
                  <span>REQUEST ACCESS</span>
                </button>
              </div>

              {/* Micro Disclaimer */}
              <div className="pt-1 text-center text-[10px] font-mono font-semibold text-slate-500 tracking-wider">
                DEMO ENVIRONMENT • SYNTHETIC DATA • CCPS PSM
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <main id="platform" className="relative z-10 pt-28 sm:pt-36 lg:pt-44 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Headline & Value Prop */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-semibold tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
              <span>DEMO ENVIRONMENT • SYNTHETIC SAFETY TELEMETRY // IOGP 459 & ISO-45001</span>
            </div>

            <h1 className="font-headline text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.12]">
              SEE THE <span className="text-gradient-highlight">PRECURSOR.</span>
              <br />
              BEFORE IT BECOMES
              <br />
              THE INCIDENT.
            </h1>

            <p className="text-base sm:text-lg text-slate-400 max-w-2xl font-normal leading-relaxed">
              PRECURSOR-X transforms operational safety data into early-warning intelligence by identifying emerging precursor patterns, barrier degradation, systemic risk, and precision opportunities for preventive intervention.
            </p>

            {/* CTA Cluster */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
              <button
                onClick={handleEnterPlatform}
                className="inline-flex justify-center items-center space-x-2 px-6 py-3 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-sm tracking-wide transition-all shadow-[0_0_20px_rgba(56,189,248,0.4)] cursor-pointer"
              >
                <span>ENTER PRECURSOR-X</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#how-it-works"
                className="inline-flex justify-center items-center space-x-2 px-6 py-3 rounded border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-mono font-semibold tracking-wide text-sm transition-all bg-slate-900/40"
              >
                <span>EXPLORE PLATFORM</span>
                <ChevronDown className="w-4 h-4" />
              </a>
            </div>

            {/* Telemetry Status Strip */}
            <div className="pt-6 border-t border-slate-800/80">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono font-semibold tracking-wide text-slate-400">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  <span>AI ENGINE READY</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  <span>TELEMETRY ONLINE</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  <span>PRECURSOR ACTIVE</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>HUMAN REVIEW ON</span>
                </div>
              </div>
              <div className="pt-2 text-[10px] font-mono font-semibold text-slate-500 tracking-wider">
                ENV: PRODUCTION MIRROR <span className="mx-2">•</span>{' '}
                <span className="text-cyan-500/80">DEMO ENVIRONMENT • SYNTHETIC DATA</span>
              </div>
            </div>
          </div>

          {/* Hero Telemetry Visualization */}
          <div className="lg:col-span-5 relative">
            <div className="rounded-xl border border-slate-800/90 bg-[#0f131c]/90 backdrop-blur-md p-5 shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 text-xs font-mono font-semibold tracking-wide">
                <div className="flex items-center space-x-2 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  <span className="font-semibold text-white">LIVE SIF PRECURSOR GRAPH</span>
                </div>
                <span className="text-[10px] text-cyan-400 bg-cyan-950/70 border border-cyan-500/30 px-2 py-0.5 rounded">
                  SAMPLING 12ms
                </span>
              </div>

              {/* Abstract Connected Chain SVG — showcase-only, not wired to backend data. */}
              {/* Desktop/tablet composition (unchanged layout, preserved as-is). */}
              <div className="hidden sm:flex py-6 items-center justify-center relative w-full">
                <svg viewBox="0 0 420 300" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="cyanLine" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.2" />
                      <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.2" />
                    </linearGradient>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  <line x1="80" y1="60" x2="210" y2="110" stroke="url(#cyanLine)" strokeWidth="2" />
                  <line x1="210" y1="110" x2="330" y2="70" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 2" />
                  <line x1="210" y1="110" x2="210" y2="230" stroke="#38bdf8" strokeWidth="2" />
                  <line x1="210" y1="110" x2="110" y2="200" stroke="#64748b" strokeWidth="1.5" />

                  {/* Traveling Packet */}
                  <circle r="4" fill="#38bdf8" filter="url(#glow)">
                    <animateMotion path="M 80 60 L 210 110" dur="2.8s" repeatCount="indefinite" />
                  </circle>
                  <circle r="3" fill="#ef4444" filter="url(#glow)">
                    <animateMotion path="M 210 110 L 330 70" dur="2.1s" repeatCount="indefinite" />
                  </circle>

                  {/* Node 1: Event */}
                  <g transform="translate(80,60)">
                    <circle r="18" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
                    <circle r="6" fill="#38bdf8" filter="url(#glow)" />
                    <text y="-25" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="600" letterSpacing="0.05em" fontFamily="IBM Plex Mono">
                      EVENT
                    </text>
                    <text y="30" textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="600" fontFamily="IBM Plex Mono">
                      #NM-0941
                    </text>
                  </g>

                  {/* Node 2: Precursor (Center) */}
                  <g transform="translate(210,110)">
                    <circle r="26" fill="#1e1b4b" stroke="#f59e0b" strokeWidth="2" />
                    <circle r="10" fill="#f59e0b" filter="url(#glow)" />
                    <text
                      y="-32"
                      textAnchor="middle"
                      fill="#fde68a"
                      fontWeight="bold"
                      fontSize="11"
                      letterSpacing="0.04em"
                      fontFamily="IBM Plex Mono"
                    >
                      PRECURSOR
                    </text>
                    <text y="42" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="600" fontFamily="IBM Plex Mono">
                      PREC-219 [TK-402 H2S]
                    </text>
                  </g>

                  {/* Node 3: Barrier */}
                  <g transform="translate(330,70)">
                    <circle r="18" fill="#450a0a" stroke="#ef4444" strokeWidth="2" />
                    <circle r="6" fill="#ef4444" filter="url(#glow)" />
                    <text y="-24" textAnchor="middle" fill="#fca5a5" fontSize="10" fontWeight="600" letterSpacing="0.05em" fontFamily="IBM Plex Mono">
                      BARRIER
                    </text>
                    <text y="30" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="600" fontFamily="IBM Plex Mono">
                      BARRIER-17 DECAY
                    </text>
                  </g>

                  {/* Node 4: SIF Risk */}
                  <g transform="translate(210,230)">
                    <circle r="22" fill="#022c22" stroke="#10b981" strokeWidth="2" />
                    <circle r="8" fill="#10b981" filter="url(#glow)" />
                    <text y="36" textAnchor="middle" fill="#a7f3d0" fontSize="10" fontWeight="600" letterSpacing="0.05em" fontFamily="IBM Plex Mono">
                      INTERVENTION
                    </text>
                    <text y="48" textAnchor="middle" fill="#6ee7b7" fontSize="9" fontWeight="600" fontFamily="IBM Plex Mono">
                      HUMAN SIGN-OFF (SWA)
                    </text>
                  </g>

                  {/* Node 5: Facility Context */}
                  <g transform="translate(110,200)">
                    <circle r="14" fill="#0f172a" stroke="#64748b" strokeWidth="1.5" />
                    <circle r="4" fill="#64748b" />
                    <text y="-20" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="600" letterSpacing="0.05em" fontFamily="IBM Plex Mono">
                      FACILITY
                    </text>
                    <text y="26" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600" fontFamily="IBM Plex Mono">
                      Permian TK-402
                    </text>
                  </g>

                  {/* Center SIF Potential Tag — sits in the open space below the Barrier
                      connector and clear below the PRECURSOR node's own label (baseline
                      ~y152), so it doesn't overlap the node, its text, or the edges. */}
                  <rect x="238" y="163" width="100" height="20" rx="3" fill="#450a0a" stroke="#ef4444" strokeWidth="1" />
                  <text
                    x="288"
                    y="177"
                    textAnchor="middle"
                    fill="#fca5a5"
                    fontSize="9"
                    fontWeight="bold"
                    fontFamily="IBM Plex Mono"
                  >
                    87.4% POTENTIAL
                  </text>
                </svg>
              </div>

              {/* Mobile composition — same visual concept, deliberately repositioned with
                  generous vertical spacing so node labels and the potential badge never
                  collide on narrow viewports. Taller viewBox, bounded aspect-ratio box. */}
              <div className="sm:hidden py-4 relative w-full" style={{ aspectRatio: '3 / 4' }}>
                <svg viewBox="0 0 300 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="cyanLineMobile" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.2" />
                      <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.2" />
                    </linearGradient>
                    <filter id="glowMobile" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* Connections: Event -> Precursor -> {Barrier, Intervention}; Facility -> Precursor */}
                  <line x1="90" y1="60" x2="150" y2="160" stroke="url(#cyanLineMobile)" strokeWidth="2" />
                  <line x1="150" y1="160" x2="235" y2="90" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 2" />
                  <line x1="150" y1="160" x2="150" y2="330" stroke="#38bdf8" strokeWidth="2" />
                  <line x1="150" y1="160" x2="70" y2="280" stroke="#64748b" strokeWidth="1.5" />

                  {/* Traveling Packet */}
                  <circle r="3.5" fill="#38bdf8" filter="url(#glowMobile)">
                    <animateMotion path="M 90 60 L 150 160" dur="2.8s" repeatCount="indefinite" />
                  </circle>
                  <circle r="3" fill="#ef4444" filter="url(#glowMobile)">
                    <animateMotion path="M 150 160 L 235 90" dur="2.1s" repeatCount="indefinite" />
                  </circle>

                  {/* Node 1: Event */}
                  <g transform="translate(90,60)">
                    <circle r="16" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
                    <circle r="5" fill="#38bdf8" filter="url(#glowMobile)" />
                    <text y="-22" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="600" letterSpacing="0.04em" fontFamily="IBM Plex Mono">
                      EVENT
                    </text>
                    <text y="27" textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="600" fontFamily="IBM Plex Mono">
                      #NM-0941
                    </text>
                  </g>

                  {/* Node 2: Precursor (Center) */}
                  <g transform="translate(150,160)">
                    <circle r="24" fill="#1e1b4b" stroke="#f59e0b" strokeWidth="2" />
                    <circle r="9" fill="#f59e0b" filter="url(#glowMobile)" />
                    <text y="-31" textAnchor="middle" fill="#fde68a" fontWeight="bold" fontSize="11" letterSpacing="0.03em" fontFamily="IBM Plex Mono">
                      PRECURSOR
                    </text>
                    <text y="39" textAnchor="middle" fill="#94a3b8" fontSize="8.5" fontWeight="600" fontFamily="IBM Plex Mono">
                      PREC-219 [TK-402 H2S]
                    </text>
                  </g>

                  {/* SIF Potential Tag — offset to the right of the PRECURSOR→INTERVENTION
                      connector (which runs straight down the x=150 centerline) and clear
                      below the PRECURSOR node's own label (baseline ~y199), so it never
                      sits on top of the node, its label text, or any edge. Stays inside
                      the 0–300 viewBox with margin on both sides. */}
                  <rect x="175" y="212" width="104" height="22" rx="3" fill="#450a0a" stroke="#ef4444" strokeWidth="1" />
                  <text x="227" y="227" textAnchor="middle" fill="#fca5a5" fontSize="9" fontWeight="bold" fontFamily="IBM Plex Mono">
                    87.4% POTENTIAL
                  </text>

                  {/* Node 3: Barrier */}
                  <g transform="translate(235,90)">
                    <circle r="16" fill="#450a0a" stroke="#ef4444" strokeWidth="2" />
                    <circle r="5" fill="#ef4444" filter="url(#glowMobile)" />
                    <text y="-22" textAnchor="middle" fill="#fca5a5" fontSize="10" fontWeight="600" letterSpacing="0.04em" fontFamily="IBM Plex Mono">
                      BARRIER
                    </text>
                    <text y="28" textAnchor="middle" fill="#94a3b8" fontSize="8.5" fontWeight="600" fontFamily="IBM Plex Mono">
                      BARRIER-17 DECAY
                    </text>
                  </g>

                  {/* Node 5: Facility Context */}
                  <g transform="translate(70,280)">
                    <circle r="13" fill="#0f172a" stroke="#64748b" strokeWidth="1.5" />
                    <circle r="4" fill="#64748b" />
                    <text y="-19" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="600" letterSpacing="0.04em" fontFamily="IBM Plex Mono">
                      FACILITY
                    </text>
                    <text y="24" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600" fontFamily="IBM Plex Mono">
                      Permian TK-402
                    </text>
                  </g>

                  {/* Node 4: SIF Risk / Intervention */}
                  <g transform="translate(150,330)">
                    <circle r="20" fill="#022c22" stroke="#10b981" strokeWidth="2" />
                    <circle r="7" fill="#10b981" filter="url(#glowMobile)" />
                    <text y="34" textAnchor="middle" fill="#a7f3d0" fontSize="10" fontWeight="600" letterSpacing="0.04em" fontFamily="IBM Plex Mono">
                      INTERVENTION
                    </text>
                    <text y="46" textAnchor="middle" fill="#6ee7b7" fontSize="8.5" fontWeight="600" fontFamily="IBM Plex Mono">
                      HUMAN SIGN-OFF (SWA)
                    </text>
                  </g>
                </svg>
              </div>

              {/* Micro Telemetry Footer */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono font-semibold tracking-wide text-slate-400">
                <span>
                  VEC-HASH: <span className="text-cyan-400">#8f01b-c12</span>
                </span>
                <span>
                  CLASSIFICATION: <span className="text-amber-400 font-semibold">CRITICAL PRECURSOR</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Trust / System Metrics Strip */}
        <div className="mt-16 sm:mt-20 pt-10 pb-6 border-t border-slate-800/90">
          <div className="text-center pb-6">
            <span className="text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase">
              [ Synthetic Demonstration Data • Continuous Ingest Protocol Active ]
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="p-6 rounded-lg bg-slate-900/40 border border-slate-800">
              <div className="text-3xl lg:text-4xl font-mono font-bold text-white">14</div>
              <div className="text-xs font-mono font-bold tracking-wider mt-1 text-cyan-400">FACILITIES MONITORED</div>
              <p className="text-[11px] text-slate-500 mt-1">Offshore Spars, Refineries & Inland Hubs</p>
            </div>
            <div className="p-6 rounded-lg bg-slate-900/40 border border-slate-800">
              <div className="text-3xl lg:text-4xl font-mono font-bold text-cyan-400">1,284</div>
              <div className="text-xs font-mono font-bold tracking-wider mt-1 text-slate-300">SAFETY EVENTS ANALYZED</div>
              <p className="text-[11px] text-slate-500 mt-1">Near-miss logs, PTW shifts & sensor feeds</p>
            </div>
            <div className="p-6 rounded-lg bg-slate-900/40 border border-slate-800">
              <div className="text-3xl lg:text-4xl font-mono font-bold text-amber-400">327</div>
              <div className="text-xs font-mono font-bold tracking-wider mt-1 text-slate-300">PRECURSOR PATTERNS</div>
              <p className="text-[11px] text-slate-500 mt-1">Classified across 9 Life-Saving Rules</p>
            </div>
            <div className="p-6 rounded-lg bg-slate-900/40 border border-slate-800">
              <div className="text-3xl lg:text-4xl font-mono font-bold text-emerald-400">96.4%</div>
              <div className="text-xs font-mono font-bold tracking-wider mt-1 text-slate-300">BARRIER COVERAGE</div>
              <p className="text-[11px] text-slate-500 mt-1">Dynamic Bowtie & SWA intervention rate</p>
            </div>
          </div>
        </div>
      </main>

      {/* Section 7: "How PRECURSOR-X Works" Pipeline */}
      <section id="how-it-works" className="py-16 sm:py-20 lg:py-24 relative z-10 border-t border-slate-800/80 bg-[#090d16]/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16 space-y-3">
            <span className="text-xs font-mono font-bold tracking-wide px-3 py-1 rounded bg-slate-800/80 text-cyan-400 border border-slate-700">
              OPERATIONAL PROCESS
            </span>
            <h2 className="font-headline text-3xl sm:text-4xl font-bold tracking-tight text-white">
              FROM EVENT DATA
              <br />
              TO PREVENTIVE ACTION.
            </h2>
            <p className="text-sm sm:text-base text-slate-400 font-normal">
              A closed-loop early warning architecture that ingests operational signals and converts subtle systemic deviations into certified risk interventions.
            </p>
          </div>

          {/* 5-Stage Connected Pipeline.
              Mobile (<md): horizontal snap-scroll carousel — each card keeps its full
              desktop padding/typography and just gets its own comfortably-wide slide,
              instead of being squeezed into a 5-up row or scaled down.
              Tablet/desktop (md+): unchanged 5-column grid. */}
          <div
            className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth -mx-4 px-4 pb-2
                       md:grid md:grid-cols-5 md:gap-4 md:overflow-visible md:snap-none md:mx-0 md:px-0 md:pb-0
                       relative [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {/* Stage 01 */}
            <div className="shrink-0 w-[82%] sm:w-[60%] md:w-auto snap-center p-5 rounded-lg border border-slate-800 bg-[#0f131c]/80 flex flex-col justify-between hover:border-cyan-500/50 transition-all group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl font-mono font-extrabold text-cyan-400">01</span>
                  <span className="text-[10px] font-mono font-bold tracking-wide px-2 py-0.5 rounded bg-slate-800 text-slate-400">INGEST</span>
                </div>
                <h3 className="text-base font-bold text-white mb-2 group-hover:text-cyan-300 transition-colors">
                  OBSERVE
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Collect incident reports, near-miss descriptions, PTW handovers, and sniffer telemetry across all active shifts.
                </p>
              </div>
              <div className="mt-6 pt-3 border-t border-slate-800/80 text-[10px] font-mono font-semibold text-slate-500">
                SOURCE: FIELD NLP & SENSORS
              </div>
            </div>

            {/* Stage 02 */}
            <div className="shrink-0 w-[82%] sm:w-[60%] md:w-auto snap-center p-5 rounded-lg border border-slate-800 bg-[#0f131c]/80 flex flex-col justify-between hover:border-cyan-500/50 transition-all group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl font-mono font-extrabold text-cyan-400">02</span>
                  <span className="text-[10px] font-mono font-bold tracking-wide px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    DECOMPOSE
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mb-2 group-hover:text-cyan-300 transition-colors">
                  EXTRACT
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Identify hazards, latent precursors, barrier states, and Life-Saving Rule breaches with causal token attribution.
                </p>
              </div>
              <div className="mt-6 pt-3 border-t border-slate-800/80 text-[10px] font-mono font-semibold text-slate-500">
                NLP TOKEN ATTRIBUTION
              </div>
            </div>

            {/* Stage 03 */}
            <div className="shrink-0 w-[82%] sm:w-[60%] md:w-auto snap-center p-5 rounded-lg border border-slate-800 bg-[#0f131c]/80 flex flex-col justify-between hover:border-cyan-500/50 transition-all group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl font-mono font-extrabold text-cyan-400">03</span>
                  <span className="text-[10px] font-mono font-bold tracking-wide px-2 py-0.5 rounded bg-slate-800 text-slate-400">RELATE</span>
                </div>
                <h3 className="text-base font-bold text-white mb-2 group-hover:text-cyan-300 transition-colors">
                  CONNECT
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Link events, hardware assets, contractor shifts, and barrier states through the Relational Safety Knowledge Graph.
                </p>
              </div>
              <div className="mt-6 pt-3 border-t border-slate-800/80 text-[10px] font-mono font-semibold text-slate-500">
                GRAPH ONTOLOGY ENGINE
              </div>
            </div>

            {/* Stage 04 */}
            <div className="shrink-0 w-[82%] sm:w-[60%] md:w-auto snap-center p-5 rounded-lg border border-amber-500/40 bg-[#16131c]/80 flex flex-col justify-between hover:border-amber-400 transition-all group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl font-mono font-extrabold text-amber-400">04</span>
                  <span className="text-[10px] font-mono font-bold tracking-wide px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-500/30">
                    ANALYTICS
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mb-2 group-hover:text-amber-300 transition-colors">
                  INTELLIGENCE
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Detect velocity shifts, recurring pattern genomes, turnaround surge vulnerabilities, and SIF escalation vectors.
                </p>
              </div>
              <div className="mt-6 pt-3 border-t border-slate-800/80 text-[10px] font-mono font-semibold text-amber-400/80">
                BAYESIAN SIF MODELING
              </div>
            </div>

            {/* Stage 05 */}
            <div className="shrink-0 w-[82%] sm:w-[60%] md:w-auto snap-center p-5 rounded-lg border border-emerald-500/40 bg-[#0c1a1a]/80 flex flex-col justify-between hover:border-emerald-400 transition-all group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl font-mono font-extrabold text-emerald-400">05</span>
                  <span className="text-[10px] font-mono font-bold tracking-wide px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                    DISPATCH
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mb-2 group-hover:text-emerald-300 transition-colors">
                  INTERVENE
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Route actionable findings to immediate SWA stand-downs, automated sentry audits, CAPA triggers, and specialist sign-off.
                </p>
              </div>
              <div className="mt-6 pt-3 border-t border-slate-800/80 text-[10px] font-mono font-semibold text-emerald-400/80">
                HUMAN SIGN-OFF & DISPATCH
              </div>
            </div>
          </div>

          {/* Swipe affordance — mobile/tablet only, hidden once the grid takes over at md+ */}
          <div className="md:hidden text-center mt-4">
            <span className="text-[10px] font-mono font-semibold tracking-widest text-slate-500">
              ← SWIPE TO EXPLORE STAGES →
            </span>
          </div>
        </div>
      </section>

      {/* Section 8: Platform Capabilities */}
      <section id="capabilities" className="py-24 relative z-10 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-16">
            <div>
              <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest">Enterprise Modules</span>
              <h2 className="font-headline text-3xl sm:text-4xl font-bold tracking-tight text-white mt-1">
                ONE SAFETY INTELLIGENCE LAYER.
              </h2>
            </div>
            <p className="text-sm text-slate-400 max-w-md mt-4 md:mt-0 font-normal">
              Six dedicated operational telemetry engines delivering end-to-end risk detection across complex industrial infrastructure.
            </p>
          </div>

          {/* 6 Capability Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div
              onClick={() => handleCapabilityClick('/report-analyzer')}
              className="p-6 rounded-lg border border-slate-800 bg-[#0f131c]/90 hover:border-cyan-500/50 hover:bg-[#131926]/90 transition-all duration-300 group flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="w-10 h-10 rounded border border-cyan-500/30 bg-cyan-950/40 text-cyan-400 flex items-center justify-center mb-4 group-hover:border-cyan-400 transition-colors">
                  <FileSearch className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
                  REPORT ANALYZER
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  NLP-driven incident and near-miss analysis. Ingests raw shift descriptions, isolates SIF precursors, and calculates Bayesian fatality likelihood with token-level causal attribution.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono font-semibold tracking-wide text-cyan-400">
                <span className="text-[11px] text-slate-500">MODULE // R1-NLP</span>
                <span className="group-hover:translate-x-1 transition-transform flex items-center">EXPLORE &rarr;</span>
              </div>
            </div>

            {/* Card 2 */}
            <div
              onClick={() => handleCapabilityClick('/safety-dna')}
              className="p-6 rounded-lg border border-slate-800 bg-[#0f131c]/90 hover:border-cyan-500/50 hover:bg-[#131926]/90 transition-all duration-300 group flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="w-10 h-10 rounded border border-cyan-500/30 bg-cyan-950/40 text-cyan-400 flex items-center justify-center mb-4 group-hover:border-cyan-400 transition-colors">
                  <Dna className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">SAFETY DNA</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Discover recurring precursor patterns and causal chains. Clusters unstructured field reports into systemic genomic triads, identifying hidden behavioral variances before barrier collapse.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono font-semibold tracking-wide text-cyan-400">
                <span className="text-[11px] text-slate-500">MODULE // DNA-GEN</span>
                <span className="group-hover:translate-x-1 transition-transform flex items-center">EXPLORE &rarr;</span>
              </div>
            </div>

            {/* Card 3 */}
            <div
              onClick={() => handleCapabilityClick('/safety-memory')}
              className="p-6 rounded-lg border border-slate-800 bg-[#0f131c]/90 hover:border-cyan-500/50 hover:bg-[#131926]/90 transition-all duration-300 group flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="w-10 h-10 rounded border border-cyan-500/30 bg-cyan-950/40 text-cyan-400 flex items-center justify-center mb-4 group-hover:border-cyan-400 transition-colors">
                  <Database className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
                  SAFETY MEMORY
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Search institutional safety knowledge and historical precedents. High-dimensional vector retrieval matches active field situations against historical near-misses and proven CAPA remedies.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono font-semibold tracking-wide text-cyan-400">
                <span className="text-[11px] text-slate-500">MODULE // VEC-CORPUS</span>
                <span className="group-hover:translate-x-1 transition-transform flex items-center">EXPLORE &rarr;</span>
              </div>
            </div>

            {/* Card 4 */}
            <div
              onClick={() => handleCapabilityClick('/knowledge-graph')}
              className="p-6 rounded-lg border border-slate-800 bg-[#0f131c]/90 hover:border-cyan-500/50 hover:bg-[#131926]/90 transition-all duration-300 group flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="w-10 h-10 rounded border border-cyan-500/30 bg-cyan-950/40 text-cyan-400 flex items-center justify-center mb-4 group-hover:border-cyan-400 transition-colors">
                  <Share2 className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
                  KNOWLEDGE GRAPH
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Connect hazards, barriers, assets, events, and safety outcomes. A relational ontology mapping every tracked entity and its dependencies to calculate degree centrality and cascading failure probability.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono font-semibold tracking-wide text-cyan-400">
                <span className="text-[11px] text-slate-500">MODULE // ONTOLOGY-V4</span>
                <span className="group-hover:translate-x-1 transition-transform flex items-center">EXPLORE &rarr;</span>
              </div>
            </div>

            {/* Card 5 */}
            <div
              onClick={() => handleCapabilityClick('/risk-intelligence')}
              className="p-6 rounded-lg border border-slate-800 bg-[#0f131c]/90 hover:border-cyan-500/50 hover:bg-[#131926]/90 transition-all duration-300 group flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="w-10 h-10 rounded border border-cyan-500/30 bg-cyan-950/40 text-cyan-400 flex items-center justify-center mb-4 group-hover:border-cyan-400 transition-colors">
                  <Gauge className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
                  RISK INTELLIGENCE
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Monitor risk density, facility exposure, and precursor velocity. Interactive 5×5 consequence severity matrix isolating site-specific barrier health against global industry benchmarks.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono font-semibold tracking-wide text-cyan-400">
                <span className="text-[11px] text-slate-500">MODULE // MATRIX-5X5</span>
                <span className="group-hover:translate-x-1 transition-transform flex items-center">EXPLORE &rarr;</span>
              </div>
            </div>

            {/* Card 6 */}
            <div
              onClick={() => handleCapabilityClick('/interventions')}
              className="p-6 rounded-lg border border-slate-800 bg-[#0f131c]/90 hover:border-cyan-500/50 hover:bg-[#131926]/90 transition-all duration-300 group flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="w-10 h-10 rounded border border-cyan-500/30 bg-cyan-950/40 text-cyan-400 flex items-center justify-center mb-4 group-hover:border-cyan-400 transition-colors">
                  <BellRing className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
                  INTERVENTIONS & CAPA
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Convert intelligence into preventive action and CAPA workflows. Dispatch targeted sentry audits, trigger Stop Work Authority protocols, and track post-intervention barrier recovery.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono font-semibold tracking-wide text-cyan-400">
                <span className="text-[11px] text-slate-500">MODULE // CAPA-DISPATCH</span>
                <span className="group-hover:translate-x-1 transition-transform flex items-center">EXPLORE &rarr;</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 9: Intelligence Visualization (Risk Changes Run Chart) */}
      <section id="risk-telemetry" className="py-24 relative z-10 border-t border-slate-800/80 bg-[#0c101a]/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
            <span className="text-xs font-mono font-bold tracking-wide px-3 py-1 rounded bg-slate-800 text-cyan-400 border border-slate-700">
              TEMPORAL SIF DYNAMICS
            </span>
            <h2 className="font-headline text-3xl sm:text-4xl font-bold tracking-tight text-white">
              UNDERSTAND HOW RISK CHANGES.
            </h2>
            <p className="text-sm text-slate-400 font-normal">
              Visualize the continuous progression from quiet baseline drift to critical precursor acceleration, followed by immediate preventive recovery.
            </p>
          </div>

          {/* High-Fidelity Technical Telemetry Chart */}
          <div className="p-6 rounded-xl border border-slate-800 bg-[#0f131c] shadow-2xl relative">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-800 text-xs font-mono font-semibold tracking-wide text-slate-400">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                <span className="text-white font-semibold">RUN CHART: SIF DENSITY vs BARRIER DECAY</span>
                <span className="text-slate-600">//</span>
                <span>TARGET: US-GULF-03 (Suite B TK-402)</span>
              </div>
              <div className="flex items-center space-x-4 mt-2 sm:mt-0">
                <span className="text-cyan-400">12-WEEK CYCLE</span>
                <span className="text-slate-500">•</span>
                <span>CONFIDENCE: 99.4%</span>
              </div>
            </div>

            {/* SVG Chart Container */}
            <div className="relative w-full h-80 sm:h-96">
              <svg viewBox="0 0 1000 360" className="w-full h-full" preserveAspectRatio="none">
                {/* Grid Lines */}
                <line x1="80" y1="60" x2="960" y2="60" stroke="#1e293b" strokeDasharray="3 3" />
                <line x1="80" y1="120" x2="960" y2="120" stroke="#1e293b" strokeDasharray="3 3" />
                <line x1="80" y1="180" x2="960" y2="180" stroke="#1e293b" strokeDasharray="3 3" />
                <line x1="80" y1="240" x2="960" y2="240" stroke="#1e293b" strokeDasharray="3 3" />

                {/* Y Axis Labels */}
                <text x="70" y="64" textAnchor="end" fill="#ef4444" fontSize="11" fontFamily="IBM Plex Mono">
                  CRITICAL (180)
                </text>
                <text x="70" y="124" textAnchor="end" fill="#f59e0b" fontSize="11" fontFamily="IBM Plex Mono">
                  ELEVATED (120)
                </text>
                <text x="70" y="184" textAnchor="end" fill="#94a3b8" fontSize="11" fontFamily="IBM Plex Mono">
                  NOMINAL (60)
                </text>
                <text x="70" y="244" textAnchor="end" fill="#64748b" fontSize="11" fontFamily="IBM Plex Mono">
                  BASELINE (0)
                </text>

                {/* Risk Escalation Upper Limit Threshold */}
                <line
                  x1="80"
                  y1="100"
                  x2="960"
                  y2="100"
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  opacity="0.6"
                />
                <text x="950" y="92" textAnchor="end" fill="#ef4444" fontSize="10" fontFamily="IBM Plex Mono">
                  EXECUTIVE RISK LIMIT (150 SIF UNITS)
                </text>

                {/* Curve Gradient */}
                <defs>
                  <linearGradient id="curveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Shaded Area Under Curve */}
                <path
                  d="M 80 240 Q 250 230, 420 180 T 580 70 T 700 230 T 960 240 L 960 250 L 80 250 Z"
                  fill="url(#curveGradient)"
                />

                {/* Smooth Telemetry Curve */}
                <path
                  d="M 80 240 Q 250 230, 420 180 T 580 70 T 700 230 T 960 240"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="3.5"
                />

                {/* Breach Spike Segment (Restrained Red/Orange) */}
                <path d="M 540 100 Q 565 60, 600 75" fill="none" stroke="#ef4444" strokeWidth="4" />

                {/* Data Point Nodes */}
                <circle cx="80" cy="240" r="5" fill="#38bdf8" />
                <circle cx="250" cy="230" r="5" fill="#38bdf8" />
                <circle cx="420" cy="180" r="6" fill="#f59e0b" />
                <circle cx="580" cy="70" r="8" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
                <circle cx="700" cy="230" r="6" fill="#10b981" />
                <circle cx="850" cy="238" r="5" fill="#38bdf8" />
                <circle cx="960" cy="240" r="5" fill="#38bdf8" />

                {/* Vertical Preventive Intervention Marker */}
                <line x1="580" y1="40" x2="580" y2="280" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 2" />

                <g transform="translate(580, 40)">
                  <rect
                    x="-85"
                    y="-28"
                    width="170"
                    height="26"
                    rx="4"
                    fill="#0f172a"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                  />
                  <text
                    x="0"
                    y="-11"
                    textAnchor="middle"
                    fill="#38bdf8"
                    fontSize="10"
                    fontWeight="bold"
                    fontFamily="IBM Plex Mono"
                  >
                    PREVENTIVE ACTION DEPLOYED
                  </text>
                </g>

                <text x="580" y="85" textAnchor="middle" fill="#fca5a5" fontSize="9" fontFamily="IBM Plex Mono">
                  SURGE: W06 (168 SIF)
                </text>

                {/* X Axis Weeks */}
                <text x="140" y="275" textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="IBM Plex Mono">
                  W01 Baseline
                </text>
                <text x="280" y="275" textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="IBM Plex Mono">
                  W03 Drift
                </text>
                <text x="440" y="275" textAnchor="middle" fill="#f59e0b" fontSize="10" fontFamily="IBM Plex Mono">
                  W05 Precursor Acceleration
                </text>
                <text x="580" y="275" textAnchor="middle" fill="#ef4444" fontSize="10" fontFamily="IBM Plex Mono">
                  W06 SWA Dispatch
                </text>
                <text x="730" y="275" textAnchor="middle" fill="#10b981" fontSize="10" fontFamily="IBM Plex Mono">
                  W09 Stabilization
                </text>
                <text x="890" y="275" textAnchor="middle" fill="#38bdf8" fontSize="10" fontFamily="IBM Plex Mono">
                  W12 Safe State
                </text>
              </svg>
            </div>

            {/* Legend / Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-slate-800 text-xs font-mono font-semibold">
              <div className="p-3 rounded bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 block mb-1">STAGE 1:</span>
                <div className="text-white font-semibold">Precursor Drift (+34.2%)</div>
                <p className="text-[11px] text-slate-500 mt-1 font-sans">
                  Secondary gas sniffer bypass detected across 3 consecutive shift changeovers.
                </p>
              </div>
              <div className="p-3 rounded bg-rose-950/20 border border-rose-900/40">
                <span className="text-rose-400 block mb-1">STAGE 2:</span>
                <div className="text-white font-semibold">Critical Breach Window</div>
                <p className="text-[11px] text-slate-400 mt-1 font-sans">
                  Unverified LOTO tagout + confined space entry combined with nitrogen purge.
                </p>
              </div>
              <div className="p-3 rounded bg-emerald-950/20 border border-emerald-900/40">
                <span className="text-emerald-400 block mb-1">STAGE 3:</span>
                <div className="text-white font-semibold">Rapid Mitigation (-38.4%)</div>
                <p className="text-[11px] text-slate-400 mt-1 font-sans">
                  HSE Specialist dispatch & mandatory 48-hour sniffer barrier restoration verified.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 10: Knowledge Graph Showcase */}
      <section className="py-24 relative z-10 border-t border-slate-800/80 bg-[#090d16]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 space-y-6">
              <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest">Safety Ontology</span>
              <h2 className="font-headline text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
                CONNECTING EVIDENCE
                <br />
                INTO A RELATIONAL MODEL.
              </h2>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed font-normal">
                Industrial incidents never occur in a vacuum. PRECURSOR-X maps the hidden dependencies between physical facilities, active hazards, latent precursors, engineered barriers, human actions, and SIF outcomes.
              </p>

              <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 font-mono text-xs space-y-2">
                <div className="text-cyan-400 font-semibold mb-1">GRAPH TOPOLOGY TELEMETRY:</div>
                <div className="flex justify-between text-slate-400">
                  <span>Active Entities:</span>
                  <span className="text-white font-bold">
                    {graphSummaryStatus === 'ready' && graphSummary
                      ? `${graphSummary.nodeCount.toLocaleString()} Relational Nodes`
                      : graphSummaryStatus === 'error'
                      ? 'Unavailable'
                      : 'Loading…'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Causal Dependencies:</span>
                  <span className="text-white font-bold">
                    {graphSummaryStatus === 'ready' && graphSummary
                      ? `${graphSummary.edgeCount.toLocaleString()} Weighted Edges`
                      : graphSummaryStatus === 'error'
                      ? 'Unavailable'
                      : 'Loading…'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Centrality Hub:</span>
                  <span className="text-amber-400 font-bold">
                    {graphSummaryStatus === 'loading'
                      ? 'Loading…'
                      : graphSummary?.centralityHub
                      ? `${graphSummary.centralityHub.label} (${graphSummary.centralityHub.score.toFixed(2)} Rank)`
                      : 'Unavailable'}
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <a
                  href="#human-governance"
                  className="inline-flex items-center space-x-2 text-cyan-400 hover:text-cyan-300 font-mono font-bold text-xs tracking-wider"
                >
                  <span>EXPLORE THE SAFETY ONTOLOGY ENGINE</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Graph Visual Representation */}
            <div className="lg:col-span-7">
              <div className="rounded-xl border border-slate-800 bg-[#0f131c] p-6 shadow-2xl relative overflow-hidden">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs font-mono font-semibold tracking-wide text-slate-400">
                  <span>ONTOLOGY CANVASS // FORCE-DIRECTED (ILLUSTRATIVE SYNTHETIC TOPOLOGY)</span>
                  <span className="text-cyan-400">
                    {graphSummaryStatus === 'ready' && graphSummary && graphSummary.density !== null
                      ? `GRAPH DENSITY: ${graphSummary.density.toFixed(3)} ${graphSummary.densityLabel}`
                      : graphSummaryStatus === 'error'
                      ? 'GRAPH DENSITY: UNAVAILABLE'
                      : 'GRAPH DENSITY: LOADING…'}
                  </span>
                </div>

                <div className="py-8 flex items-center justify-center">
                  <svg viewBox="0 0 540 360" className="w-full h-auto">
                    {/* Relational Lines */}
                    <line
                      x1="270"
                      y1="180"
                      x2="160"
                      y2="100"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                    <line x1="270" y1="180" x2="380" y2="110" stroke="#ef4444" strokeWidth="2" />
                    <line x1="270" y1="180" x2="420" y2="240" stroke="#f59e0b" strokeWidth="1.5" />
                    <line x1="270" y1="180" x2="320" y2="300" stroke="#10b981" strokeWidth="1.5" />
                    <line x1="270" y1="180" x2="140" y2="250" stroke="#38bdf8" strokeWidth="1.5" />
                    <line
                      x1="160"
                      y1="100"
                      x2="380"
                      y2="110"
                      stroke="#64748b"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <line x1="380" y1="110" x2="420" y2="240" stroke="#ef4444" strokeWidth="1" />

                    {/* Central Hub Node: Precursor Cluster */}
                    <g transform="translate(270,180)">
                      <circle r="36" fill="#0f172a" stroke="#38bdf8" strokeWidth="3" />
                      <circle r="14" fill="#38bdf8" opacity="0.8" />
                      <text
                        y="4"
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="11"
                        fontWeight="bold"
                        fontFamily="IBM Plex Mono"
                      >
                        CSE-402
                      </text>
                      <text y="48" textAnchor="middle" fill="#38bdf8" fontSize="9" fontFamily="IBM Plex Mono">
                        CSE Primary Hub
                      </text>
                    </g>

                    {/* Node: Facility */}
                    <g transform="translate(160,100)">
                      <circle r="18" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
                      <text y="4" textAnchor="middle" fill="#e2e8f0" fontSize="9" fontFamily="IBM Plex Mono">
                        Site B
                      </text>
                      <text y="-25" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="IBM Plex Mono">
                        FACILITY
                      </text>
                    </g>

                    {/* Node: Hazard */}
                    <g transform="translate(380,110)">
                      <circle r="22" fill="#450a0a" stroke="#ef4444" strokeWidth="2" />
                      <circle r="6" fill="#ef4444" />
                      <text
                        y="4"
                        textAnchor="middle"
                        fill="#fca5a5"
                        fontSize="9"
                        fontWeight="bold"
                        fontFamily="IBM Plex Mono"
                      >
                        H2S Pocket
                      </text>
                      <text y="-28" textAnchor="middle" fill="#ef4444" fontSize="8" fontFamily="IBM Plex Mono">
                        Toxic H2S Hazard
                      </text>
                    </g>

                    {/* Node: Precursor */}
                    <g transform="translate(420,240)">
                      <circle r="20" fill="#451a03" stroke="#f59e0b" strokeWidth="2" />
                      <circle r="5" fill="#f59e0b" />
                      <text y="4" textAnchor="middle" fill="#fde68a" fontSize="9" fontFamily="IBM Plex Mono">
                        Sniff Bypass
                      </text>
                      <text y="32" textAnchor="middle" fill="#f59e0b" fontSize="8" fontFamily="IBM Plex Mono">
                        Sniff Omission
                      </text>
                    </g>

                    {/* Node: Barrier Decayed */}
                    <g transform="translate(320,300)">
                      <circle r="18" fill="#1e293b" stroke="#ef4444" strokeWidth="2" />
                      <text y="4" textAnchor="middle" fill="#f87171" fontSize="8" fontFamily="IBM Plex Mono">
                        LOTO Defect
                      </text>
                      <text y="28" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="IBM Plex Mono">
                        LOTO Mechanical
                      </text>
                    </g>

                    {/* Node: SWA Mitigation */}
                    <g transform="translate(140,250)">
                      <circle r="20" fill="#064e3b" stroke="#10b981" strokeWidth="2" />
                      <circle r="5" fill="#10b981" />
                      <text y="4" textAnchor="middle" fill="#a7f3d0" fontSize="9" fontFamily="IBM Plex Mono">
                        SWA Halt
                      </text>
                      <text y="32" textAnchor="middle" fill="#10b981" fontSize="8" fontFamily="IBM Plex Mono">
                        Sentry Intervention
                      </text>
                    </g>
                  </svg>
                </div>

                <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono font-semibold tracking-wide text-slate-400">
                  <div className="flex items-center space-x-4">
                    <span className="flex items-center">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 mr-1.5"></span>Hub / Precursor
                    </span>
                    <span className="flex items-center">
                      <span className="w-2 h-2 rounded-full bg-rose-500 mr-1.5"></span>Hazard / SIF
                    </span>
                    <span className="flex items-center">
                      <span className="w-2 h-2 rounded-full bg-amber-400 mr-1.5"></span>LSR Rule
                    </span>
                  </div>
                  <span className="text-slate-500">RELATIONAL V4.8</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 11: Human-in-the-Loop Governance */}
      <section id="human-governance" className="py-24 relative z-10 border-t border-slate-800/80 bg-[#090d16]/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-mono font-bold tracking-wide px-3 py-1 rounded bg-slate-800 text-cyan-400 border border-slate-700">
              REGULATORY RIGOR & ETHICS
            </span>
            <h2 className="font-headline text-3xl sm:text-4xl font-bold tracking-tight text-white">
              INTELLIGENCE WITH
              <br />
              HUMAN OVERSIGHT.
            </h2>
            <p className="text-sm sm:text-base text-slate-400 font-normal">
              PRECURSOR-X is engineered to empower safety directors and operational specialists — never to replace them. Accredited human certification is required before committing to the institutional safety ledger.
            </p>
          </div>

          {/* Human Verification Workflow Stages */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-12">
            <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs font-mono font-bold tracking-wide text-cyan-400 mb-1">01. INGEST</div>
              <div className="font-bold text-white text-sm">AI DETECTION</div>
              <p className="text-[11px] text-slate-400 mt-2">NLP Token flagging & Bayesian score</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs font-mono font-bold tracking-wide text-cyan-400 mb-1">02. REVIEW</div>
              <div className="font-bold text-white text-sm">SPECIALIST AUDIT</div>
              <p className="text-[11px] text-slate-400 mt-2">HSE Officer inspects token weights</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs font-mono font-bold tracking-wide text-cyan-400 mb-1">03. TUNE</div>
              <div className="font-bold text-white text-sm">CALIBRATION</div>
              <p className="text-[11px] text-slate-400 mt-2">Human override & rule mapping</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs font-mono font-bold tracking-wide text-cyan-400 mb-1">04. RECORD</div>
              <div className="font-bold text-white text-sm">CERTIFICATION</div>
              <p className="text-[11px] text-slate-400 mt-2">SHA-256 cryptographic sign-off</p>
            </div>
            <div className="p-4 rounded-lg bg-emerald-950/30 border border-emerald-800/50 text-center">
              <div className="text-xs font-mono font-bold tracking-wide text-emerald-400 mb-1">05. SECURE</div>
              <div className="font-bold text-white text-sm">PREVENTIVE ACTION</div>
              <p className="text-[11px] text-slate-300 mt-2">Site-wide barrier mandate executed</p>
            </div>
          </div>

          {/* Human Review Screen Preview Dock */}
          <div className="p-6 rounded-xl border border-slate-800 bg-[#0f131c] shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 text-xs font-mono">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                <span className="text-white font-semibold">HSE SPECIALIST GOVERNANCE DOCK</span>
                <span className="text-slate-600">//</span>
                <span className="text-cyan-400">Lead HSE Marcus Vance (#HSE-094)</span>
              </div>
              <span className="text-slate-400">SHA256: 9f8a3c...b02e77 [VERIFIED]</span>
            </div>

            <div className="py-6 grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-8 p-4 rounded bg-slate-900/80 border border-slate-800 font-mono text-xs text-slate-300 leading-relaxed">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-semibold">
                  Incident Narrative Inspection:
                </div>
                "...Isolation valve V-12 tagged with plastic hazard tape but{' '}
                <span className="bg-rose-950/80 text-rose-300 px-1 border border-rose-800 rounded font-semibold">
                  not mechanically locked with padlock
                </span>
                . HSE Supervisor halted operations immediately (
                <span className="bg-cyan-950/80 text-cyan-300 px-1 border border-cyan-800 rounded">SWA triggered</span>
                )."
              </div>

              <div className="md:col-span-4 p-4 rounded bg-slate-900/80 border border-slate-800 font-mono text-xs space-y-3">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-semibold">
                  Human Disposition & Calibration:
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">AI Inferred SIF:</span>
                  <span className="text-rose-400 font-bold">High (87.4%)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Human Override:</span>
                  <span className="text-emerald-400 font-bold">CONFIRMED (Critical)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Dispatched CAPA:</span>
                  <span className="text-cyan-400 font-bold">CAPA-098 Mandatory Sniff Audit</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs font-mono font-semibold tracking-wide">
              <span className="text-slate-500 mb-2 sm:mb-0">GOVERNANCE PROTOCOL P-77 COMPLIANT</span>
              <button
                onClick={handleEnterPlatform}
                className="px-4 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-all shadow-[0_0_12px_rgba(56,189,248,0.3)] cursor-pointer"
              >
                ACCEPT & COMMIT TO SAFETY LEDGER
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 12: Final CTA */}
      <section className="py-24 relative z-10 border-t border-slate-800/80 bg-gradient-to-b from-[#090d16] to-[#04060a]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-semibold tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
            <span>NEXT-GENERATION INDUSTRIAL SAFETY OS</span>
          </div>

          <h2 className="font-headline text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            TURN SAFETY SIGNALS
            <br />
            <span className="text-gradient-highlight">INTO PREVENTIVE ACTION.</span>
          </h2>

          <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto font-normal">
            Explore PRECURSOR-X and discover how operational safety intelligence moves organizations from reactive incident reporting toward proactive, high-reliability barrier protection.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center space-y-3 sm:space-y-0 sm:space-x-4">
            <button
              onClick={handleEnterPlatform}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-8 py-3.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-sm tracking-wide transition-all shadow-[0_0_25px_rgba(56,189,248,0.4)] cursor-pointer"
            >
              <span>ENTER PLATFORM</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={openRegisterModal}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-8 py-3.5 rounded border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-mono font-semibold tracking-wide text-sm transition-all bg-slate-900/60 cursor-pointer"
            >
              <span>REQUEST ACCESS</span>
            </button>
          </div>

          <div className="text-[11px] font-mono font-semibold tracking-wide text-slate-500 pt-6">
            HIGH-RELIABILITY ARCHITECTURE • ZERO COMPROMISE PRIVACY • SOC-2 TYPE II READY
          </div>
        </div>
      </section>

      {/* Section 13: Footer */}
      <footer className="border-t border-slate-800 bg-[#060910] text-slate-400 text-xs py-14 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            {/* Brand Info */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded border border-cyan-500/40 bg-cyan-950 flex items-center justify-center text-cyan-400">
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <span className="font-mono font-bold tracking-wide text-white text-sm">PRECURSOR-X</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                Operational Safety Intelligence & High-Reliability Precursor Analytics for Energy, Industrial, and Critical Infrastructure.
              </p>
              <div className="pt-2 font-mono font-semibold tracking-wide text-[10px] text-slate-400 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>SYSTEM ONLINE v4.8</span>
              </div>
            </div>

            {/* Links 1 */}
            <div>
              <div className="font-mono text-white text-xs font-bold mb-3 tracking-wider">PLATFORM</div>
              <ul className="space-y-2 font-sans">
                <li>
                  <button onClick={() => handleCapabilityClick('/dashboard')} className="hover:text-cyan-400 transition-colors cursor-pointer text-left">
                    Executive Dashboard
                  </button>
                </li>
                <li>
                  <button onClick={() => handleCapabilityClick('/report-analyzer')} className="hover:text-cyan-400 transition-colors cursor-pointer text-left">
                    Report Analyzer
                  </button>
                </li>
                <li>
                  <button onClick={() => handleCapabilityClick('/risk-intelligence')} className="hover:text-cyan-400 transition-colors cursor-pointer text-left">
                    Risk Intelligence
                  </button>
                </li>
                <li>
                  <button onClick={() => handleCapabilityClick('/safety-dna')} className="hover:text-cyan-400 transition-colors cursor-pointer text-left">
                    Safety DNA
                  </button>
                </li>
              </ul>
            </div>

            {/* Links 2 */}
            <div>
              <div className="font-mono text-white text-xs font-bold mb-3 tracking-wider">INTELLIGENCE</div>
              <ul className="space-y-2 font-sans">
                <li>
                  <button onClick={() => handleCapabilityClick('/what-changed')} className="hover:text-cyan-400 transition-colors cursor-pointer text-left">
                    Precursor Velocity
                  </button>
                </li>
                <li>
                  <button onClick={() => handleCapabilityClick('/knowledge-graph')} className="hover:text-cyan-400 transition-colors cursor-pointer text-left">
                    Knowledge Graph
                  </button>
                </li>
                <li>
                  <button onClick={() => handleCapabilityClick('/human-review')} className="hover:text-cyan-400 transition-colors cursor-pointer text-left">
                    Human Governance
                  </button>
                </li>
                <li>
                  <button onClick={() => handleCapabilityClick('/interventions')} className="hover:text-cyan-400 transition-colors cursor-pointer text-left">
                    CAPA Dispatch
                  </button>
                </li>
              </ul>
            </div>

            {/* Links 3 */}
            <div>
              <div className="font-mono text-white text-xs font-bold mb-3 tracking-wider">COMPLIANCE</div>
              <ul className="space-y-2 font-sans">
                <li>
                  <a href="#how-it-works" className="hover:text-cyan-400 transition-colors">
                    IOGP Report 459
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="hover:text-cyan-400 transition-colors">
                    ISO-45001 OH&S
                  </a>
                </li>
                <li>
                  <a href="#human-governance" className="hover:text-cyan-400 transition-colors">
                    Protocol P-77 Ledger
                  </a>
                </li>
                <li>
                  <a href="#risk-telemetry" className="hover:text-cyan-400 transition-colors">
                    Security Standards
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono font-semibold tracking-wide text-slate-500">
            <div>&copy; 2025 PRECURSOR-X Safety Intelligence Platform. All rights reserved.</div>
            <div className="mt-2 sm:mt-0 flex space-x-6">
              <span className="text-cyan-500/80">DEMO ENVIRONMENT • SYNTHETIC DATA</span>
              <a href="#" className="hover:text-slate-300">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-slate-300">
                Terms of Telemetry
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
