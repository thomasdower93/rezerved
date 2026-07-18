import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { resetPassword } from '../services/auth';
import { Lock, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ResetPasswordPageProps {
  onSuccess: () => void;
  onStaffLogin?: () => void;
}

export function ResetPasswordPage({ onSuccess, onStaffLogin }: ResetPasswordPageProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsValidSession(true);
      } else if (event === 'SIGNED_IN' && session) {
        setIsValidSession(true);
      }
    });

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsValidSession(true);
      } else {
        const hash = window.location.hash;
        const hasRecoveryToken = hash.includes('type=recovery') || hash.includes('access_token');
        if (!hasRecoveryToken) {
          setIsValidSession(false);
          setError('Invalid or expired reset link. Please request a new password reset.');
        }
      }
    };

    checkSession();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);

    try {
      await resetPassword(password);
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (isValidSession === null) {
    return (
      <Layout onStaffLogin={onStaffLogin}>
        <div className="max-w-md mx-auto">
          <div className="premium-card rounded-2xl p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-accent mx-auto"></div>
              <p className="mt-4 text-app-text-secondary">Verifying reset link...</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (isValidSession === false) {
    return (
      <Layout onStaffLogin={onStaffLogin}>
        <div className="max-w-md mx-auto">
          <div className="premium-card rounded-2xl p-8">
            <div className="flex items-center justify-center mb-6">
              <AlertCircle className="w-16 h-16 text-red-500" />
            </div>

            <h1 className="text-3xl font-bold text-app-text text-center mb-2">
              Invalid Reset Link
            </h1>
            <p className="text-center text-app-text-secondary mb-6">
              This password reset link is invalid or has expired.
            </p>

            <Button
              onClick={() => {
                window.history.pushState({}, '', '/forgot-password');
                window.location.reload();
              }}
              className="w-full"
            >
              Request New Reset Link
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (success) {
    return (
      <Layout onStaffLogin={onStaffLogin}>
        <div className="max-w-md mx-auto">
          <div className="premium-card rounded-2xl p-8">
            <div className="flex items-center justify-center mb-6">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>

            <h1 className="text-3xl font-bold text-app-text text-center mb-2">
              Password Reset Successful
            </h1>
            <p className="text-center text-app-text-secondary mb-6">
              Your password has been updated successfully. Redirecting to sign in...
            </p>

            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-accent mx-auto"></div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout onStaffLogin={onStaffLogin}>
      <div className="max-w-md mx-auto">
        <div className="premium-card rounded-2xl p-8">
          <div className="flex items-center justify-center mb-6">
            <Lock className="w-12 h-12 text-app-accent" />
          </div>

          <h1 className="text-3xl font-bold text-app-text text-center mb-2">
            Set New Password
          </h1>
          <p className="text-center text-app-text-secondary mb-8">
            Enter your new password below
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="New Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              required
              minLength={6}
            />

            <Input
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
              minLength={6}
            />

            <div className="text-xs text-app-text-secondary">
              Password must be at least 6 characters long
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Updating Password...' : 'Update Password'}
            </Button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
