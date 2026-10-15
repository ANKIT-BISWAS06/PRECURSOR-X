import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, RegisterPayload, AuthModalMode } from './authTypes';
import { authService } from './authService';
import { AuthModal } from './AuthModal';
import { ApiClientError } from '../services/httpClient';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  authModalMode: AuthModalMode;
  login: (email: string, pass: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  openLoginModal: () => void;
  openRegisterModal: () => void;
  closeModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>(null);

  // Authoritative session verification on mount directly from FastAPI
  useEffect(() => {
    let isMounted = true;

    async function checkAuthSession() {
      try {
        // Direct query to FastAPI /api/v1/auth/me using browser HttpOnly cookie
        const currentUser = await authService.getCurrentUser();
        if (isMounted) {
          setUser(currentUser);
          setError(null);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setUser(null);
          if (err instanceof ApiClientError && err.status === 401) {
            // Unauthenticated: standard clean logged-out state
            setError(null);
          } else if (err?.isOffline || err?.status === 0) {
            // Backend unavailable: unresolved status, never treat cached user as authenticated
            setError('The authentication service is currently unreachable.');
          } else {
            setError(err?.message || 'Authentication session could not be verified.');
          }
          setIsLoading(false);
        }
      }
    }

    checkAuthSession();
    return () => {
      isMounted = false;
    };
  }, []);

  // After login/register, the backend has issued an HttpOnly session cookie — but that cookie
  // is invisible to JavaScript, so a 200 response here does NOT guarantee the browser actually
  // kept it (e.g. it may have been silently discarded as a third-party cookie). Re-verify the
  // session against the authoritative /auth/me endpoint before treating the user as
  // authenticated, so a "succeeded but no session" case surfaces its own clear error instead of
  // the app silently believing the user is logged in.
  const establishVerifiedSession = useCallback(async () => {
    try {
      const verifiedUser = await authService.getCurrentUser();
      setUser(verifiedUser);
    } catch (err: any) {
      setUser(null);
      const status = err instanceof ApiClientError ? err.status : 0;
      throw new ApiClientError({
        status,
        message:
          'Your credentials were accepted, but the browser did not retain the session. ' +
          'This is usually caused by browser cookie/privacy settings blocking the ' +
          'authentication cookie. Please check your cookie settings and try again.',
        isOffline: false,
        endpoint: '/auth/me'
      });
    }
  }, []);

  const login = useCallback(async (email: string, pass: string) => {
    setError(null);
    await authService.login({ email, password: pass });
    await establishVerifiedSession();
  }, [establishVerifiedSession]);

  const register = useCallback(async (payload: RegisterPayload) => {
    setError(null);
    await authService.register(payload);
    await establishVerifiedSession();
  }, [establishVerifiedSession]);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setError(null);
    }
  }, []);

  const openLoginModal = useCallback(() => setAuthModalMode('login'), []);
  const openRegisterModal = useCallback(() => setAuthModalMode('register'), []);
  const closeModal = useCallback(() => setAuthModalMode(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        error,
        authModalMode,
        login,
        register,
        logout,
        openLoginModal,
        openRegisterModal,
        closeModal,
      }}
    >
      {children}
      <AuthModal />
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
