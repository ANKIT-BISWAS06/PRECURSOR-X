import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, API_BASE_URL } from '../services/api';
import { useAuth } from '../auth/AuthProvider';
import { ErrorBoundary } from '../components/ErrorBoundary';

export const AppShell: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Notifications & Settings popups
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Dynamic review badge count - Initialized to 0, populated strictly from backend
  const [pendingReviewsCount, setPendingReviewsCount] = useState<number>(0);

  // Truthful FastAPI backend health connectivity state
  const [backendHealth, setBackendHealth] = useState<{
    status: 'checking' | 'connected' | 'offline';
    version?: string;
    error?: string;
  }>({ status: 'checking' });

  const verifyBackendHealth = async () => {
    try {
      const res = await api.checkHealth();
      setBackendHealth({ status: 'connected', version: res.version });
    } catch (err: any) {
      setBackendHealth({
        status: 'offline',
        error: err.message || 'Cannot reach the safety intelligence service.'
      });
    }
  };

  useEffect(() => {
    verifyBackendHealth();
    const interval = setInterval(verifyBackendHealth, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadBadge() {
      try {
        const queue = await api.getReviewQueue();
        const pending = queue.filter((q) => q.status === 'PENDING_REVIEW').length;
        setPendingReviewsCount(pending);
      } catch (e) {
        // Ignored if offline
      }
    }
    loadBadge();
  }, [location.pathname]);

  // Global search handler
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const res = await api.globalSearch(searchQuery);
      setSearchResults(res);
      setIsSearching(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Keyboard shortcut '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      } else if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setShowNotifications(false);
        setShowSettings(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { label: 'Report Analyzer', path: '/report-analyzer', icon: 'analytics' },
    { label: 'Risk Intelligence', path: '/risk-intelligence', icon: 'radar' },
    { label: 'Safety DNA', path: '/safety-dna', icon: 'fingerprint' },
    { label: 'Safety Memory', path: '/safety-memory', icon: 'neurology' },
    { label: 'Knowledge Graph', path: '/knowledge-graph', icon: 'hub' },
    { label: 'What Changed?', path: '/what-changed', icon: 'history_toggle_off' },
    { label: 'Interventions', path: '/interventions', icon: 'task_alt' },
    {
      label: 'Human Review',
      path: '/human-review',
      icon: 'fact_check',
      countBadge: pendingReviewsCount
    }
  ];

  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface antialiased selection:bg-primary-container selection:text-on-primary-container min-h-screen flex flex-col">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* LEFT SIDEBAR (Standard Stitch layout) */}
      <aside
        className={`fixed left-0 top-0 h-screen w-72 bg-surface-container-lowest flex flex-col z-50 shadow-[0_1px_8px_rgba(0,0,0,0.4)] transition-transform duration-300 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-space-xl flex items-center justify-between bg-surface-container-lowest border-b border-surface-container-high/40">
          <div className="flex items-center gap-space-sm">
            <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary font-bold shadow-inner">
              <span className="material-symbols-outlined text-primary text-[20px]">security</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight font-bold">
                PRECURSOR-X
              </span>
              <span className="font-label-code-sm text-label-code-sm text-primary uppercase tracking-widest">
                Safety Intelligence Platform
              </span>
            </div>
          </div>
          <button
            className="lg:hidden text-outline hover:text-on-surface p-1 rounded"
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Navigation Items */}
        <div className="px-space-md py-space-sm flex-1 flex flex-col justify-between overflow-y-auto">
          <div className="flex flex-col gap-space-sm">
            <div className="px-space-sm pt-space-xs">
              <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline font-semibold">
                Workspaces
              </span>
            </div>
            <nav className="flex flex-col gap-space-xs">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-space-md py-space-sm rounded-lg transition-colors group ${
                      isActive
                        ? 'bg-primary-container text-on-primary-container font-semibold shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                    }`
                  }
                >
                  <div className="flex items-center gap-space-md">
                    <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                    <span className="font-body-md text-body-md">{item.label}</span>
                  </div>
                  {item.countBadge !== undefined && item.countBadge > 0 && (
                    <span className="font-label-code-sm text-label-code-sm px-space-xs py-0.5 rounded-full bg-secondary-container text-on-secondary font-semibold">
                      {item.countBadge}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Bottom Telemetry Status & User Profile */}
          <div className="flex flex-col gap-space-md pt-space-md border-t border-surface-container-high/30">
            {/* FastAPI Backend Status */}
            <div
              onClick={verifyBackendHealth}
              title={backendHealth.status === 'connected' ? `Connected (v${backendHealth.version})` : 'Click to retry connection'}
              className="bg-surface-container-low px-space-md py-space-sm rounded-lg flex items-center justify-between shadow-sm cursor-pointer hover:bg-surface-container transition-colors"
            >
              <div className="flex items-center gap-space-sm min-w-0">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      backendHealth.status === 'connected'
                        ? 'bg-primary'
                        : backendHealth.status === 'offline'
                        ? 'bg-error'
                        : 'bg-amber-400'
                    }`}
                  ></span>
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      backendHealth.status === 'connected'
                        ? 'bg-primary-container'
                        : backendHealth.status === 'offline'
                        ? 'bg-error'
                        : 'bg-amber-400'
                    }`}
                  ></span>
                </span>
                <span className="font-label-code-sm text-label-code-sm text-on-surface font-medium break-words">
                  {backendHealth.status === 'connected'
                    ? 'Service online'
                    : backendHealth.status === 'offline'
                    ? 'Service offline'
                    : 'Connecting…'}
                </span>
              </div>
              <span
                className={`font-label-code-sm text-label-code-sm font-semibold shrink-0 ml-1 ${
                  backendHealth.status === 'connected'
                    ? 'text-primary'
                    : backendHealth.status === 'offline'
                    ? 'text-error'
                    : 'text-amber-400'
                }`}
              >
                {backendHealth.status === 'connected'
                  ? `v${backendHealth.version || '0.1.0'}`
                  : backendHealth.status === 'offline'
                  ? 'OFFLINE'
                  : 'SYNC'}
              </span>
            </div>

            {/* Specialist Profile */}
            <div className="p-space-sm rounded-xl bg-surface-container flex items-center gap-space-md">
              <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-[20px]">
                  person
                </span>
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-headline-sm text-headline-sm text-on-surface break-words">
                  {user?.full_name || user?.email || 'Signed in'}
                </span>
                <span className="font-label-code-sm text-label-code-sm text-on-surface-variant break-words">
                  {user?.role || 'Safety engineer'}
                </span>
              </div>
              <span className="material-symbols-outlined text-outline text-[18px]">terminal</span>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT CONTAINER */}
      <div className="lg:pl-72 flex flex-col min-h-screen flex-1">
        {/* TOP HEADER */}
        <header className="fixed top-0 left-0 lg:left-72 right-0 h-16 bg-surface-container-lowest/95 backdrop-blur-xl z-40 shadow-[0_1px_8px_rgba(0,0,0,0.3)] border-b border-surface-container-high/30">
          <div className="h-16 w-full px-3 sm:px-space-md lg:px-space-xl flex items-center justify-between gap-2 sm:gap-space-md">
            {/* Mobile menu button & breadcrumbs */}
            <div className="flex items-center gap-2 sm:gap-space-md flex-1 min-w-0 max-w-2xl">
              <button
                aria-label="Open navigation menu"
                className="lg:hidden p-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors shrink-0"
                onClick={() => setMobileMenuOpen(true)}
              >
                <span className="material-symbols-outlined text-[20px]">menu</span>
              </button>

              {/* Global Search Bar */}
              <div className="relative flex-1 min-w-0 max-w-2xl">
                <span className="material-symbols-outlined absolute left-2.5 sm:left-space-md top-1/2 -translate-y-1/2 text-outline text-[16px] sm:text-[18px]">
                  search
                </span>
                <input
                  ref={searchInputRef}
                  className="w-full bg-surface-container-low pl-8 sm:pl-10 pr-7 sm:pr-10 py-1.5 rounded-lg text-on-surface placeholder-outline font-body-sm text-body-sm focus:outline-none focus:bg-surface-container transition-colors border border-transparent focus:border-primary/30"
                  placeholder="Search incidents, precursors, facilities"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  onFocus={() => setIsSearchOpen(true)}
                />
                <span className="hidden sm:inline-block absolute right-space-sm top-1/2 -translate-y-1/2 font-label-code-sm text-label-code-sm px-1.5 py-0.5 rounded bg-surface-container-high text-outline">
                  /
                </span>

                {/* Instant Search Results Dropdown */}
                {isSearchOpen && searchQuery.trim() && (
                  <div className="absolute left-0 right-0 top-full mt-2 bg-surface-container-low border border-surface-container-high rounded-xl shadow-2xl p-space-sm z-50 max-h-96 overflow-y-auto">
                    <div className="flex items-center justify-between px-space-sm py-1 border-b border-surface-container-high/40 text-outline font-label-code-sm text-label-code-sm">
                      <span>RESULTS ({searchResults.length})</span>
                      <button
                        className="hover:text-on-surface"
                        onClick={() => setIsSearchOpen(false)}
                      >
                        Esc to close
                      </button>
                    </div>

                    {isSearching ? (
                      <div className="p-space-lg text-center text-outline font-label-code-sm text-label-code-sm">
                        Querying telemetry and precedents...
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="p-space-lg text-center text-outline font-body-sm text-body-sm">
                        No matching reports, sites, or precursor patterns found.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 mt-1">
                        {searchResults.map((item, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              navigate(item.link);
                              setIsSearchOpen(false);
                              setSearchQuery('');
                            }}
                            className="p-space-sm rounded-lg hover:bg-surface-container cursor-pointer transition-colors flex items-center justify-between"
                          >
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-headline-sm text-[13px] text-on-surface font-medium break-words">
                                {item.title}
                              </span>
                              <span className="font-label-code-sm text-label-code-sm text-on-surface-variant break-words">
                                {item.subtitle}
                              </span>
                            </div>
                            <span className="font-label-code-sm text-label-code-sm px-2 py-0.5 rounded bg-surface-container-high text-primary shrink-0 ml-2">
                              {item.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-1.5 sm:gap-space-sm lg:gap-space-md shrink-0">
              {/* Truthful FastAPI Backend Health Indicator */}
              <button
                onClick={verifyBackendHealth}
                title={backendHealth.status === 'connected' ? `Connected (v${backendHealth.version})` : (backendHealth.error || 'Click to check the connection')}
                className={`${backendHealth.status === 'connected' ? 'hidden' : 'hidden lg:flex'} items-center gap-space-xs px-space-md py-1 rounded transition-colors shadow-sm cursor-pointer ${
                  backendHealth.status === 'connected'
                    ? 'bg-surface-container-low hover:bg-surface-container border border-primary/30 text-primary'
                    : backendHealth.status === 'offline'
                    ? 'bg-error-container/40 hover:bg-error-container text-error border border-error/50'
                    : 'bg-surface-container-low text-on-surface-variant'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    backendHealth.status === 'connected'
                      ? 'bg-primary animate-pulse'
                      : backendHealth.status === 'offline'
                      ? 'bg-error'
                      : 'bg-amber-400 animate-ping'
                  }`}
                />
                <span className="font-label-code-sm text-label-code-sm font-semibold tracking-wide">
                  {backendHealth.status === 'connected'
                    ? 'Service online'
                    : backendHealth.status === 'offline'
                    ? 'Service offline'
                    : 'Connecting…'}
                </span>
                {backendHealth.status === 'offline' && (
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                )}
              </button>

              {/* Notifications Button */}
              <div className="relative">
                <button
                  aria-label="Notifications"
                  className="relative p-2 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
                  onClick={() => {
                    setShowNotifications(!showNotifications);
                    setShowSettings(false);
                  }}
                >
                  <span className="material-symbols-outlined text-[20px]">notifications</span>
                  {pendingReviewsCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-error text-on-error font-label-code-sm text-[9px] font-bold flex items-center justify-center">
                      {pendingReviewsCount > 99 ? '99+' : pendingReviewsCount}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-surface-container-low border border-surface-container-high rounded-xl shadow-2xl p-space-md z-50 flex flex-col gap-space-sm">
                    <div className="flex items-center justify-between pb-space-xs border-b border-surface-container-high/40">
                      <span className="font-headline-sm text-headline-sm text-on-surface">
                        Priority Alerts
                      </span>
                      <span className="font-label-code-sm text-label-code-sm text-secondary font-semibold">
                        {pendingReviewsCount > 0 ? `${pendingReviewsCount} Action Items` : 'All Clear'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {pendingReviewsCount > 0 ? (
                        <div
                          onClick={() => {
                            setShowNotifications(false);
                            navigate('/human-review');
                          }}
                          className="p-2 rounded bg-surface-container hover:bg-surface-container-high cursor-pointer transition-colors flex flex-col gap-0.5 border border-secondary/30"
                        >
                          <span className="font-label-code-sm text-label-code-sm text-secondary font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                            HUMAN GOVERNANCE QUEUE
                          </span>
                          <span className="font-body-sm text-body-sm text-on-surface">
                            {pendingReviewsCount} incident {pendingReviewsCount === 1 ? 'dossier' : 'dossiers'} awaiting specialist validation.
                          </span>
                          <span className="font-label-code-sm text-[9px] text-primary hover:underline">
                            Open Review Console →
                          </span>
                        </div>
                      ) : (
                        <div className="p-2 rounded bg-surface-container flex flex-col gap-0.5">
                          <span className="font-label-code-sm text-label-code-sm text-primary font-bold">
                            SYSTEM NOMINAL
                          </span>
                          <span className="font-body-sm text-body-sm text-on-surface">
                            No pending incident dossiers in human review queue.
                          </span>
                        </div>
                      )}

                      <div className="p-2 rounded bg-surface-container flex flex-col gap-0.5">
                        <span className="font-label-code-sm text-label-code-sm text-outline font-bold">
                          Service status
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          Backend {backendHealth.status === 'connected' ? `online (v${backendHealth.version})` : 'connecting...'}.
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* System Settings Button */}
              <div className="relative">
                <button
                  aria-label="System Settings"
                  className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
                  onClick={() => {
                    setShowSettings(!showSettings);
                    setShowNotifications(false);
                  }}
                >
                  <span className="material-symbols-outlined text-[20px]">settings</span>
                </button>

                {showSettings && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-surface-container-low border border-surface-container-high rounded-xl shadow-2xl p-space-md z-50 flex flex-col gap-space-sm">
                    <span className="font-headline-sm text-headline-sm text-on-surface pb-1 border-b border-surface-container-high/40">
                      Telemetry Configuration
                    </span>
                    <div className="flex flex-col gap-2 font-label-code-sm text-label-code-sm">
                      <div className="flex justify-between items-center text-on-surface-variant">
                        <span>Backend Service:</span>
                        <span className="text-primary font-mono font-semibold">{backendHealth.version ? `v${backendHealth.version}` : 'Unknown'}</span>
                      </div>
                      <div className="flex justify-between items-center text-on-surface-variant">
                        <span>Environment:</span>
                        <span className="text-on-surface font-mono">{import.meta.env.PROD ? 'Production' : 'Development'}</span>
                      </div>
                      <div className="flex justify-between items-center text-on-surface-variant">
                        <span>API Base URL:</span>
                        <span className="text-primary font-mono">{API_BASE_URL}</span>
                      </div>
                      <div className="flex justify-between items-center text-on-surface-variant">
                        <span>Data Engine:</span>
                        <span className="text-on-surface font-mono">Python Services</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-5 w-px bg-surface-container-high"></div>

              {/* User Avatar & Logout */}
              <div className="flex items-center gap-space-sm shrink-0">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center font-bold text-on-primary">
                  <span className="material-symbols-outlined text-[18px]">person</span>
                </div>
                <div className="hidden xl:flex flex-col">
                  <span className="font-label-code-md text-label-code-md text-on-surface font-semibold leading-tight">
                    {user?.full_name || user?.email || 'Verified Operator'}
                  </span>
                  <span className="font-label-code-sm text-label-code-sm text-primary leading-tight uppercase">
                    {user?.role || 'SAFETY-ENGINEER'}
                  </span>
                </div>
                <button
                  type="button"
                  title="Sign out of PRECURSOR-X"
                  onClick={async () => {
                    await logout();
                    navigate('/');
                  }}
                  className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error-container/20 transition-colors ml-1 cursor-pointer flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* MAIN BODY CONTENT AREA */}
        <main className="w-full pt-20 sm:pt-24 pb-space-2xl bg-surface px-3 sm:px-space-md lg:px-space-xl flex-1 flex flex-col">
          {backendHealth.status === 'offline' && (
            <div className="mb-6 p-4 rounded-xl bg-error-container/30 border border-error/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-on-surface shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-error/20 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-error text-[22px]">cloud_off</span>
                </div>
                <div>
                  <div className="font-headline-sm text-headline-sm font-bold text-error flex items-center gap-2">
                    Safety intelligence service offline
                    <span className="text-[11px] font-label-code-sm font-normal px-2 py-0.5 rounded bg-error/20 text-error">
                      Render API
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    The app cannot reach its server at precursorx-backend.onrender.com, so data on this page may be missing or out of date. Check the connection and retry.
                  </p>
                </div>
              </div>
              <button
                onClick={verifyBackendHealth}
                className="px-4 py-2 rounded-lg bg-error text-on-error font-headline-sm text-headline-sm flex items-center justify-center gap-2 hover:bg-error/90 transition-colors shadow-sm shrink-0 self-start sm:self-auto cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                <span>Retry Connection</span>
              </button>
            </div>
          )}
          <ErrorBoundary key={location.pathname} moduleName="Page">
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};
