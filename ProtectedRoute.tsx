import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from './Layout';
import { Button } from './Button';

interface ProtectedRouteProps {
  children: React.ReactNode;
  onLoginRequired: () => void;
}

export function ProtectedRoute({ children, onLoginRequired }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Layout onStaffLogin={onLoginRequired}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600">Loading...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout onStaffLogin={onLoginRequired}>
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <h1 className="text-2xl font-bold text-slate-900 mb-3">
              Access Restricted
            </h1>
            <p className="text-slate-600 mb-6">
              Please log in to access the staff area.
            </p>
            <Button onClick={onLoginRequired} size="lg" className="w-full">
              Go to Login
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return <>{children}</>;
}
