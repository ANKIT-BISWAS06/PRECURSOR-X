/**
 * Authentication and User Types for PRECURSOR-X.
 * Aligned with FastAPI backend /api/v1/auth schemas.
 */

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at?: string;
  last_login_at?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  full_name: string;
  email: string;
  password: string;
  confirm_password?: string;
}

export interface AuthResponse {
  user: User;
  token_type?: string;
  message?: string;
}

export type AuthModalMode = 'login' | 'register' | null;

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  authModalMode: AuthModalMode;
}
