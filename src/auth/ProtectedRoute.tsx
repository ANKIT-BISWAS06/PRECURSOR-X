import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export const ProtectedRoute: React.FC = () => {
  const { isAuthenticated, isLoading, openLoginModal } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f131c] flex flex-col items-center justify-center text-[#dfe2ee] gap-4">
        <div className="relative w-16 h-16">
          <div className="w-16 h-16 rounded-full border-2 border-[#262a33] border-t-[#38bdf8] animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="material-symbols-outlined text-[20px] text-[#8ed5ff]">shield</span>
          </div>
        </div>
        <div className="text-center font-label-code-sm text-label-code-sm text-[#87929a]">
          VERIFYING OPERATOR ACCESS CREDENTIALS...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Save intended destination and redirect to landing page
    return <Navigate to="/" state={{ from: location, openLogin: true }} replace />;
  }

  return <Outlet />;
};
