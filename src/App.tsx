import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { AppShell } from './layouts/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { ReportAnalyzerPage } from './pages/ReportAnalyzerPage';
import { RiskIntelligencePage } from './pages/RiskIntelligencePage';
import { SafetyDnaPage } from './pages/SafetyDnaPage';
import { SafetyMemoryPage } from './pages/SafetyMemoryPage';
import { KnowledgeGraphPage } from './pages/KnowledgeGraphPage';
import { WhatChangedPage } from './pages/WhatChangedPage';
import { InterventionsPage } from './pages/InterventionsPage';
import { HumanReviewPage } from './pages/HumanReviewPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Landing Page */}
          <Route path="/" element={<LandingPage />} />

          {/* Protected Application Routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/report-analyzer" element={<ReportAnalyzerPage />} />
              <Route path="/risk-intelligence" element={<RiskIntelligencePage />} />
              <Route path="/safety-dna" element={<SafetyDnaPage />} />
              <Route path="/safety-memory" element={<SafetyMemoryPage />} />
              <Route path="/knowledge-graph" element={<KnowledgeGraphPage />} />
              <Route path="/what-changed" element={<WhatChangedPage />} />
              <Route path="/interventions" element={<InterventionsPage />} />
              <Route path="/human-review" element={<HumanReviewPage />} />
            </Route>
          </Route>

          {/* Fallback to Public Landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
