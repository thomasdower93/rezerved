import React, { useState, useEffect, useMemo } from 'react';
import { StaffLayout, StaffTab } from '../components/StaffLayout';
import { useAuth } from '../contexts/AuthContext';
import { getRestaurant } from '../services/restaurants';
import { getTables } from '../services/tables';
import { formatDepositAmount } from '../services/deposits';
import { supabase } from '../lib/supabase';
import { Reservation, Restaurant, Table, ReservationPayment } from '../lib/types';
import {
  TrendingUp,
  Users,
  Calendar,
  XCircle,
  Download,
  ChevronDown,
  Lightbulb,
  LayoutGrid,
  BarChart2,
  AlertCircle,
  Repeat2,
  Banknote,
  Shield,
  Clock,
  Zap,
  Globe,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';

interface AnalyticsPageProps {
  activeTab: StaffTab;
  onNavigate: (tab: StaffTab) => void;
  onLogout: () => void;
}

type DateRange = 'today' | '7d' | '30d' | 'custom';

// ─── Utilities ────────────────────────────────────────────────────────────────

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

function safe(n: number | undefined | null, fallback = 0): number {
  if (n == null || !isFinite(n)) return fallback;
  return n;
}

function pct(n: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

async function fetchReservationsForRange(
  restaurantId: string,
  from: string,
  to: string,
): Promise<Reservation[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .gte('start_time', `${from}T00:00:00`)
    .lte('start_time', `${to}T23:59:59`)
    .order('start_time', { ascending: true });
  if (error) return [];
  return (data || []) as Reservation[];
}

async function fetchPaymentsForRange(
  restaurantId: string,
  from: string,
  to: string,
): Promise<ReservationPayment[]> {
  const { data } = await supabase
    .from('reservation_payments')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`);
  return (data || []) as ReservationPayment[];
}

// ─── Design atoms ─────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = false,
  empty,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  empty?: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent ? 'bg-amber-900/40' : 'bg-slate-800'}`}>
          <Icon className={`w-4 h-4 ${accent ? 'text-amber-400' : 'text-slate-400'}`} />
        </div>
      </div>
      {empty ? (
        <p className="text-xs text-slate-600 leading-relaxed">{empty}</p>
      ) : (
        <div>
          <div className="text-3xl font-bold text-white tabular-nums">{value}</div>
          {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
        </div>
      )}
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-800">
        <Icon className="w-4 h-4 text-amber-400" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
        <AlertCircle className="w-5 h-5 text-slate-600" />
      </div>
      <p className="text-sm text-slate-500 text-center max-w-xs leading-relaxed">{message}</p>
    </div>
  );
}

function BarRow({
  label,
  count,
  total,
  color = 'amber',
}: {
  label: string;
  count: number;
  total: number;
  color?: 'amber' | 'blue';
}) {
  const p = total > 0 ? Math.round((count / total) * 100) : 0;
  const gradient =
    color === 'blue'
      ? 'linear-gradient(to right, #1e3a5f, #3b82f6)'
      : 'linear-gradient(to right, #b45309, #d97706)';
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm text-slate-300">{label}</span>
        <span className="text-sm font-semibold text-white tabular-nums">
          {count}{' '}
          <span className="text-slate-500 font-normal text-xs">({p}%)</span>
        </span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, background: gradient }} />
      </div>
    </div>
  );
}

// ─── Covers Over Time ─────────────────────────────────────────────────────────

function CoversChart({
  reservations,
  from,
  to,
}: {
  reservations: Reservation[];
  from: string;
  to: string;
}) {
  const days = useMemo(() => {
    const result: { date: string; label: string; covers: number }[] = [];
    let cur = from;
    while (cur <= to) {
      const dayRes = reservations.filter(r => r.start_time.startsWith(cur) && r.status === 'booked');
      const covers = dayRes.reduce((s, r) => s + r.party_size, 0);
      const d = new Date(cur + 'T00:00:00');
      result.push({
        date: cur,
        label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
        covers,
      });
      cur = addDays(cur, 1);
    }
    return result;
  }, [reservations, from, to]);

  if (days.every(d => d.covers === 0)) {
    return <EmptyState message="No covers data for this period." />;
  }

  const maxCovers = Math.max(...days.map(d => d.covers), 1);
  const showEvery = days.length > 14 ? Math.ceil(days.length / 10) : 1;

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[400px]">
        <div className="flex items-end gap-1 h-40">
          {days.map(d => {
            const p = maxCovers > 0 ? (d.covers / maxCovers) * 100 : 0;
            return (
              <div
                key={d.date}
                className="flex-1 flex flex-col items-center gap-1 group"
                title={`${d.label}: ${d.covers} covers`}
              >
                {d.covers > 0 && (
                  <span className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                    {d.covers}
                  </span>
                )}
                <div
                  className="w-full rounded-t-sm transition-all"
                  style={{
                    height: `${Math.max(p, d.covers > 0 ? 4 : 0)}%`,
                    background: d.covers > 0 ? 'linear-gradient(to top, #b45309, #d97706)' : 'transparent',
                    minHeight: d.covers > 0 ? '4px' : '0',
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-1 mt-2">
          {days.map((d, i) => (
            <div key={d.date} className="flex-1 text-center">
              {i % showEvery === 0 && (
                <span className="text-[9px] text-slate-600 leading-none">{d.label.split(' ')[0]}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Demand Heatmap ───────────────────────────────────────────────────────────

const HEATMAP_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HEATMAP_SLOTS = ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
const DAY_INDEX: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };

function DemandHeatmap({ reservations }: { reservations: Reservation[] }) {
  const booked = reservations.filter(r => r.status === 'booked');

  const matrix = useMemo(() => {
    const m: number[][] = Array.from({ length: 7 }, () => Array(HEATMAP_SLOTS.length).fill(0));
    booked.forEach(r => {
      const d = new Date(r.start_time);
      const dayIdx = DAY_INDEX[d.getDay()];
      const hour = d.getHours();
      const slotIdx = HEATMAP_SLOTS.findIndex(s => parseInt(s) === hour);
      if (dayIdx !== undefined && slotIdx >= 0) m[dayIdx][slotIdx]++;
    });
    return m;
  }, [booked]);

  const maxVal = Math.max(...matrix.flat(), 1);

  if (booked.length === 0) {
    return <EmptyState message="Demand heatmap will appear once booking data is available." />;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[500px]">
        <div className="flex">
          <div className="w-14 flex-shrink-0" />
          {HEATMAP_DAYS.map(d => (
            <div key={d} className="flex-1 text-center text-[11px] font-semibold text-slate-500 pb-2">
              {d}
            </div>
          ))}
        </div>
        {HEATMAP_SLOTS.map((slot, si) => (
          <div key={slot} className="flex items-center mb-1">
            <div className="w-14 flex-shrink-0 text-[11px] text-slate-600 text-right pr-3">{slot}</div>
            {HEATMAP_DAYS.map((_, di) => {
              const val = matrix[di][si];
              const opacity = val > 0 ? 0.15 + (val / maxVal) * 0.85 : 0;
              return (
                <div
                  key={di}
                  className="flex-1 mx-0.5 h-7 rounded-sm flex items-center justify-center cursor-default"
                  style={{
                    backgroundColor: val > 0 ? `rgba(217,119,6,${opacity})` : 'rgba(255,255,255,0.03)',
                    border: val > 0 ? '1px solid rgba(217,119,6,0.2)' : '1px solid transparent',
                  }}
                  title={`${HEATMAP_DAYS[di]} ${slot}: ${val} booking${val !== 1 ? 's' : ''}`}
                >
                  {val > 0 && <span className="text-[9px] text-amber-300/80 font-medium">{val}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Booking Sources ──────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  online: 'Rezerved Profile',
  walk_in: 'Walk-in',
  phone: 'Telephone',
  quick_visit: 'Quick Visit',
  staff: 'Staff / Manual',
  unknown: 'Unknown',
};

function BookingSources({ reservations }: { reservations: Reservation[] }) {
  const booked = reservations.filter(r => r.status === 'booked');
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    booked.forEach(r => {
      const src = r.source || 'online';
      c[src] = (c[src] || 0) + 1;
    });
    return c;
  }, [booked]);

  const total = booked.length;
  if (total === 0) return <EmptyState message="Booking source tracking will appear here once source data is available." />;

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-3">
      {entries.map(([src, count]) => (
        <BarRow key={src} label={SOURCE_LABELS[src] || src} count={count} total={total} />
      ))}
    </div>
  );
}

// ─── Website Widget Performance ───────────────────────────────────────────────
// "online" source maps to Rezerved Profile / website widget

function WidgetPerformance({ reservations }: { reservations: Reservation[] }) {
  const booked = reservations.filter(r => r.status === 'booked');
  const widgetBookings = booked.filter(r => !r.source || r.source === 'online');

  if (widgetBookings.length === 0) {
    return <EmptyState message="Website widget analytics will appear once widget bookings are tracked." />;
  }

  const totalBooked = booked.length;
  const covers = widgetBookings.reduce((s, r) => s + r.party_size, 0);
  const share = pct(widgetBookings.length, totalBooked);

  // Most common hour
  const hourCounts: Record<number, number> = {};
  widgetBookings.forEach(r => {
    const h = new Date(r.start_time).getHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  });
  const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
  const peakLabel = peakHour
    ? `${parseInt(peakHour[0]) % 12 || 12}:00 ${parseInt(peakHour[0]) >= 12 ? 'PM' : 'AM'}`
    : '—';

  // Most common party size
  const partyCounts: Record<number, number> = {};
  widgetBookings.forEach(r => {
    partyCounts[r.party_size] = (partyCounts[r.party_size] || 0) + 1;
  });
  const peakParty = Object.entries(partyCounts).sort((a, b) => b[1] - a[1])[0];

  const stats = [
    { label: 'Bookings', value: widgetBookings.length },
    { label: 'Covers', value: covers },
    { label: 'Share of total', value: share },
    { label: 'Peak booking time', value: peakLabel },
    { label: 'Most common party', value: peakParty ? `${peakParty[0]} guests` : '—' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {stats.map(({ label, value }) => (
        <div key={label} className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{label}</div>
          <div className="text-lg font-bold text-white tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Deposit Analytics ────────────────────────────────────────────────────────

function DepositAnalytics({
  reservations,
  payments,
}: {
  reservations: Reservation[];
  payments: ReservationPayment[];
}) {
  const paidPayments = payments.filter(p => p.status === 'paid');
  const refundedPayments = payments.filter(p => p.status === 'refunded');
  const pendingPayments = payments.filter(p => p.status === 'pending');

  const totalCollected = paidPayments.reduce((s, p) => s + p.amount_pence, 0);
  const totalRefunded = refundedPayments.reduce((s, p) => s + p.amount_pence, 0);

  // Protected revenue = deposit_amount_pence on booked reservations
  const bookedWithDeposit = reservations.filter(
    r => r.status === 'booked' && r.deposit_amount_pence && r.deposit_amount_pence > 0,
  );
  const protectedRevenue = bookedWithDeposit.reduce((s, r) => s + (r.deposit_amount_pence || 0), 0);

  const avgDeposit =
    paidPayments.length > 0 ? Math.round(totalCollected / paidPayments.length) : 0;

  if (payments.length === 0 && bookedWithDeposit.length === 0) {
    return <EmptyState message="No deposit data for this period." />;
  }

  const currency = paidPayments[0]?.currency || 'gbp';

  const stats = [
    {
      label: 'Deposits Collected',
      value: totalCollected > 0 ? formatDepositAmount(totalCollected, currency) : '£0.00',
    },
    {
      label: 'Protected Revenue',
      value: protectedRevenue > 0 ? formatDepositAmount(protectedRevenue, currency) : '£0.00',
      tip: 'Deposit value on upcoming booked reservations',
    },
    { label: 'Bookings with Deposit', value: paidPayments.length },
    {
      label: 'Average Deposit',
      value: avgDeposit > 0 ? formatDepositAmount(avgDeposit, currency) : '—',
    },
    { label: 'Pending Requests', value: pendingPayments.length },
    {
      label: 'Refunded',
      value: totalRefunded > 0 ? formatDepositAmount(totalRefunded, currency) : '£0.00',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {stats.map(({ label, value, tip }) => (
        <div key={label} className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{label}</div>
          <div className="text-lg font-bold text-white tabular-nums">{value}</div>
          {tip && <div className="text-[10px] text-slate-600 mt-0.5 leading-tight">{tip}</div>}
        </div>
      ))}
    </div>
  );
}

// ─── Customer Behaviour ───────────────────────────────────────────────────────

function CustomerBehaviour({ reservations }: { reservations: Reservation[] }) {
  const booked = reservations.filter(r => r.status === 'booked');

  const { repeatCount, newCount, repeatRate, avgNoticeHours } = useMemo(() => {
    // Group by email (fallback phone)
    const identifierCounts: Record<string, number> = {};
    booked.forEach(r => {
      const key = r.customer_email?.trim().toLowerCase() || r.customer_phone?.trim() || '';
      if (key) identifierCounts[key] = (identifierCounts[key] || 0) + 1;
    });
    const repeatCount = Object.values(identifierCounts).filter(n => n > 1).length;
    const newCount = Object.values(identifierCounts).filter(n => n === 1).length;
    const total = repeatCount + newCount;
    const repeatRate = total > 0 ? Math.round((repeatCount / total) * 100) : 0;

    // Average booking notice
    const noticeHours = booked
      .filter(r => r.created_at)
      .map(r => {
        const created = new Date(r.created_at).getTime();
        const start = new Date(r.start_time).getTime();
        return (start - created) / 3600000;
      })
      .filter(h => h >= 0);
    const avgNoticeHours =
      noticeHours.length > 0
        ? Math.round(noticeHours.reduce((s, h) => s + h, 0) / noticeHours.length)
        : 0;

    return { repeatCount, newCount, repeatRate, avgNoticeHours };
  }, [booked]);

  const avgParty = booked.length > 0 ? (booked.reduce((s, r) => s + r.party_size, 0) / booked.length).toFixed(1) : '—';

  // Most common party size
  const partyCounts: Record<number, number> = {};
  booked.forEach(r => { partyCounts[r.party_size] = (partyCounts[r.party_size] || 0) + 1; });
  const commonParty = Object.entries(partyCounts).sort((a, b) => b[1] - a[1])[0];

  const noticeLabel =
    avgNoticeHours >= 48
      ? `${Math.round(avgNoticeHours / 24)} days`
      : avgNoticeHours >= 1
      ? `${avgNoticeHours} hours`
      : '< 1 hour';

  if (booked.length < 3) {
    return (
      <EmptyState message="Repeat customer tracking will appear once enough customer data is available." />
    );
  }

  const stats = [
    { label: 'Repeat Customers', value: repeatCount },
    { label: 'New Customers', value: newCount },
    { label: 'Repeat Booking Rate', value: `${repeatRate}%` },
    { label: 'Most Common Party', value: commonParty ? `${commonParty[0]} guests` : '—' },
    { label: 'Avg Party Size', value: avgParty },
    { label: 'Avg Booking Notice', value: noticeLabel },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {stats.map(({ label, value }) => (
        <div key={label} className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{label}</div>
          <div className="text-lg font-bold text-white tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Quick Visit Gap Detection ────────────────────────────────────────────────

const GAP_THRESHOLDS = [30, 45, 60]; // minutes

interface GapOpportunity {
  tableId: string;
  date: string;
  gapMinutes: number;
  gapStart: string;
  gapEnd: string;
}

function detectGaps(reservations: Reservation[]): GapOpportunity[] {
  const booked = reservations.filter(r => r.status === 'booked' && r.table_id);
  const byTable: Record<string, Reservation[]> = {};
  booked.forEach(r => {
    if (!byTable[r.table_id]) byTable[r.table_id] = [];
    byTable[r.table_id].push(r);
  });

  const gaps: GapOpportunity[] = [];
  Object.entries(byTable).forEach(([tableId, resos]) => {
    const sorted = resos.sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const end = new Date(sorted[i].end_time).getTime();
      const nextStart = new Date(sorted[i + 1].start_time).getTime();
      const gapMinutes = Math.round((nextStart - end) / 60000);
      if (gapMinutes >= 30 && gapMinutes <= 60) {
        gaps.push({
          tableId,
          date: sorted[i].start_time.slice(0, 10),
          gapMinutes,
          gapStart: sorted[i].end_time,
          gapEnd: sorted[i + 1].start_time,
        });
      }
    }
  });
  return gaps;
}

function QuickVisitOpportunities({
  reservations,
  tables,
}: {
  reservations: Reservation[];
  tables: Table[];
}) {
  const tableMap = useMemo(() => Object.fromEntries(tables.map(t => [t.id, t])), [tables]);
  const gaps = useMemo(() => detectGaps(reservations), [reservations]);

  const hasTableData = reservations.filter(r => r.status === 'booked').some(r => r.table_id);
  if (!hasTableData) {
    return (
      <EmptyState message="Quick Visit opportunities will appear once table assignments are available." />
    );
  }
  if (gaps.length === 0) {
    return <EmptyState message="No short gaps detected in the selected period." />;
  }

  // Best day
  const dayCounts: Record<string, number> = {};
  gaps.forEach(g => { dayCounts[g.date] = (dayCounts[g.date] || 0) + 1; });
  const bestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];

  // Most common gap length
  const gapLenCounts: Record<number, number> = {};
  gaps.forEach(g => {
    const bucket = GAP_THRESHOLDS.reduce((prev, cur) =>
      Math.abs(cur - g.gapMinutes) < Math.abs(prev - g.gapMinutes) ? cur : prev,
    );
    gapLenCounts[bucket] = (gapLenCounts[bucket] || 0) + 1;
  });
  const commonGap = Object.entries(gapLenCounts).sort((a, b) => b[1] - a[1])[0];

  const examples = gaps.slice(0, 4);

  function fmtTime(iso: string) {
    const d = new Date(iso);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Total Gaps</div>
          <div className="text-lg font-bold text-white">{gaps.length}</div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Best Day</div>
          <div className="text-lg font-bold text-white truncate">
            {bestDay
              ? new Date(bestDay[0] + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
              : '—'}
          </div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Common Gap</div>
          <div className="text-lg font-bold text-white">{commonGap ? `${commonGap[0]}m` : '—'}</div>
        </div>
      </div>

      <div className="space-y-2">
        {examples.map((g, i) => {
          const table = tableMap[g.tableId];
          const tableName = table?.name || `Table ···${g.tableId.slice(-4).toUpperCase()}`;
          return (
            <div
              key={i}
              className="flex items-center justify-between px-3 py-2.5 bg-slate-800/40 rounded-lg border border-slate-700/40 text-sm"
            >
              <span className="text-slate-300">{tableName}</span>
              <span className="text-slate-500 text-xs">
                {fmtTime(g.gapStart)} – {fmtTime(g.gapEnd)} · {g.gapMinutes}m gap
              </span>
            </div>
          );
        })}
        {gaps.length > 4 && (
          <p className="text-xs text-slate-600 text-center pt-1">+ {gaps.length - 4} more gaps found</p>
        )}
      </div>
    </div>
  );
}

// ─── Table Efficiency ─────────────────────────────────────────────────────────

function TableEfficiency({
  reservations,
  tables,
}: {
  reservations: Reservation[];
  tables: Table[];
}) {
  const booked = reservations.filter(r => r.status === 'booked' && r.table_id);
  const tableMap = useMemo(() => Object.fromEntries(tables.map(t => [t.id, t])), [tables]);

  const { usageCounts, oversized, seatFillPct } = useMemo(() => {
    const usageCounts: Record<string, number> = {};
    let oversizedCount = 0;
    let totalFillPct = 0;
    let fillSamples = 0;

    booked.forEach(r => {
      usageCounts[r.table_id] = (usageCounts[r.table_id] || 0) + 1;
      const table = tableMap[r.table_id];
      if (table) {
        const cap = table.capacity;
        const party = r.party_size;
        if (cap > 0) {
          totalFillPct += (party / cap) * 100;
          fillSamples++;
        }
        // Oversized: table capacity >= 2x party size and difference >= 3
        if (cap >= party * 2 && cap - party >= 3) oversizedCount++;
      }
    });

    const avgFill = fillSamples > 0 ? Math.round(totalFillPct / fillSamples) : 0;
    return { usageCounts, oversized: oversizedCount, seatFillPct: avgFill };
  }, [booked, tableMap]);

  if (booked.length === 0) {
    return (
      <EmptyState message="Table usage insights will appear here once table assignment data is available." />
    );
  }

  const sorted = Object.entries(usageCounts).sort((a, b) => b[1] - a[1]);
  const mostUsed = sorted[0];
  const leastUsed = sorted[sorted.length - 1];
  const total = booked.length;

  const warnings: string[] = [];
  if (oversized > 0) warnings.push(`${oversized} booking${oversized !== 1 ? 's' : ''} used a table significantly larger than the party size.`);
  if (seatFillPct < 60 && booked.length >= 5) warnings.push('Average seat fill is below 60% — consider promoting smaller tables.');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Most Used</div>
          <div className="text-base font-bold text-white truncate">
            {mostUsed ? (tableMap[mostUsed[0]]?.name || `···${mostUsed[0].slice(-4).toUpperCase()}`) : '—'}
          </div>
          {mostUsed && <div className="text-xs text-slate-500">{mostUsed[1]} bookings</div>}
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Least Used</div>
          <div className="text-base font-bold text-white truncate">
            {leastUsed && leastUsed[0] !== mostUsed?.[0]
              ? (tableMap[leastUsed[0]]?.name || `···${leastUsed[0].slice(-4).toUpperCase()}`)
              : '—'}
          </div>
          {leastUsed && leastUsed[0] !== mostUsed?.[0] && (
            <div className="text-xs text-slate-500">{leastUsed[1]} booking{leastUsed[1] !== 1 ? 's' : ''}</div>
          )}
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Avg Seat Fill</div>
          <div className="text-base font-bold text-white">{seatFillPct}%</div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Oversized</div>
          <div className="text-base font-bold text-white">{oversized}</div>
          <div className="text-xs text-slate-500">assignments</div>
        </div>
      </div>

      {/* Top tables by usage */}
      {sorted.slice(0, 5).map(([tableId, count]) => {
        const table = tableMap[tableId];
        const name = table?.name || `···${tableId.slice(-4).toUpperCase()}`;
        return (
          <BarRow key={tableId} label={name} count={count} total={total} color="blue" />
        );
      })}

      {warnings.length > 0 && (
        <div className="space-y-2 pt-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2.5 p-3 bg-amber-950/30 border border-amber-800/30 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-200/80">{w}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Smart Insights V2 ────────────────────────────────────────────────────────

const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function SmartInsights({
  reservations,
  payments,
  tables,
}: {
  reservations: Reservation[];
  payments: ReservationPayment[];
  tables: Table[];
}) {
  const booked = reservations.filter(r => r.status === 'booked');

  const insights = useMemo(() => {
    if (booked.length < 2) return [];
    const result: string[] = [];

    // Widget share
    const widgetBookings = booked.filter(r => !r.source || r.source === 'online');
    if (widgetBookings.length > 0) {
      result.push(
        `Your Rezerved profile generated ${pct(widgetBookings.length, booked.length)} of bookings this period.`,
      );
    }

    // Busiest day
    const dayCounts: Record<number, number> = {};
    booked.forEach(r => { const d = new Date(r.start_time).getDay(); dayCounts[d] = (dayCounts[d] || 0) + 1; });
    const busiestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];
    if (busiestDay) result.push(`${DAYS_FULL[parseInt(busiestDay[0])]} is your busiest day with ${busiestDay[1]} booking${busiestDay[1] !== 1 ? 's' : ''}.`);

    // Deposits
    const paidPayments = payments.filter(p => p.status === 'paid');
    if (paidPayments.length > 0) {
      const total = paidPayments.reduce((s, p) => s + p.amount_pence, 0);
      result.push(`You collected ${formatDepositAmount(total, paidPayments[0].currency)} in deposits this period.`);
    }

    // Repeat customers
    const identifierCounts: Record<string, number> = {};
    booked.forEach(r => {
      const key = r.customer_email?.trim().toLowerCase() || r.customer_phone?.trim() || '';
      if (key) identifierCounts[key] = (identifierCounts[key] || 0) + 1;
    });
    const repeatCount = Object.values(identifierCounts).filter(n => n > 1).length;
    if (repeatCount > 0) result.push(`${repeatCount} booking${repeatCount !== 1 ? 's' : ''} came from repeat customers.`);

    // Quick visits
    const gaps = detectGaps(reservations);
    if (gaps.length > 0) result.push(`You had ${gaps.length} short gap${gaps.length !== 1 ? 's' : ''} suitable for Quick Visits.`);

    // Oversized table assignments
    const tableMap = Object.fromEntries(tables.map(t => [t.id, t]));
    const oversized = booked.filter(r => {
      const t = tableMap[r.table_id];
      return t && t.capacity >= r.party_size * 2 && t.capacity - r.party_size >= 3;
    }).length;
    if (oversized > 0) result.push(`Large tables were used by small parties ${oversized} time${oversized !== 1 ? 's' : ''} this period.`);

    // Average notice
    const noticeHours = booked
      .filter(r => r.created_at)
      .map(r => (new Date(r.start_time).getTime() - new Date(r.created_at).getTime()) / 3600000)
      .filter(h => h >= 0);
    if (noticeHours.length > 0) {
      const avg = noticeHours.reduce((s, h) => s + h, 0) / noticeHours.length;
      const label = avg >= 48 ? `${Math.round(avg / 24)} days` : `${Math.round(avg)} hours`;
      result.push(`Most customers booked an average of ${label} in advance.`);
    }

    // Common party size
    const partyCounts: Record<number, number> = {};
    booked.forEach(r => { partyCounts[r.party_size] = (partyCounts[r.party_size] || 0) + 1; });
    const topParty = Object.entries(partyCounts).sort((a, b) => b[1] - a[1])[0];
    if (topParty) result.push(`Your most common party size was ${topParty[0]} guest${parseInt(topParty[0]) !== 1 ? 's' : ''}.`);

    return result;
  }, [booked, payments, reservations, tables]);

  if (insights.length === 0) {
    return <EmptyState message="More insights will appear as bookings are collected." />;
  }

  return (
    <div className="space-y-3">
      {insights.map((insight, i) => (
        <div
          key={i}
          className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60 border border-slate-700/50"
        >
          <div className="mt-0.5 w-5 h-5 rounded-full bg-amber-900/50 flex items-center justify-center flex-shrink-0">
            <Lightbulb className="w-3 h-3 text-amber-400" />
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{insight}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AnalyticsPage({ activeTab, onNavigate, onLogout }: AnalyticsPageProps) {
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [prevReservations, setPrevReservations] = useState<Reservation[]>([]);
  const [payments, setPayments] = useState<ReservationPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const [range, setRange] = useState<DateRange>('7d');
  const [customStart, setCustomStart] = useState(toDateString(new Date()));
  const [customEnd, setCustomEnd] = useState(toDateString(new Date()));
  const [showCustom, setShowCustom] = useState(false);

  const today = toDateString(new Date());

  const { from, to } = useMemo(() => {
    switch (range) {
      case 'today': return { from: today, to: today };
      case '7d': return { from: addDays(today, -6), to: today };
      case '30d': return { from: addDays(today, -29), to: today };
      case 'custom': return { from: customStart, to: customEnd };
    }
  }, [range, today, customStart, customEnd]);

  useEffect(() => {
    if (!user?.restaurant_id) return;
    setLoading(true);
    const rid = user.restaurant_id;

    const periodDays = Math.max(
      Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000) + 1,
      1,
    );
    const prevFrom = addDays(from, -periodDays);
    const prevTo = addDays(from, -1);

    Promise.all([
      fetchReservationsForRange(rid, from, to),
      fetchReservationsForRange(rid, prevFrom, prevTo),
      fetchPaymentsForRange(rid, from, to),
    ]).then(([curr, prev, pays]) => {
      setReservations(curr);
      setPrevReservations(prev);
      setPayments(pays);
      setLoading(false);
    });
  }, [user?.restaurant_id, from, to]);

  useEffect(() => {
    if (!user?.restaurant_id) return;
    Promise.all([
      getRestaurant(user.restaurant_id),
      getTables(user.restaurant_id),
    ]).then(([r, t]) => {
      setRestaurant(r);
      setTables(t);
    });
  }, [user?.restaurant_id]);

  // ── KPI calculations ──
  const booked = reservations.filter(r => r.status === 'booked');
  const cancelled = reservations.filter(r => r.status === 'cancelled');
  const covers = booked.reduce((s, r) => s + r.party_size, 0);
  const avgParty = booked.length > 0 ? (covers / booked.length).toFixed(1) : '—';

  const prevBooked = prevReservations.filter(r => r.status === 'booked');
  const prevCovers = prevBooked.reduce((s, r) => s + r.party_size, 0);

  const paidPayments = payments.filter(p => p.status === 'paid');
  const depositsCollected = paidPayments.reduce((s, p) => s + p.amount_pence, 0);
  const depositCurrency = paidPayments[0]?.currency || 'gbp';

  const protectedRevenue = booked
    .filter(r => r.deposit_amount_pence && r.deposit_amount_pence > 0)
    .reduce((s, r) => s + (r.deposit_amount_pence || 0), 0);

  const identifierCounts: Record<string, number> = {};
  booked.forEach(r => {
    const key = r.customer_email?.trim().toLowerCase() || r.customer_phone?.trim() || '';
    if (key) identifierCounts[key] = (identifierCounts[key] || 0) + 1;
  });
  const repeatCustomers = Object.values(identifierCounts).filter(n => n > 1).length;

  const noticeHours = booked
    .filter(r => r.created_at)
    .map(r => (new Date(r.start_time).getTime() - new Date(r.created_at).getTime()) / 3600000)
    .filter(h => h >= 0);
  const avgNoticeHours = noticeHours.length > 0
    ? Math.round(noticeHours.reduce((s, h) => s + h, 0) / noticeHours.length)
    : null;
  const avgNoticeLabel = avgNoticeHours == null
    ? '—'
    : avgNoticeHours >= 48
    ? `${Math.round(avgNoticeHours / 24)}d`
    : `${avgNoticeHours}h`;

  function delta(curr: number, prev: number): string | undefined {
    if (prev === 0) return undefined;
    const d = curr - prev;
    return `${d >= 0 ? '+' : ''}${d} vs previous period`;
  }

  function handleExport() {
    const rows = [
      ['Date', 'Customer', 'Party Size', 'Status', 'Source', 'Start Time', 'Deposit (pence)'],
      ...reservations.map(r => [
        r.start_time.slice(0, 10),
        r.customer_name,
        String(r.party_size),
        r.status,
        r.source || 'online',
        r.start_time,
        String(r.deposit_amount_pence || 0),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rezerved-analytics-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track bookings, covers, demand and table performance.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['today', '7d', '30d'] as DateRange[]).map(r => (
            <button
              key={r}
              onClick={() => { setRange(r); setShowCustom(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                range === r && !showCustom
                  ? 'bg-amber-600 border-amber-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
              }`}
            >
              {r === 'today' ? 'Today' : r === '7d' ? '7 Days' : '30 Days'}
            </button>
          ))}

          <div className="relative">
            <button
              onClick={() => { setShowCustom(v => !v); setRange('custom'); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                range === 'custom'
                  ? 'bg-amber-600 border-amber-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
              }`}
            >
              Custom
              <ChevronDown className="w-3 h-3" />
            </button>
            {showCustom && (
              <div className="absolute right-0 top-full mt-2 z-30 bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-2xl flex flex-col gap-3 min-w-[220px]">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">From</label>
                  <input
                    type="date"
                    value={customStart}
                    max={customEnd}
                    onChange={e => setCustomStart(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">To</label>
                  <input
                    type="date"
                    value={customEnd}
                    min={customStart}
                    max={today}
                    onChange={e => setCustomEnd(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <button
                  onClick={() => setShowCustom(false)}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Apply
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">

          {/* KPI row — 4 primary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={Calendar} label="Bookings" value={booked.length} sub={delta(booked.length, prevBooked.length)} accent />
            <KpiCard icon={Users} label="Covers" value={covers} sub={delta(covers, prevCovers)} accent />
            <KpiCard icon={TrendingUp} label="Avg Party Size" value={avgParty} sub={booked.length > 0 ? `across ${booked.length} booking${booked.length !== 1 ? 's' : ''}` : undefined} />
            <KpiCard icon={XCircle} label="Cancelled / No-shows" value={cancelled.length} sub={reservations.length > 0 ? `${Math.round((cancelled.length / reservations.length) * 100)}% of total` : undefined} />
          </div>

          {/* KPI row — 4 secondary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={Repeat2}
              label="Repeat Customers"
              value={booked.length >= 3 ? repeatCustomers : '—'}
              sub={booked.length >= 3 && repeatCustomers > 0 ? `${pct(repeatCustomers, Object.keys(identifierCounts).length)} of unique customers` : undefined}
              empty={booked.length < 3 ? 'Repeat customer tracking will appear once enough data is available.' : undefined}
            />
            <KpiCard
              icon={Banknote}
              label="Deposits Collected"
              value={depositsCollected > 0 ? formatDepositAmount(depositsCollected, depositCurrency) : '£0.00'}
              sub={paidPayments.length > 0 ? `${paidPayments.length} payment${paidPayments.length !== 1 ? 's' : ''}` : undefined}
              empty={paidPayments.length === 0 ? 'Deposit analytics will appear once deposits are collected.' : undefined}
            />
            <KpiCard
              icon={Shield}
              label="Protected Revenue"
              value={protectedRevenue > 0 ? formatDepositAmount(protectedRevenue, depositCurrency) : '£0.00'}
              sub={protectedRevenue > 0 ? 'Deposits on upcoming bookings' : undefined}
            />
            <KpiCard
              icon={Clock}
              label="Avg Booking Notice"
              value={avgNoticeLabel}
              sub={avgNoticeHours != null ? 'before the reservation time' : undefined}
            />
          </div>

          {/* Covers Over Time — full width */}
          <SectionCard title="Covers Over Time" icon={BarChart2}>
            <CoversChart reservations={reservations} from={from} to={to} />
          </SectionCard>

          {/* Demand Heatmap — full width */}
          <SectionCard title="Demand Heatmap" icon={LayoutGrid}>
            <DemandHeatmap reservations={reservations} />
          </SectionCard>

          {/* Two-column: Booking Sources + Widget Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Booking Sources" icon={TrendingUp}>
              <BookingSources reservations={reservations} />
            </SectionCard>
            <SectionCard title="Website Widget Performance" icon={Globe}>
              <WidgetPerformance reservations={reservations} />
            </SectionCard>
          </div>

          {/* Two-column: Deposits + Customer Behaviour */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Deposits" icon={Banknote}>
              <DepositAnalytics reservations={reservations} payments={payments} />
            </SectionCard>
            <SectionCard title="Customer Behaviour" icon={UserCheck}>
              <CustomerBehaviour reservations={reservations} />
            </SectionCard>
          </div>

          {/* Two-column: Quick Visits + Table Efficiency */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Quick Visit Opportunities" icon={Zap}>
              <QuickVisitOpportunities reservations={reservations} tables={tables} />
            </SectionCard>
            <SectionCard title="Table Efficiency" icon={AlertTriangle}>
              <TableEfficiency reservations={reservations} tables={tables} />
            </SectionCard>
          </div>

          {/* Smart Insights — full width */}
          <SectionCard title="Smart Insights" icon={Lightbulb}>
            <SmartInsights reservations={reservations} payments={payments} tables={tables} />
          </SectionCard>

        </div>
      )}
    </StaffLayout>
  );
}
