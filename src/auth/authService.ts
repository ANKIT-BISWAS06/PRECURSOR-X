/**
 * Authentication Service for PRECURSOR-X.
 * Communicates with FastAPI /api/v1/auth using HttpOnly session cookies.
 * No bearer tokens are stored in browser localStorage.
 */

import { httpClient } from '../services/httpClient';
import { User, LoginCredentials, RegisterPayload, AuthResponse } from './authTypes';

export const authService = {
  /**
   * Register a new operator in PostgreSQL via FastAPI.
   * FastAPI issues an HttpOnly cookie automatically.
   */
  async register(payload: RegisterPayload): Promise<AuthResponse> {
    return await httpClient.post<AuthResponse>('/auth/register', payload);
  },

  /**
   * Authenticate operator credentials against PostgreSQL via FastAPI.
   * FastAPI issues an HttpOnly cookie automatically.
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    return await httpClient.post<AuthResponse>('/auth/login', credentials);
  },

  /**
   * Fetch current authenticated operator profile directly from FastAPI.
   * Returns 401 if unauthenticated.
   */
  async getCurrentUser(): Promise<User> {
    return await httpClient.get<User>('/auth/me');
  },

  /**
   * End session and invalidate HttpOnly cookie on backend.
   */
  async logout(): Promise<void> {
    try {
      await httpClient.post('/auth/logout');
    } catch {
      // Best-effort logout notification to backend
    }
  }
};
