import React, { useState, useEffect, useCallback } from 'react';
import { StaffLayout, StaffTab } from '../components/StaffLayout';
import { useAuth } from '../contexts/AuthContext';
import { getRestaurant } from '../services/restaurants';
import { supabase } from '../lib/supabase';
import { Restaurant, TableCombinationTemplate, Table, RestaurantDepositSettings } from '../lib/types';
import { BookOpen, Clock, Bell, MessageSquare, CalendarClock, Users, AlertCircle, CheckCircle2, Loader2, Lock, Link2, Plus, Trash2, CreditCard as Edit3, X, Banknote, Info } from 'lucide-react';
import {
  getCombinationsForRestaurant,
  createCombination,
  updateCombination,
  deleteCombination,
} from '../services/combinations';
import { getTables } from '../services/tables';
import {
  getDepositSettings,
  saveDepositSettings,
  formatDepositAmount,
  calculateDepositAmount,
} from '../services/deposits';


interface BookingRulesPageProps {
  activeTab: StaffTab;
  onNavigate: (tab: StaffTab) => void;
  onLogout: () => void;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type NoResponseAction = 'nothing' | 'mark_unconfirmed' | 'flag_for_review' | 'auto_cancel';

interface BookingSettings {
  id?: string;
  restaurant_id: string;
  default_reservation_duration_minutes: number;
  reconfirmation_enabled: boolean;
  first_reconfirmation_hours_before: number;
  second_reconfirmation_hours_before: number;
  auto_cancel_deadline_hours_before: number;
  no_response_action: NoResponseAction;
  reconfirmation_email_enabled: boolean;
  reconfirmation_sms_enabled: boolean;
  chat_email_notifications_enabled: boolean;
  chat_sms_notifications_enabled: boolean;
  minimum_booking_notice_minutes: number;
  max_online_party_size: number | null;
  reservation_acceptance_mode: 'auto' | 'manual';
  manual_acceptance_timeout_minutes: number;
  booking_confirmation_sms_enabled: boolean;
}

function defaultSettings(restaurantId: string): BookingSettings {
  return {
    restaurant_id: restaurantId,
    default_reservation_duration_minutes: 120,
    reconfirmation_enabled: false,
    first_reconfirmation_hours_before: 48,
    second_reconfirmation_hours_before: 24,
    auto_cancel_deadline_hours_before: 6,
    no_response_action: 'flag_for_review',
    reconfirmation_email_enabled: true,
    reconfirmation_sms_enabled: false,
    chat_email_notifications_enabled: true,
    chat_sms_notifications_enabled: false,
    minimum_booking_notice_minutes: 0,
    max_online_party_size: null,
    reservation_acceptance_mode: 'auto',
    manual_acceptance_timeout_minutes: 30,
    booking_confirmation_sms_enabled: false,
  };
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 border border-slate-700">
          <Icon className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function StatusMsg({ type, text }: { type: 'success' | 'error'; text: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border mt-3 ${
      type === 'success'
        ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-300'
        : 'bg-red-900/30 border-red-700/50 text-red-300'
    }`}>
      {type === 'success'
        ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
        : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
      <span>{text}</span>
    </div>
  );
}

function SaveButton({ saving, onClick, label = 'Save changes' }: { saving: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
    >
      {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {saving ? 'Saving…' : label}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:bg-blue-600 transition-colors group-hover:bg-slate-600 peer-checked:group-hover:bg-blue-500" />
        <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm" />
      </div>
      <div>
        <span className="text-sm font-medium text-slate-200">{label}</span>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

// ── Validation ────────────────────────────────────────────────────────────────

interface ValidationErrors {
  first_reconfirmation_hours_before?: string;
  second_reconfirmation_hours_before?: string;
  auto_cancel_deadline_hours_before?: string;
  minimum_booking_notice_minutes?: string;
  max_online_party_size?: string;
  manual_acceptance_timeout_minutes?: string;
}

function validateSettings(s: BookingSettings): ValidationErrors {
  const errs: ValidationErrors = {};

  if (s.reconfirmation_enabled) {
    if (s.first_reconfirmation_hours_before <= 0) {
      errs.first_reconfirmation_hours_before = 'Must be greater than 0.';
    }
    if (s.second_reconfirmation_hours_before <= 0) {
      errs.second_reconfirmation_hours_before = 'Must be greater than 0.';
    }
    if (
      s.first_reconfirmation_hours_before > 0 &&
      s.second_reconfirmation_hours_before >= s.first_reconfirmation_hours_before
    ) {
      errs.second_reconfirmation_hours_before =
        'Second request must be closer to the booking time than the first (i.e. fewer hours before).';
    }
    if (s.auto_cancel_deadline_hours_before < 0) {
      errs.auto_cancel_deadline_hours_before = 'Must be 0 or greater.';
    }
    if (
      s.second_reconfirmation_hours_before > 0 &&
      s.auto_cancel_deadline_hours_before >= s.second_reconfirmation_hours_before
    ) {
      errs.auto_cancel_deadline_hours_before =
        'Auto-cancel deadline must be closer to the booking time than the second request.';
    }
  }

  if (s.minimum_booking_notice_minutes < 0) {
    errs.minimum_booking_notice_minutes = 'Cannot be negative.';
  }

  if (s.max_online_party_size !== null && s.max_online_party_size < 1) {
    errs.max_online_party_size = 'Must be at least 1, or leave blank for unlimited.';
  }

  if (s.reservation_acceptance_mode === 'manual' && s.manual_acceptance_timeout_minutes < 5) {
    errs.manual_acceptance_timeout_minutes = 'Allow at least 5 minutes for staff to respond.';
  }

  return errs;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function loadSettings(restaurantId: string): Promise<BookingSettings> {
  const { data, error } = await supabase
    .from('restaurant_booking_settings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return defaultSettings(restaurantId);

  return {
    id: data.id,
    restaurant_id: data.restaurant_id,
    default_reservation_duration_minutes: data.default_reservation_duration_minutes,
    reconfirmation_enabled: data.reconfirmation_enabled,
    first_reconfirmation_hours_before: data.first_reconfirmation_hours_before,
    second_reconfirmation_hours_before: data.second_reconfirmation_hours_before,
    auto_cancel_deadline_hours_before: data.auto_cancel_deadline_hours_before,
    no_response_action: data.no_response_action as NoResponseAction,
    reconfirmation_email_enabled: data.reconfirmation_email_enabled,
    reconfirmation_sms_enabled: data.reconfirmation_sms_enabled,
    chat_email_notifications_enabled: data.chat_email_notifications_enabled,
    chat_sms_notifications_enabled: data.chat_sms_notifications_enabled,
    minimum_booking_notice_minutes: data.minimum_booking_notice_minutes,
    max_online_party_size: data.max_online_party_size ?? null,
    reservation_acceptance_mode: data.reservation_acceptance_mode === 'manual' ? 'manual' : 'auto',
    manual_acceptance_timeout_minutes: data.manual_acceptance_timeout_minutes ?? 30,
    booking_confirmation_sms_enabled: data.booking_confirmation_sms_enabled ?? false,
  };
}

async function saveSettings(settings: BookingSettings): Promise<void> {
  const { id, ...payload } = settings;

  if (id) {
    const { error } = await supabase
      .from('restaurant_booking_settings')
      .update(payload)
      .eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from('restaurant_booking_settings')
      .insert(payload);
    if (error) throw new Error(error.message);
  }
}

// ── Field/Select helpers ──────────────────────────────────────────────────────

const fieldClass = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors';
const labelClass = 'block text-xs font-medium text-slate-400 mb-1.5';
const selectClass = fieldClass;
const helperClass = 'text-xs text-slate-500 mt-1';
const errorClass = 'text-xs text-red-400 mt-1';

// ── Main page ─────────────────────────────────────────────────────────────────

// ── Joined Table Options ──────────────────────────────────────────────────────

interface CombinationFormState {
  id?: string;
  name: string;
  combined_capacity: number;
  table_ids: string[];
  allow_online_booking: boolean;
  active: boolean;
  internal_note: string;
}

function emptyCombinationForm(): CombinationFormState {
  return { name: '', combined_capacity: 2, table_ids: [], allow_online_booking: false, active: true, internal_note: '' };
}

interface JoinedTableOptionsSectionProps {
  restaurantId: string;
}

function JoinedTableOptionsSection({ restaurantId }: JoinedTableOptionsSectionProps) {
  const [allTables, setAllTables] = useState<Table[]>([]);
  const [combinations, setCombinations] = useState<TableCombinationTemplate[]>([]);
  const [loadingCombos, setLoadingCombos] = useState(true);
  const [form, setForm] = useState<CombinationFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [comboStatus, setComboStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const joinableTables = allTables.filter(t => t.can_be_joined);

  useEffect(() => {
    load();
  }, [restaurantId]);

  const load = async () => {
    setLoadingCombos(true);
    try {
      const [tables, combos] = await Promise.all([
        getTables(restaurantId),
        getCombinationsForRestaurant(restaurantId),
      ]);
      setAllTables(tables);
      setCombinations(combos);
    } catch (err) {
      console.error('[JoinedTableOptions] Failed to load:', err);
    } finally {
      setLoadingCombos(false);
    }
  };

  const openCreate = () => setForm(emptyCombinationForm());
  const openEdit = (combo: TableCombinationTemplate) => {
    setForm({
      id: combo.id,
      name: combo.name,
      combined_capacity: combo.combined_capacity,
      table_ids: (combo.tables || []).map(t => t.id),
      allow_online_booking: combo.allow_online_booking,
      active: combo.active,
      internal_note: combo.internal_note || '',
    });
    setComboStatus(null);
  };
  const closeForm = () => { setForm(null); setComboStatus(null); };

  const validateForm = (f: CombinationFormState): string | null => {
    if (!f.name.trim()) return 'Name is required.';
    if (f.table_ids.length < 2) return 'At least 2 tables must be selected.';
    const maxCap = Math.max(...f.table_ids.map(tid => allTables.find(t => t.id === tid)?.capacity ?? 0));
    if (f.combined_capacity < maxCap) return `Combined capacity must be at least ${maxCap} (the largest selected table).`;
    return null;
  };

  const handleSave = async () => {
    if (!form) return;
    const err = validateForm(form);
    if (err) { setComboStatus({ type: 'error', text: err }); return; }

    setSaving(true);
    setComboStatus(null);
    try {
      if (form.id) {
        await updateCombination(form.id, restaurantId, form.name.trim(), form.combined_capacity, form.table_ids, form.allow_online_booking, form.active, form.internal_note);
      } else {
        await createCombination(restaurantId, form.name.trim(), form.combined_capacity, form.table_ids, form.allow_online_booking, form.active, form.internal_note);
      }
      await load();
      setForm(null);
      setComboStatus(null);
    } catch (err) {
      setComboStatus({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      await deleteCombination(id, restaurantId);
      await load();
      setDeleteConfirm(null);
    } catch (err) {
      setComboStatus({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleTableInForm = (tableId: string) => {
    if (!form) return;
    const already = form.table_ids.includes(tableId);
    const newIds = already ? form.table_ids.filter(id => id !== tableId) : [...form.table_ids, tableId];
    const maxCap = Math.max(...newIds.map(tid => allTables.find(t => t.id === tid)?.capacity ?? 0), 1);
    setForm(prev => prev ? { ...prev, table_ids: newIds, combined_capacity: Math.max(prev.combined_capacity, maxCap) } : prev);
  };

  return (
    <SectionCard icon={Link2} title="Joined Table Options" subtitle="Choose which join-capable tables can be combined for larger parties. This does not change your saved floorplan.">
      {loadingCombos ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading combinations…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Existing combinations */}
          {combinations.length === 0 && !form && (
            <p className="text-sm text-slate-500">No joined-table combinations yet. Create one below.</p>
          )}
          {combinations.map(combo => (
            <div key={combo.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-100">{combo.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${combo.active ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50' : 'bg-slate-700/50 text-slate-400 border border-slate-600/50'}`}>
                    {combo.active ? 'Active' : 'Inactive'}
                  </span>
                  {combo.allow_online_booking && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 border border-blue-700/50">Online</span>
                  )}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {(combo.tables || []).map(t => t.name).join(' + ')} · {combo.combined_capacity} seats combined
                </div>
                {combo.internal_note && (
                  <div className="text-xs text-slate-500 mt-0.5 italic">{combo.internal_note}</div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => openEdit(combo)} className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                {deleteConfirm === combo.id ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-red-400">Delete?</span>
                    <button onClick={() => handleDelete(combo.id)} className="text-xs px-2 py-1 bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors">Yes</button>
                    <button onClick={() => setDeleteConfirm(null)} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors">No</button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirm(combo.id)} className="p-2 rounded-lg text-red-500 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Create/edit form */}
          {form ? (
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-100">{form.id ? 'Edit combination' : 'New combination'}</span>
                <button onClick={closeForm} className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"><X className="w-4 h-4" /></button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Combination name</label>
                  <input value={form.name} onChange={e => setForm(f => f ? { ...f, name: e.target.value } : f)} className={fieldClass} placeholder="e.g. Front window pair" />
                </div>
                <div>
                  <label className={labelClass}>Combined capacity</label>
                  <input type="number" min={1} value={form.combined_capacity} onChange={e => setForm(f => f ? { ...f, combined_capacity: Math.max(1, Number(e.target.value)) } : f)} className={fieldClass} />
                  <p className={helperClass}>Total seats when tables are joined.</p>
                </div>
              </div>

              <div>
                <label className={labelClass}>Tables to include</label>
                {joinableTables.length === 0 ? (
                  <div className="text-xs text-amber-400/80 bg-amber-900/20 border border-amber-700/30 rounded-lg px-3 py-2">
                    No tables have "Can be joined" enabled. Enable it in the Map Editor for the tables you want to combine.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {joinableTables.map(table => {
                      const selected = form.table_ids.includes(table.id);
                      return (
                        <button
                          key={table.id}
                          type="button"
                          onClick={() => toggleTableInForm(table.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${selected ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-400'}`}
                        >
                          {table.name} ({table.capacity})
                        </button>
                      );
                    })}
                  </div>
                )}
                {allTables.filter(t => !t.can_be_joined).length > 0 && (
                  <p className={helperClass}>
                    {allTables.filter(t => !t.can_be_joined).map(t => t.name).join(', ')} {allTables.filter(t => !t.can_be_joined).length === 1 ? 'is' : 'are'} not eligible — enable "Can be joined" in the Map Editor.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Toggle
                  checked={form.allow_online_booking}
                  onChange={v => setForm(f => f ? { ...f, allow_online_booking: v } : f)}
                  label="Allow online booking"
                  description="Offer this combination to customers searching online."
                />
                <Toggle
                  checked={form.active}
                  onChange={v => setForm(f => f ? { ...f, active: v } : f)}
                  label="Active"
                  description="Inactive combinations are never offered for new bookings."
                />
              </div>

              <div>
                <label className={labelClass}>Internal note <span className="text-slate-600">(optional)</span></label>
                <input value={form.internal_note} onChange={e => setForm(f => f ? { ...f, internal_note: e.target.value } : f)} className={fieldClass} placeholder="e.g. Only use when private room is booked" />
              </div>

              {comboStatus && <StatusMsg type={comboStatus.type} text={comboStatus.text} />}

              <div className="flex items-center gap-3 pt-1">
                <SaveButton saving={saving} onClick={handleSave} label={form.id ? 'Save changes' : 'Create combination'} />
                <button onClick={closeForm} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add combination
            </button>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ── Deposit Settings Section ──────────────────────────────────────────────────

interface DepositSettingsSectionProps {
  restaurantId: string;
}

function DepositSettingsSection({ restaurantId }: DepositSettingsSectionProps) {
  const [settings, setSettings] = useState<RestaurantDepositSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    getDepositSettings(restaurantId)
      .then(s => setSettings(s))
      .catch(err => console.error('[DepositSettings] Load failed:', err))
      .finally(() => setLoading(false));
  }, [restaurantId]);

  const set = <K extends keyof RestaurantDepositSettings>(key: K, value: RestaurantDepositSettings[K]) => {
    setSettings(prev => prev ? { ...prev, [key]: value } : prev);
    setValidationErrors(prev => { const n = { ...prev }; delete n[key as string]; return n; });
  };

  const validate = (s: RestaurantDepositSettings): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (s.enabled) {
      if (s.minimum_party_size < 1) errs.minimum_party_size = 'Must be at least 1.';
      if (s.amount_pence <= 0) errs.amount_pence = 'Amount must be greater than £0.';
      if (s.refund_cutoff_hours < 0) errs.refund_cutoff_hours = 'Cannot be negative.';
    }
    return errs;
  };

  const handleSave = async () => {
    if (!settings) return;
    const errs = validate(settings);
    if (Object.keys(errs).length > 0) { setValidationErrors(errs); return; }
    setValidationErrors({});
    setSaving(true);
    setStatus(null);
    try {
      const saved = await saveDepositSettings(settings);
      setSettings(saved);
      setStatus({ type: 'success', text: 'Deposit settings saved.' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SectionCard icon={Banknote} title="Deposits" subtitle="Require a deposit for larger party bookings.">
        <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin" />Loading…
        </div>
      </SectionCard>
    );
  }

  if (!settings) return null;

  const previewAmount = settings.enabled
    ? calculateDepositAmount(settings, settings.minimum_party_size)
    : 0;

  return (
    <SectionCard
      icon={Banknote}
      title="Deposits"
      subtitle="Require a deposit for larger party bookings. Deposits are collected through the restaurant's own SumUp account."
    >
      <div className="space-y-6">
        <Toggle
          checked={settings.enabled}
          onChange={v => set('enabled', v)}
          label="Enable deposits"
          description="When enabled, bookings that meet the party size threshold will require a deposit before the reservation is confirmed."
        />

        <div className={`space-y-5 transition-opacity duration-150 ${settings.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>

          {/* Threshold & amount */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Minimum party size requiring deposit</label>
              <input
                type="number"
                min={1}
                value={settings.minimum_party_size}
                onChange={e => set('minimum_party_size', Math.max(1, Number(e.target.value)))}
                className={fieldClass}
              />
              {validationErrors.minimum_party_size && <p className={errorClass}>{validationErrors.minimum_party_size}</p>}
              <p className={helperClass}>Bookings for this many guests or more will require a deposit.</p>
            </div>

            <div>
              <label className={labelClass}>Deposit type</label>
              <select
                value={settings.deposit_type}
                onChange={e => set('deposit_type', e.target.value as 'fixed' | 'per_person')}
                className={selectClass}
              >
                <option value="per_person">Per person</option>
                <option value="fixed">Fixed amount</option>
              </select>
              <p className={helperClass}>
                {settings.deposit_type === 'per_person'
                  ? 'Deposit amount × party size.'
                  : 'Same amount regardless of party size.'}
              </p>
            </div>

            <div>
              <label className={labelClass}>
                {settings.deposit_type === 'per_person' ? 'Amount per person (£)' : 'Fixed deposit amount (£)'}
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={(settings.amount_pence / 100).toFixed(2)}
                onChange={e => set('amount_pence', Math.round(parseFloat(e.target.value || '0') * 100))}
                className={fieldClass}
                placeholder="0.00"
              />
              {validationErrors.amount_pence && <p className={errorClass}>{validationErrors.amount_pence}</p>}
            </div>
          </div>

          {/* Preview */}
          {settings.enabled && settings.amount_pence > 0 && (
            <div className="flex items-start gap-2.5 bg-blue-900/20 border border-blue-700/30 rounded-lg px-4 py-3">
              <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-300/80 leading-relaxed">
                A party of <strong>{settings.minimum_party_size}</strong> would be charged a deposit of{' '}
                <strong>{formatDepositAmount(previewAmount)}</strong>
                {settings.deposit_type === 'per_person' && ` (${formatDepositAmount(settings.amount_pence)} × ${settings.minimum_party_size})`}.
              </p>
            </div>
          )}

          {/* Refund cutoff */}
          <div className="max-w-xs">
            <label className={labelClass}>Refund cutoff (hours before booking)</label>
            <input
              type="number"
              min={0}
              value={settings.refund_cutoff_hours}
              onChange={e => set('refund_cutoff_hours', Math.max(0, Number(e.target.value)))}
              className={fieldClass}
            />
            {validationErrors.refund_cutoff_hours && <p className={errorClass}>{validationErrors.refund_cutoff_hours}</p>}
            <p className={helperClass}>Cancellations made at least this many hours before the booking may be eligible for a refund.</p>
          </div>

          {/* Online bookings toggle */}
          <Toggle
            checked={settings.applies_to_online_bookings}
            onChange={v => set('applies_to_online_bookings', v)}
            label="Apply to online bookings"
            description="When on, deposits are required for online customer bookings. Staff walk-in bookings bypass this."
          />

          {/* Policy text */}
          <div>
            <label className={labelClass}>Customer-facing deposit policy</label>
            <textarea
              value={settings.policy_text}
              onChange={e => set('policy_text', e.target.value)}
              rows={4}
              className={`${fieldClass} resize-none`}
              placeholder="Shown to customers when a deposit is required."
            />
            <p className={helperClass}>Displayed on the booking screen when a deposit is required.</p>
          </div>

          {/* SumUp notice */}
          <div className="flex items-start gap-2.5 bg-amber-900/20 border border-amber-700/30 rounded-lg px-4 py-3">
            <Banknote className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-300/80 leading-relaxed space-y-1">
              <p>Deposits are processed via <strong>SumUp</strong>. Money goes directly to your SumUp merchant account — nothing passes through this platform.</p>
              <p>To activate deposits, enter your SumUp API key and merchant code in <strong>Restaurant Profile → SumUp Integration</strong> and enable deposit payments.</p>
            </div>
          </div>
        </div>

        {status && <StatusMsg type={status.type} text={status.text} />}

        <SaveButton saving={saving} onClick={handleSave} label="Save deposit settings" />
      </div>
    </SectionCard>
  );
}

export function BookingRulesPage({ activeTab, onNavigate, onLogout }: BookingRulesPageProps) {
  const { user, isAdmin } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  const set = useCallback(<K extends keyof BookingSettings>(key: K, value: BookingSettings[K]) => {
    setSettings(prev => prev ? { ...prev, [key]: value } : prev);
  }, []);

  const load = useCallback(async () => {
    if (!user?.restaurant_id) { setLoading(false); return; }
    try {
      const [restaurantData, settingsData] = await Promise.all([
        getRestaurant(user.restaurant_id),
        loadSettings(user.restaurant_id),
      ]);
      setRestaurant(restaurantData);
      setSettings(settingsData);
    } catch (err) {
      console.error('[BookingRulesPage] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.restaurant_id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!settings) return;

    const errs = validateSettings(settings);
    if (Object.keys(errs).length > 0) {
      setValidationErrors(errs);
      return;
    }
    setValidationErrors({});

    setSaving(true);
    setStatus(null);
    try {
      await saveSettings(settings);
      // Refresh to get the id if it was an insert
      const fresh = await loadSettings(settings.restaurant_id);
      setSettings(fresh);
      setStatus({ type: 'success', text: 'Booking rules saved.' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ type: 'error', text: `Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setSaving(false);
    }
  };

  if (isAdmin) return null;

  if (loading) {
    return (
      <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={null}>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading booking rules…</p>
        </div>
      </StaffLayout>
    );
  }

  if (!user?.restaurant_id || !settings) {
    return (
      <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={null}>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <AlertCircle className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Restaurant not found.</p>
        </div>
      </StaffLayout>
    );
  }

  const durationOptions = [60, 90, 120, 150, 180];
  const noticeOptions = [
    { value: 0, label: 'No minimum (book any time)' },
    { value: 30, label: '30 minutes' },
    { value: 60, label: '1 hour' },
    { value: 120, label: '2 hours' },
    { value: 240, label: '4 hours' },
  ];

  return (
    <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
      <div className="space-y-5">

        {/* Page header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-800 border border-slate-700">
              <BookOpen className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-100">Booking Rules</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Control how customers book and how your team is notified.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {status && (
              <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border ${
                status.type === 'success'
                  ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-300'
                  : 'bg-red-900/30 border-red-700/50 text-red-300'
              }`}>
                {status.type === 'success'
                  ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                {status.text}
              </div>
            )}
            <SaveButton saving={saving} onClick={handleSave} label="Save all" />
          </div>
        </div>

        {/* 1. Reservation acceptance */}
        <SectionCard
          icon={CheckCircle2}
          title="Reservation Acceptance"
          subtitle="Choose whether online reservations are confirmed immediately or reviewed by staff first."
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => set('reservation_acceptance_mode', 'auto')}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  settings.reservation_acceptance_mode === 'auto'
                    ? 'bg-blue-500/10 border-blue-500/50'
                    : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full border-4 ${settings.reservation_acceptance_mode === 'auto' ? 'border-blue-500 bg-white' : 'border-slate-600'}`} />
                  <span className="text-sm font-semibold text-slate-100">Auto accept</span>
                </div>
                <p className="text-xs text-slate-500 mt-2 ml-6">Available bookings are confirmed immediately and the customer receives confirmation.</p>
              </button>
              <button
                type="button"
                onClick={() => set('reservation_acceptance_mode', 'manual')}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  settings.reservation_acceptance_mode === 'manual'
                    ? 'bg-amber-500/10 border-amber-500/50'
                    : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full border-4 ${settings.reservation_acceptance_mode === 'manual' ? 'border-amber-500 bg-white' : 'border-slate-600'}`} />
                  <span className="text-sm font-semibold text-slate-100">Manual accept</span>
                </div>
                <p className="text-xs text-slate-500 mt-2 ml-6">The table remains blocked while staff review the request. Final confirmation is sent only after acceptance.</p>
              </button>
            </div>

            {settings.reservation_acceptance_mode === 'manual' && (
              <div className="max-w-xs">
                <label className={labelClass}>Staff response window</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={settings.manual_acceptance_timeout_minutes}
                    onChange={event => set('manual_acceptance_timeout_minutes', Math.max(5, Number(event.target.value)))}
                    className={fieldClass}
                  />
                  <span className="text-sm text-slate-500">minutes</span>
                </div>
                <p className={helperClass}>Pending requests appear prominently on the reservations dashboard.</p>
                {validationErrors.manual_acceptance_timeout_minutes && (
                  <p className={errorClass}>{validationErrors.manual_acceptance_timeout_minutes}</p>
                )}
              </div>
            )}
          </div>
        </SectionCard>

        {/* 2. Reservation Duration */}
        <SectionCard
          icon={Clock}
          title="Table Reservation Duration"
          subtitle="Controls how long a table is blocked after a customer books."
        >
          <div className="max-w-xs">
            <label className={labelClass}>Default duration</label>
            <select
              value={settings.default_reservation_duration_minutes}
              onChange={e => set('default_reservation_duration_minutes', Number(e.target.value))}
              className={selectClass}
            >
              {durationOptions.map(mins => (
                <option key={mins} value={mins}>
                  {mins < 60
                    ? `${mins} minutes`
                    : mins === 60
                      ? '1 hour'
                      : `${Math.floor(mins / 60)} hr${mins % 60 > 0 ? ` ${mins % 60} min` : ''}`}
                </option>
              ))}
            </select>
            <p className={helperClass}>
              After this time the table is freed for new bookings on the same day.
            </p>
          </div>
        </SectionCard>

        {/* 3. Reconfirmation */}
        <SectionCard
          icon={Bell}
          title="Booking Reconfirmation"
          subtitle="When enabled, customers are emailed before their booking and asked to confirm or cancel."
        >
          <div className="space-y-5">
            <Toggle
              checked={settings.reconfirmation_enabled}
              onChange={v => set('reconfirmation_enabled', v)}
              label="Enable booking reconfirmation"
              description="Customers receive an email before their booking asking them to confirm or cancel. If disabled, no reconfirmation emails are sent and no auto-cancellations occur."
            />

            <div className={`space-y-4 transition-opacity duration-150 ${settings.reconfirmation_enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>First reminder (hours before booking)</label>
                  <input
                    type="number"
                    min={1}
                    value={settings.first_reconfirmation_hours_before}
                    onChange={e => set('first_reconfirmation_hours_before', Math.max(1, Number(e.target.value)))}
                    className={fieldClass}
                  />
                  <p className={helperClass}>Default: 48 hours</p>
                  {validationErrors.first_reconfirmation_hours_before && (
                    <p className={errorClass}>{validationErrors.first_reconfirmation_hours_before}</p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Second reminder (hours before booking)</label>
                  <input
                    type="number"
                    min={1}
                    value={settings.second_reconfirmation_hours_before}
                    onChange={e => set('second_reconfirmation_hours_before', Math.max(1, Number(e.target.value)))}
                    className={fieldClass}
                  />
                  <p className={helperClass}>Default: 24 hours — only sent if no response to first.</p>
                  {validationErrors.second_reconfirmation_hours_before && (
                    <p className={errorClass}>{validationErrors.second_reconfirmation_hours_before}</p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Final confirmation deadline (hours before booking)</label>
                  <input
                    type="number"
                    min={0}
                    value={settings.auto_cancel_deadline_hours_before}
                    onChange={e => set('auto_cancel_deadline_hours_before', Math.max(0, Number(e.target.value)))}
                    className={fieldClass}
                  />
                  <p className={helperClass}>Default: 6 hours — the cutoff before the no-response action triggers.</p>
                  {validationErrors.auto_cancel_deadline_hours_before && (
                    <p className={errorClass}>{validationErrors.auto_cancel_deadline_hours_before}</p>
                  )}
                </div>
              </div>

              <div>
                <label className={labelClass}>If customer does not respond by the deadline</label>
                <select
                  value={settings.no_response_action}
                  onChange={e => set('no_response_action', e.target.value as NoResponseAction)}
                  className={`${selectClass} max-w-xs`}
                >
                  <option value="nothing">Do nothing</option>
                  <option value="mark_unconfirmed">Mark as unconfirmed</option>
                  <option value="flag_for_review">Flag for staff review</option>
                  <option value="auto_cancel">Auto-cancel booking</option>
                </select>

                {settings.no_response_action === 'auto_cancel' && (
                  <div className="mt-3 flex items-start gap-2.5 bg-red-900/20 border border-red-700/40 rounded-lg px-4 py-3">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300/90 leading-relaxed">
                      <strong>Auto-cancel is on.</strong> Unconfirmed reservations will be automatically cancelled after the final deadline passes. This cannot be undone once triggered. Make sure your timing windows are correct before enabling this.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {settings.reconfirmation_enabled && (
              <div className="flex items-start gap-2.5 bg-emerald-900/20 border border-emerald-700/30 rounded-lg px-4 py-3">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-300/80 leading-relaxed">
                  Reconfirmation is active. New bookings will require customer confirmation. The scheduled job checks every 15 minutes and sends emails at the configured windows.
                </p>
              </div>
            )}
          </div>
        </SectionCard>

        {/* 4. Notification Channels */}
        <SectionCard
          icon={MessageSquare}
          title="Notification Channels"
          subtitle="Choose how reconfirmation requests and chat alerts are delivered."
        >
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Booking confirmations</p>
              <Toggle
                checked={settings.booking_confirmation_sms_enabled}
                onChange={v => set('booking_confirmation_sms_enabled', v)}
                label="Send booking confirmations by SMS"
                description="Sends request, acceptance, rejection and confirmed-booking updates to customers who provide a mobile number."
              />
            </div>

            <div className="border-t border-slate-800 pt-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Reconfirmation</p>
              <div className="space-y-3">
                <Toggle
                  checked={settings.reconfirmation_email_enabled}
                  onChange={v => set('reconfirmation_email_enabled', v)}
                  label="Send reconfirmation by email"
                />
                <div>
                  <Toggle
                    checked={settings.reconfirmation_sms_enabled}
                    onChange={v => set('reconfirmation_sms_enabled', v)}
                    label="Send reconfirmation by SMS"
                  />
                  {settings.reconfirmation_sms_enabled && (
                    <p className="text-xs text-amber-400/80 mt-1.5 ml-12">
                      SMS notifications may incur usage charges depending on your plan.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Chat / messages</p>
              <div className="space-y-3">
                <Toggle
                  checked={settings.chat_email_notifications_enabled}
                  onChange={v => set('chat_email_notifications_enabled', v)}
                  label="Send chat notifications by email"
                />
                <div>
                  <Toggle
                    checked={settings.chat_sms_notifications_enabled}
                    onChange={v => set('chat_sms_notifications_enabled', v)}
                    label="Send chat notifications by SMS"
                  />
                  {settings.chat_sms_notifications_enabled && (
                    <p className="text-xs text-amber-400/80 mt-1.5 ml-12">
                      SMS notifications may incur usage charges depending on your plan.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-2.5">
              <p className="text-xs text-slate-500">
                SMS is delivered through Twilio when the required Edge Function secrets are configured. Customers without a valid mobile number continue to receive email only.
              </p>
            </div>
          </div>
        </SectionCard>

        {/* 5. Minimum Booking Notice */}
        <SectionCard
          icon={CalendarClock}
          title="Minimum Booking Notice"
          subtitle="The shortest notice period a customer can use to make an online booking."
        >
          <div className="max-w-xs">
            <label className={labelClass}>Minimum notice</label>
            <select
              value={settings.minimum_booking_notice_minutes}
              onChange={e => set('minimum_booking_notice_minutes', Number(e.target.value))}
              className={selectClass}
            >
              {noticeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {validationErrors.minimum_booking_notice_minutes && (
              <p className={errorClass}>{validationErrors.minimum_booking_notice_minutes}</p>
            )}
            <p className={helperClass}>
              Customers will be unable to book a table closer to the current time than this window.
            </p>
          </div>
        </SectionCard>

        {/* 5. Maximum Online Party Size */}
        <SectionCard
          icon={Users}
          title="Maximum Online Party Size"
          subtitle="Restrict how large a group can book directly online."
        >
          <div className="max-w-xs">
            <label className={labelClass}>Max party size <span className="text-slate-600">(leave blank for unlimited)</span></label>
            <input
              type="number"
              min={1}
              placeholder="Unlimited"
              value={settings.max_online_party_size ?? ''}
              onChange={e => {
                const v = e.target.value;
                set('max_online_party_size', v === '' ? null : Math.max(1, Number(v)));
              }}
              className={fieldClass}
            />
            {validationErrors.max_online_party_size && (
              <p className={errorClass}>{validationErrors.max_online_party_size}</p>
            )}
            <p className={helperClass}>
              Customers above this party size will see a message asking them to contact the restaurant directly.
            </p>
          </div>
        </SectionCard>

        {/* 6. Joined Table Options */}
        {user?.restaurant_id && (
          <JoinedTableOptionsSection restaurantId={user.restaurant_id} />
        )}

        {/* 7. Deposits */}
        {user?.restaurant_id && (
          <DepositSettingsSection restaurantId={user.restaurant_id} />
        )}

        {/* 8. Future: Guest-Specific Overrides (disabled preview) */}
        <SectionCard
          icon={Lock}
          title="Guest-Specific Overrides"
          subtitle="Coming soon — rules that apply only to specific customers."
        >
          <div className="space-y-4 opacity-50 pointer-events-none select-none">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Custom reservation duration for a guest</label>
                <input type="number" disabled placeholder="e.g. 90" className={fieldClass} />
              </div>
              <div className="flex flex-col justify-end">
                <Toggle checked={false} onChange={() => {}} label="Exempt trusted guests from auto-cancel" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Internal guest notes</label>
              <textarea
                disabled
                placeholder="e.g. VIP — always seat by window"
                rows={2}
                className={`${fieldClass} resize-none`}
              />
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2 bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3">
            <Lock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-500">
              Guest-specific rules will be available once customer profiles are enabled.
            </p>
          </div>
        </SectionCard>

        {/* Bottom save */}
        <div className="flex items-center justify-between gap-4 pt-2 pb-8">
          <div />
          <div className="flex items-center gap-3">
            {status && <StatusMsg type={status.type} text={status.text} />}
            <SaveButton saving={saving} onClick={handleSave} label="Save all changes" />
          </div>
        </div>

      </div>
    </StaffLayout>
  );
}
