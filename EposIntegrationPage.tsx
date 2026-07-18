import React, { useState, useEffect, useCallback } from 'react';
import { StaffLayout, StaffTab } from '../components/StaffLayout';
import { useAuth } from '../contexts/AuthContext';
import { getRestaurant } from '../services/restaurants';
import {
  getRestaurantEposConnection,
  upsertEposConnection,
  getEposSyncEvents,
  PROVIDER_LABELS,
  LIVE_PROVIDERS,
  EposConnection,
  EposSyncEvent,
  EposProvider,
  EposConnectionStatus,
} from '../services/epos';
import { Restaurant } from '../lib/types';
import {
  Plug,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  RefreshCw,
  Zap,
  ChevronDown,
  Info,
  ToggleLeft,
  ToggleRight,
  Calendar,
  Ban,
  Loader2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EposIntegrationPageProps {
  activeTab: StaffTab;
  onNavigate: (tab: StaffTab) => void;
  onLogout: () => void;
}

type LogFilter = 'all' | 'success' | 'failed' | 'skipped';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROVIDERS: EposProvider[] = [
  'none',
  'mock',
  'sumup',
  'square',
  'clover',
  'epos_now',
  'lightspeed',
  'custom',
];

function statusColor(status: EposSyncEvent['status']): string {
  switch (status) {
    case 'success': return 'text-emerald-400';
    case 'failed':  return 'text-red-400';
    case 'skipped': return 'text-slate-400';
    case 'pending': return 'text-amber-400';
    default:        return 'text-slate-400';
  }
}

function statusBg(status: EposSyncEvent['status']): string {
  switch (status) {
    case 'success': return 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50';
    case 'failed':  return 'bg-red-900/40 text-red-300 border-red-700/50';
    case 'skipped': return 'bg-slate-800 text-slate-400 border-slate-700';
    case 'pending': return 'bg-amber-900/40 text-amber-300 border-amber-700/50';
    default:        return 'bg-slate-800 text-slate-400 border-slate-700';
  }
}

function StatusIcon({ status }: { status: EposSyncEvent['status'] }) {
  const cls = `w-3.5 h-3.5 ${statusColor(status)}`;
  switch (status) {
    case 'success': return <CheckCircle2 className={cls} />;
    case 'failed':  return <XCircle className={cls} />;
    case 'skipped': return <Ban className={cls} />;
    case 'pending': return <Clock className={cls} />;
    default:        return <Clock className={cls} />;
  }
}

function connectionStatusLabel(status: EposConnectionStatus): { label: string; color: string } {
  switch (status) {
    case 'not_connected': return { label: 'Not Connected', color: 'text-slate-400' };
    case 'test_mode':     return { label: 'Test Mode',     color: 'text-amber-400' };
    case 'connected':     return { label: 'Connected',     color: 'text-emerald-400' };
    case 'error':         return { label: 'Error',         color: 'text-red-400' };
  }
}

function formatEventType(t: string): string {
  return t.replace('booking.', '').replace('deposit.', 'Deposit ').replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// ── Toggle component ──────────────────────────────────────────────────────────

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${value ? 'bg-amber-600' : 'bg-slate-700'}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          value ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ── Provider selector ─────────────────────────────────────────────────────────

function ProviderSelector({
  value,
  onChange,
  disabled,
}: {
  value: EposProvider;
  onChange: (v: EposProvider) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white hover:border-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>{PROVIDER_LABELS[value]}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
            {PROVIDERS.map(p => {
              const isLive = LIVE_PROVIDERS.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    if (isLive) { onChange(p); setOpen(false); }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors ${
                    value === p
                      ? 'bg-amber-900/30 text-amber-300'
                      : isLive
                      ? 'text-white hover:bg-slate-700'
                      : 'text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <span>{PROVIDER_LABELS[p]}</span>
                  {!isLive && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-500 border border-slate-600">
                      Coming soon
                    </span>
                  )}
                  {value === p && isLive && (
                    <CheckCircle2 className="w-4 h-4 text-amber-400" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function EposIntegrationPage({ activeTab, onNavigate, onLogout }: EposIntegrationPageProps) {
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [connection, setConnection] = useState<EposConnection | null>(null);
  const [events, setEvents] = useState<EposSyncEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingLogs, setRefreshingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Local draft of connection settings
  const [draft, setDraft] = useState<Partial<EposConnection>>({
    provider: 'none',
    connection_status: 'not_connected',
    sync_new_bookings: false,
    sync_booking_updates: false,
    sync_cancellations: false,
    sync_deposits: false,
    open_order_on_seated: false,
    pull_sales_data: false,
  });

  const restaurantId = user?.restaurant_id;

  const loadData = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const [restaurantData, conn, evts] = await Promise.all([
        getRestaurant(restaurantId),
        getRestaurantEposConnection(restaurantId),
        getEposSyncEvents(restaurantId, 100),
      ]);
      setRestaurant(restaurantData);
      setConnection(conn);
      setEvents(evts);
      if (conn) {
        setDraft({
          provider: conn.provider,
          connection_status: conn.connection_status,
          sync_new_bookings: conn.sync_new_bookings,
          sync_booking_updates: conn.sync_booking_updates,
          sync_cancellations: conn.sync_cancellations,
          sync_deposits: conn.sync_deposits,
          open_order_on_seated: conn.open_order_on_seated,
          pull_sales_data: conn.pull_sales_data,
        });
      }
    } catch (err) {
      console.error('[EposIntegrationPage] loadData error:', err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshLogs = async () => {
    if (!restaurantId) return;
    setRefreshingLogs(true);
    try {
      const evts = await getEposSyncEvents(restaurantId, 100);
      setEvents(evts);
    } finally {
      setRefreshingLogs(false);
    }
  };

  const handleProviderChange = (p: EposProvider) => {
    const status: EposConnectionStatus =
      p === 'none' ? 'not_connected' : p === 'mock' ? 'test_mode' : 'not_connected';
    setDraft(d => ({ ...d, provider: p, connection_status: status }));
  };

  const handleSave = async () => {
    if (!restaurantId) return;
    setSaving(true);
    try {
      const updated = await upsertEposConnection(restaurantId, draft);
      if (updated) {
        setConnection(updated);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  const filteredEvents = events.filter(e => {
    if (logFilter === 'all') return true;
    return e.status === logFilter;
  });

  const connStatus = draft.connection_status
    ? connectionStatusLabel(draft.connection_status as EposConnectionStatus)
    : connectionStatusLabel('not_connected');

  const isMockActive = draft.provider === 'mock';
  const isNoneActive = draft.provider === 'none';

  if (loading) {
    return (
      <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-slate-600 animate-spin" />
        </div>
      </StaffLayout>
    );
  }

  return (
    <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-1.5 bg-amber-900/30 rounded-lg border border-amber-700/30">
                <Plug className="w-4 h-4 text-amber-400" />
              </div>
              <h1 className="text-xl font-semibold text-white">EPOS Integration</h1>
            </div>
            <p className="text-sm text-slate-400">
              Connect Rezerved to your point-of-sale system to sync bookings, deposits, and table status.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs font-medium ${connStatus.color}`}>{connStatus.label}</span>
            <div className={`w-2 h-2 rounded-full ${
              draft.connection_status === 'connected' ? 'bg-emerald-400' :
              draft.connection_status === 'test_mode' ? 'bg-amber-400' :
              draft.connection_status === 'error' ? 'bg-red-400' :
              'bg-slate-600'
            }`} />
          </div>
        </div>

        {/* Provider card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-white">Provider</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">EPOS System</label>
              <ProviderSelector
                value={(draft.provider as EposProvider) ?? 'none'}
                onChange={handleProviderChange}
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Connection Status</label>
              <div className="px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  draft.connection_status === 'connected' ? 'bg-emerald-400' :
                  draft.connection_status === 'test_mode' ? 'bg-amber-400' :
                  draft.connection_status === 'error' ? 'bg-red-400' :
                  'bg-slate-600'
                }`} />
                <span className={connStatus.color}>{connStatus.label}</span>
              </div>
            </div>
          </div>

          {isMockActive && (
            <div className="flex gap-2.5 p-3 bg-amber-900/20 border border-amber-700/30 rounded-lg">
              <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300/80">
                <strong className="text-amber-300">Test Mode active.</strong> All sync events will generate mock responses and be logged for review. No real EPOS system will be contacted.
              </p>
            </div>
          )}

          {isNoneActive && (
            <div className="flex gap-2.5 p-3 bg-slate-800/60 border border-slate-700 rounded-lg">
              <Info className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500">
                No EPOS provider selected. Sync events will be logged as <em>skipped</em>. Select <strong className="text-slate-400">Test / Mock Provider</strong> to test the full workflow.
              </p>
            </div>
          )}
        </div>

        {/* Sync options card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-white">Sync Options</h2>
          </div>

          <div className="space-y-0 divide-y divide-slate-800">
            {([
              {
                key: 'sync_new_bookings' as const,
                label: 'Sync new bookings to EPOS',
                description: 'When a customer confirms a booking, send it to the EPOS system',
              },
              {
                key: 'sync_booking_updates' as const,
                label: 'Sync booking updates to EPOS',
                description: 'When a booking is modified, update the EPOS record',
              },
              {
                key: 'sync_cancellations' as const,
                label: 'Sync cancellations to EPOS',
                description: 'When a booking is cancelled, notify the EPOS system',
              },
              {
                key: 'sync_deposits' as const,
                label: 'Send deposits to EPOS',
                description: 'When a deposit is paid or refunded, record it in EPOS',
              },
              {
                key: 'open_order_on_seated' as const,
                label: 'Open EPOS order when booking is seated',
                description: 'When staff mark a table as seated, open a matching order in the EPOS',
              },
              {
                key: 'pull_sales_data' as const,
                label: 'Pull completed sales into Rezerved analytics',
                description: 'When a booking is completed, pull the final bill data into analytics',
              },
            ] as const).map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm text-white">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                </div>
                <Toggle
                  value={!!draft[key]}
                  onChange={v => setDraft(d => ({ ...d, [key]: v }))}
                  disabled={saving}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center justify-between gap-4">
          <div className="h-5">
            {saveSuccess && (
              <div className="flex items-center gap-1.5 text-emerald-400 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>Settings saved</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>

        {/* Sync log */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {/* Log header */}
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white">Sync Log</h2>
              <span className="text-xs text-slate-500">{events.length} events</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Filter tabs */}
              <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                {(['all', 'success', 'failed', 'skipped'] as LogFilter[]).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setLogFilter(f)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                      logFilter === f
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={refreshLogs}
                disabled={refreshingLogs}
                className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
                title="Refresh logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingLogs ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Log table */}
          {filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mb-3">
                <AlertCircle className="w-5 h-5 text-slate-600" />
              </div>
              <p className="text-sm text-slate-500">
                {events.length === 0
                  ? 'No sync events yet. Events will appear here once booking actions occur.'
                  : `No ${logFilter} events found.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">Date / Time</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">Event</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">Provider</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredEvents.map(event => (
                    <tr
                      key={event.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-400 font-mono">
                        {formatTimestamp(event.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-white font-medium">
                          {formatEventType(event.event_type)}
                        </span>
                        {event.reservation_id && (
                          <span className="ml-1.5 text-xs text-slate-600 font-mono">
                            #{event.reservation_id.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-slate-400 capitalize">
                          {event.provider === 'mock' ? 'Test / Mock' : event.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${statusBg(event.status)}`}>
                          <StatusIcon status={event.status} />
                          {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        {event.status === 'failed' && event.error_message && (
                          <span className="text-xs text-red-400 truncate block">{event.error_message}</span>
                        )}
                        {event.status === 'skipped' && event.error_message && (
                          <span className="text-xs text-slate-500 truncate block">{event.error_message}</span>
                        )}
                        {event.status === 'success' && event.response_payload && (
                          <span className="text-xs text-emerald-500/70 truncate block font-mono">
                            {Object.values(event.response_payload)[0] as string}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </StaffLayout>
  );
}
