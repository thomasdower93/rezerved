import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Mail,
  Phone,
  Search,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { StaffLayout, StaffTab } from '../components/StaffLayout';
import { useAuth } from '../contexts/AuthContext';
import { Restaurant } from '../lib/types';
import { getRestaurant } from '../services/restaurants';
import {
  CustomerImportRow,
  getRestaurantCustomers,
  importRestaurantCustomers,
  parseCustomerCsv,
  RestaurantCustomer,
} from '../services/customers';

interface CustomerDataPageProps {
  activeTab: StaffTab;
  onNavigate: (tab: StaffTab) => void;
  onLogout: () => void;
}

export function CustomerDataPage({ activeTab, onNavigate, onLogout }: CustomerDataPageProps) {
  const { user } = useAuth();
  const restaurantId = user?.restaurant_id;
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [customers, setCustomers] = useState<RestaurantCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importRows, setImportRows] = useState<CustomerImportRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setError('');
    try {
      setCustomers(await getRestaurantCustomers(restaurantId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load customer data.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    getRestaurant(restaurantId).then(setRestaurant).catch(() => setRestaurant(null));
    load();
  }, [restaurantId, load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(customer => [
      customer.name,
      customer.email,
      customer.phone,
      customer.notes,
    ].some(value => value?.toLowerCase().includes(term)));
  }, [customers, search]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setImportError('');
    setImportSuccess('');
    try {
      const rows = parseCustomerCsv(await file.text());
      setImportRows(rows);
      setImportFileName(file.name);
    } catch (err) {
      setImportRows([]);
      setImportFileName('');
      setImportError(err instanceof Error ? err.message : 'Unable to read the CSV.');
    }
  };

  const clearImport = () => {
    setImportRows([]);
    setImportFileName('');
    setImportError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const runImport = async () => {
    if (!restaurantId || importRows.length === 0) return;
    setImporting(true);
    setImportError('');
    try {
      const result = await importRestaurantCustomers(restaurantId, importRows);
      setImportSuccess(`${result.imported} customer${result.imported === 1 ? '' : 's'} imported or updated.`);
      clearImport();
      await load();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Customer import failed.');
    } finally {
      setImporting(false);
    }
  };

  const optedIn = customers.filter(customer => customer.marketing_opt_in).length;
  const returning = customers.filter(customer => customer.visit_count > 1).length;

  return (
    <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Customer data</h1>
            <p className="text-sm text-slate-400 mt-1">A restaurant-scoped directory built from bookings and CSV imports.</p>
          </div>
          <label className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg cursor-pointer transition-colors">
            <FileUp className="w-4 h-4" />
            Import CSV
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={event => handleFile(event.target.files?.[0])}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Stat icon={Users} label="Total customers" value={customers.length} color="blue" />
          <Stat icon={UserCheck} label="Marketing opt-ins" value={optedIn} color="emerald" />
          <Stat icon={Users} label="Returning customers" value={returning} color="amber" />
        </div>

        {(importRows.length > 0 || importError || importSuccess) && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">CSV import</h2>
                {importFileName && <p className="text-xs text-slate-500 mt-1">{importFileName}</p>}
              </div>
              {(importRows.length > 0 || importError) && (
                <button onClick={clearImport} className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800" aria-label="Clear import">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {importRows.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-slate-300">
                  Ready to import <strong className="text-white">{importRows.length}</strong> customer{importRows.length === 1 ? '' : 's'}.
                </p>
                <p className="text-xs text-slate-500 mt-1">Existing customers are matched by normalised email or phone and updated safely.</p>
                <button
                  onClick={runImport}
                  disabled={importing}
                  className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {importing ? 'Importing…' : 'Confirm import'}
                </button>
              </div>
            )}

            {importError && (
              <p className="mt-3 flex items-start gap-2 text-sm text-red-300">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{importError}
              </p>
            )}
            {importSuccess && (
              <p className="mt-3 flex items-start gap-2 text-sm text-emerald-300">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />{importSuccess}
              </p>
            )}
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Customers</h2>
              <p className="text-xs text-slate-500 mt-0.5">{filtered.length} record{filtered.length === 1 ? '' : 's'}</p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search customers"
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-slate-500">Loading customer data…</div>
          ) : error ? (
            <div className="m-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-300">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-8 h-8 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No customers found</p>
              <p className="text-xs text-slate-600 mt-1">New bookings will appear here automatically.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="bg-slate-950/70">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Visits</th>
                    <th className="px-4 py-3 font-semibold">Last visit</th>
                    <th className="px-4 py-3 font-semibold">Consent</th>
                    <th className="px-4 py-3 font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filtered.map(customer => (
                    <tr key={customer.id} className="hover:bg-slate-800/35 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-semibold text-slate-100">{customer.name}</p>
                        {customer.notes && <p className="text-xs text-slate-500 mt-0.5 max-w-xs truncate">{customer.notes}</p>}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-400 space-y-1">
                        {customer.email && <p className="flex items-center gap-1.5"><Mail className="w-3 h-3" />{customer.email}</p>}
                        {customer.phone && <p className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{customer.phone}</p>}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-sm text-slate-200 tabular-nums">{customer.visit_count}</p>
                        <p className="text-[11px] text-slate-600">{customer.total_guests} total guests</p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-400">
                        {customer.last_visit_at
                          ? new Date(customer.last_visit_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${customer.marketing_opt_in ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>
                          {customer.marketing_opt_in ? 'Opted in' : 'No consent'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500 capitalize">{customer.source.replace('_', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-600">
          Marketing consent is preserved as supplied. Only contact customers for marketing where you have a lawful basis and recorded consent.
        </p>
      </div>
    </StaffLayout>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: 'blue' | 'emerald' | 'amber' }) {
  const palette = {
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  }[color];
  return (
    <div className={`border rounded-xl p-4 ${palette}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium opacity-80">{label}</p>
        <Icon className="w-4 h-4 opacity-70" />
      </div>
      <p className="text-2xl font-bold mt-2 tabular-nums">{value}</p>
    </div>
  );
}
