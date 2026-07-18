import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Mail, CheckCircle, XCircle, Clock, AlertCircle, RefreshCw, LogOut, ArrowLeft } from 'lucide-react';
import { Button } from '../components/Button';

interface EmailLog {
  id: string;
  created_at: string;
  reservation_id: string | null;
  to_email: string;
  template: string;
  provider: string;
  status: 'queued' | 'sent' | 'failed';
  error: string | null;
  provider_message_id: string | null;
}

export function EmailLogsPage() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const loadLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('email_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading email logs:', error);
        throw error;
      }

      setLogs(data || []);
    } catch (error) {
      console.error('Failed to load email logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [filterStatus]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'queued':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'queued':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const { user, logout } = useAuth();

  const handleBack = () => {
    window.history.back();
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <nav className="bg-white shadow-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <Button variant="secondary" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="h-8 w-px bg-slate-300"></div>
              <h1 className="text-xl font-bold text-slate-900">Email Logs</h1>
              {user && (
                <span className="text-sm text-slate-600">
                  {user.name} ({user.role})
                </span>
              )}
            </div>

            <Button variant="secondary" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-app-text mb-2">Email Logs</h1>
            <p className="text-app-text-secondary">
              View and debug email delivery status for reservation confirmations
            </p>
          </div>
          <Button onClick={loadLogs} variant="secondary">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="premium-card rounded-2xl p-6 mb-6">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterStatus === 'all'
                  ? 'bg-app-accent text-white'
                  : 'bg-app-bg-secondary text-app-text-secondary hover:bg-app-bg-tertiary'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterStatus('sent')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterStatus === 'sent'
                  ? 'bg-green-600 text-white'
                  : 'bg-app-bg-secondary text-app-text-secondary hover:bg-app-bg-tertiary'
              }`}
            >
              Sent
            </button>
            <button
              onClick={() => setFilterStatus('failed')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterStatus === 'failed'
                  ? 'bg-red-600 text-white'
                  : 'bg-app-bg-secondary text-app-text-secondary hover:bg-app-bg-tertiary'
              }`}
            >
              Failed
            </button>
            <button
              onClick={() => setFilterStatus('queued')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterStatus === 'queued'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-app-bg-secondary text-app-text-secondary hover:bg-app-bg-tertiary'
              }`}
            >
              Queued
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-12 h-12 border-4 border-app-accent border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-app-text-secondary">Loading email logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <Mail className="w-16 h-16 text-app-text-tertiary mx-auto mb-4" />
              <p className="text-app-text-secondary">No email logs found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-app-border">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-app-text">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-app-text">To</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-app-text">Template</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-app-text">Time</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-app-text">Provider</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-app-text">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-app-border hover:bg-app-bg-secondary transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(log.status)}
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(log.status)}`}>
                            {log.status}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-app-text font-medium">
                        {log.to_email}
                      </td>
                      <td className="py-3 px-4 text-sm text-app-text-secondary">
                        {log.template}
                      </td>
                      <td className="py-3 px-4 text-sm text-app-text-secondary">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="py-3 px-4 text-sm text-app-text-secondary">
                        {log.provider}
                      </td>
                      <td className="py-3 px-4">
                        {log.error ? (
                          <div className="text-xs text-red-600 max-w-xs truncate" title={log.error}>
                            {log.error}
                          </div>
                        ) : log.provider_message_id ? (
                          <div className="text-xs text-green-600 max-w-xs truncate" title={log.provider_message_id}>
                            ID: {log.provider_message_id}
                          </div>
                        ) : (
                          <span className="text-xs text-app-text-tertiary">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="premium-card rounded-2xl p-6 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <h3 className="font-bold text-app-text mb-2 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            About Email Logs
          </h3>
          <ul className="text-sm text-app-text-secondary space-y-1 list-disc list-inside">
            <li><strong>Sent:</strong> Email was successfully delivered to the email provider</li>
            <li><strong>Failed:</strong> Email delivery failed (check error details for reason)</li>
            <li><strong>Queued:</strong> Email is waiting to be sent</li>
            <li>Showing last 50 email logs</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
