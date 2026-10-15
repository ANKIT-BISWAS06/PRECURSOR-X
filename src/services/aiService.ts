import { AIAnalysisResult } from '../types';
import { api } from './api';

export type { AIAnalysisResult };

/**
 * Delegating proxy ensuring report analysis calls the FastAPI backend.
 * Local heuristic logic has been replaced with the authoritative backend endpoint.
 */
export async function analyzeSafetyReport(
  text: string,
  context?: { unit?: string; category?: string }
): Promise<AIAnalysisResult> {
  return api.analyzeReport(text, context);
}
