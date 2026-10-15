import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, UserPlus, Lock, X, CheckCircle2, AlertTriangle, CloudOff } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { ApiClientError } from '../services/httpClient';

export const AuthModal: React.FC = () => {
  const { authModalMode, closeModal, openLoginModal, openRegisterModal, login, register } = useAuth();
  const navigate = useNavigate();

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Status State
  const [isLoading, setIsLoading] = useState(false);
  const [errorStatus, setErrorStatus] = useState<
    'idle' | 'validation_error' | 'invalid_credentials' | 'backend_unavailable' | 'session_error' | 'success'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!authModalMode) return null;

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setOrganization('');
    setConfirmPassword('');
    setErrorStatus('idle');
    setErrorMessage(null);
  };

  const handleClose = () => {
    resetForm();
    closeModal();
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorStatus('idle');
    setErrorMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorStatus('validation_error');
      setErrorMessage('Enterprise email and security passphrase are required.');
      return;
    }

    setIsLoading(true);

    try {
      await login(email.trim(), password);
      setErrorStatus('success');
      setTimeout(() => {
        handleClose();
        navigate('/dashboard');
      }, 500);
    } catch (err: any) {
      setIsLoading(false);
      if (err instanceof ApiClientError) {
        if (err.endpoint === '/auth/me') {
          // Credentials were correct (login/register succeeded) but the follow-up session
          // check failed — this is a cookie/session problem, not bad credentials.
          setErrorStatus('session_error');
          setErrorMessage(err.message);
        } else if (err.isOffline || err.status === 0) {
          setErrorStatus('backend_unavailable');
          setErrorMessage('The server is not reachable right now. Please try again in a moment.');
        } else if (err.status === 401) {
          setErrorStatus('invalid_credentials');
          setErrorMessage('Invalid credentials. Check enterprise email and passphrase.');
        } else if (err.status === 403) {
          setErrorStatus('invalid_credentials');
          setErrorMessage('Operator account is inactive. Contact facility safety lead.');
        } else {
          setErrorStatus('validation_error');
          setErrorMessage(err.message || 'Authentication error.');
        }
      } else {
        setErrorStatus('backend_unavailable');
        setErrorMessage(err.message || 'Connection to auth service failed.');
      }
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorStatus('idle');
    setErrorMessage(null);

    if (!fullName.trim()) {
      setErrorStatus('validation_error');
      setErrorMessage('Full name and credential are required.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setErrorStatus('validation_error');
      setErrorMessage('Valid enterprise work email is required.');
      return;
    }

    if (password.length < 8) {
      setErrorStatus('validation_error');
      setErrorMessage('Security passphrase must be at least 8 characters long.');
      return;
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setErrorStatus('validation_error');
      setErrorMessage('Security passphrase must contain uppercase letters, lowercase letters, and digits.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorStatus('validation_error');
      setErrorMessage('Passphrase confirmation does not match.');
      return;
    }

    setIsLoading(true);

    try {
      await register({
        full_name: organization.trim() ? `${fullName.trim()} (${organization.trim()})` : fullName.trim(),
        email: email.trim(),
        password,
        confirm_password: confirmPassword,
      });
      setErrorStatus('success');
      setTimeout(() => {
        handleClose();
        navigate('/dashboard');
      }, 600);
    } catch (err: any) {
      setIsLoading(false);
      if (err instanceof ApiClientError) {
        if (err.endpoint === '/auth/me') {
          setErrorStatus('session_error');
          setErrorMessage(err.message);
        } else if (err.isOffline || err.status === 0) {
          setErrorStatus('backend_unavailable');
          setErrorMessage('The server is not reachable right now. Please try again in a moment.');
        } else if (err.status === 409) {
          setErrorStatus('validation_error');
          setErrorMessage('An account with this email address already exists. Please sign in instead.');
        } else {
          setErrorStatus('validation_error');
          setErrorMessage(err.message || 'Registration failed.');
        }
      } else {
        setErrorStatus('backend_unavailable');
        setErrorMessage(err.message || 'Network error during registration.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop Blur & Overlay */}
      <div
        className="absolute inset-0 bg-[#090d16]/80 backdrop-blur-md transition-opacity duration-300"
        onClick={handleClose}
      />

      {/* Modal Box */}
      <div className="relative w-full max-w-md rounded-xl bg-[#0f131c]/95 border border-cyan-500/40 p-6 sm:p-8 shadow-[0_0_50px_rgba(56,189,248,0.25)] transition-all transform duration-300 z-10">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {authModalMode === 'login' ? (
          <div>
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center space-x-2.5 mb-2">
                <div className="w-7 h-7 rounded border border-cyan-500/40 bg-cyan-950/60 flex items-center justify-center text-cyan-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <span className="font-mono font-bold text-white tracking-wider text-sm">PRECURSOR-X</span>
              </div>
              <h3 className="text-xl font-bold text-white">SIGN IN TO PRECURSOR-X</h3>
              <p className="text-xs text-slate-400 mt-1 font-sans">
                Authorized personnel access to operational safety telemetry.
              </p>
            </div>

            {/* Security Pill */}
            <div className="mb-6 p-2 rounded bg-slate-900/80 border border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="flex items-center text-cyan-400">
                <Lock className="w-3.5 h-3.5 mr-1" /> SECURE ACCESS
              </span>
              <span className="text-slate-500">HUMAN-AUTHENTICATED SESSION</span>
            </div>

            {/* Notifications */}
            {errorStatus === 'success' && (
              <div className="mb-4 p-3 rounded bg-emerald-950/60 border border-emerald-500/40 flex items-center gap-2 text-xs font-mono text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Authentication verified. Redirecting to console...</span>
              </div>
            )}
            {errorStatus === 'invalid_credentials' && (
              <div className="mb-4 p-3 rounded bg-rose-950/60 border border-rose-500/40 flex items-start gap-2 text-xs font-mono text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}
            {errorStatus === 'validation_error' && (
              <div className="mb-4 p-3 rounded bg-amber-950/60 border border-amber-500/40 flex items-start gap-2 text-xs font-mono text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}
            {errorStatus === 'backend_unavailable' && (
              <div className="mb-4 p-3 rounded bg-slate-900 border border-rose-500/60 flex items-start gap-2 text-xs font-mono text-slate-300">
                <CloudOff className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-rose-400 font-bold">BACKEND SERVICE UNAVAILABLE</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">{errorMessage}</div>
                </div>
              </div>
            )}
            {errorStatus === 'session_error' && (
              <div className="mb-4 p-3 rounded bg-amber-950/60 border border-amber-500/60 flex items-start gap-2 text-xs font-mono text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-amber-300 font-bold">SESSION NOT ESTABLISHED</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">{errorMessage}</div>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">
                  ENTERPRISE EMAIL ADDRESS
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="specialist@facility-operator.com"
                  className="w-full bg-[#141923] border border-slate-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded px-3 py-2 text-sm text-white placeholder-slate-500 font-sans outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-mono text-slate-300">
                    SECURITY PASSPHRASE
                  </label>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-[#141923] border border-slate-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded px-3 py-2 text-sm text-white placeholder-slate-500 font-sans outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || errorStatus === 'success'}
                className="w-full py-2.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(56,189,248,0.3)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <span>AUTHENTICATING WITH POSTGRESQL...</span>
                ) : (
                  <span>SIGN IN TO TELEMETRY SUITE</span>
                )}
              </button>
            </form>

            {/* Footer switch */}
            <div className="mt-6 pt-4 border-t border-slate-800 text-center text-xs text-slate-400 font-mono">
              Don't have an enterprise account?{' '}
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  openRegisterModal();
                }}
                className="text-cyan-400 hover:underline font-semibold ml-1 cursor-pointer"
              >
                Create account
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Header */}
            <div className="mb-5">
              <div className="flex items-center space-x-2.5 mb-2">
                <div className="w-7 h-7 rounded border border-cyan-500/40 bg-cyan-950/60 flex items-center justify-center text-cyan-400">
                  <UserPlus className="w-4 h-4" />
                </div>
                <span className="font-mono font-bold text-white tracking-wider text-sm">PRECURSOR-X</span>
              </div>
              <h3 className="text-xl font-bold text-white">REQUEST ENTERPRISE ACCESS</h3>
              <p className="text-xs text-slate-400 mt-1 font-sans">
                Deploy PRECURSOR-X across your upstream or manufacturing assets.
              </p>
            </div>

            {/* Notifications */}
            {errorStatus === 'success' && (
              <div className="mb-4 p-3 rounded bg-emerald-950/60 border border-emerald-500/40 flex items-center gap-2 text-xs font-mono text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Account created. Redirecting to the console...</span>
              </div>
            )}
            {errorStatus === 'validation_error' && (
              <div className="mb-4 p-3 rounded bg-amber-950/60 border border-amber-500/40 flex items-start gap-2 text-xs font-mono text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}
            {errorStatus === 'backend_unavailable' && (
              <div className="mb-4 p-3 rounded bg-slate-900 border border-rose-500/60 flex items-start gap-2 text-xs font-mono text-slate-300">
                <CloudOff className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-rose-400 font-bold">BACKEND UNAVAILABLE</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">{errorMessage}</div>
                </div>
              </div>
            )}
            {errorStatus === 'session_error' && (
              <div className="mb-4 p-3 rounded bg-amber-950/60 border border-amber-500/60 flex items-start gap-2 text-xs font-mono text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-amber-300 font-bold">SESSION NOT ESTABLISHED</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">{errorMessage}</div>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-mono text-slate-300 mb-1">
                  FULL NAME & CREDENTIAL
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Marcus Vance (CSP / Lead HSE)"
                  className="w-full bg-[#141923] border border-slate-700 focus:border-cyan-500 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 font-sans outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-300 mb-1">
                  ORGANIZATION / OPERATING COMPANY
                </label>
                <input
                  type="text"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Global Energy Corp / Sector 4"
                  className="w-full bg-[#141923] border border-slate-700 focus:border-cyan-500 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 font-sans outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-300 mb-1">
                  ENTERPRISE WORK EMAIL
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="marcus.vance@operator.com"
                  className="w-full bg-[#141923] border border-slate-700 focus:border-cyan-500 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 font-sans outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-mono text-slate-300 mb-1">
                    PASSWORD
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-[#141923] border border-slate-700 focus:border-cyan-500 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 font-sans outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-300 mb-1">
                    CONFIRM
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-[#141923] border border-slate-700 focus:border-cyan-500 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 font-sans outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || errorStatus === 'success'}
                className="w-full mt-2 py-2.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(56,189,248,0.3)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <span>PERSISTING IN POSTGRESQL...</span>
                ) : (
                  <span>SUBMIT FOR PROTOCOL CERTIFICATION</span>
                )}
              </button>
            </form>

            {/* Footer switch */}
            <div className="mt-5 pt-3 border-t border-slate-800 text-center text-xs text-slate-400 font-mono">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  openLoginModal();
                }}
                className="text-cyan-400 hover:underline font-semibold ml-1 cursor-pointer"
              >
                Sign in
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
