import React, { useState, useEffect, useCallback } from 'react';
import { StaffLayout, StaffTab } from '../components/StaffLayout';
import { RestaurantPhotosPanel } from '../components/RestaurantPhotosPanel';
import { OpeningHoursEditor, DEFAULT_OPENING_HOURS, validateHours, ValidationError } from '../components/OpeningHoursEditor';
import { useAuth } from '../contexts/AuthContext';
import { getRestaurant, updateRestaurantGooglePlaceId } from '../services/restaurants';
import { supabase } from '../lib/supabase';
import { getSumUpSettings, saveSumUpCredentials } from '../services/sumup';
import { Restaurant, OpeningHours, SumUpSettings } from '../lib/types';
import {
  Store, FileText, Clock, MapPin, AlertCircle, CheckCircle2,
  Loader2, Images, Star, RefreshCw, CreditCard, Eye, EyeOff, Zap, ToggleLeft, ToggleRight,
} from 'lucide-react';


interface RestaurantProfilePageProps {
  activeTab: StaffTab;
  onNavigate: (tab: StaffTab) => void;
  onLogout: () => void;
}

// ── Shared section card wrapper ───────────────────────────────────────────────

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

// ── Inline status message ─────────────────────────────────────────────────────

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

// ── Save button ───────────────────────────────────────────────────────────────

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

// ── Description card ──────────────────────────────────────────────────────────

function DescriptionCard({ restaurantId, initial }: { restaurantId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    const { error } = await supabase
      .from('restaurants')
      .update({ description: value.trim() })
      .eq('id', restaurantId);
    setSaving(false);
    setStatus(error
      ? { type: 'error', text: `Failed to save: ${error.message}` }
      : { type: 'success', text: 'Description saved.' }
    );
    if (!error) setTimeout(() => setStatus(null), 3000);
  };

  return (
    <SectionCard
      icon={FileText}
      title="Public Description"
      subtitle="Shown on your public restaurant booking page."
    >
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        rows={5}
        placeholder="Describe your restaurant — cuisine style, atmosphere, what makes it special…"
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none transition-colors"
      />
      <p className="text-xs text-slate-600 mt-1.5 mb-3">
        {value.trim().length} characters
      </p>
      <SaveButton saving={saving} onClick={save} label="Save description" />
      {status && <StatusMsg type={status.type} text={status.text} />}
    </SectionCard>
  );
}

// ── Location card ─────────────────────────────────────────────────────────────

interface LocationState {
  address: string;
  city: string;
  postcode: string;
  location: string;
}

function LocationCard({ restaurantId, initial }: { restaurantId: string; initial: LocationState }) {
  const [fields, setFields] = useState<LocationState>(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const set = (key: keyof LocationState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields(prev => ({ ...prev, [key]: e.target.value }));

  const save = async () => {
    setSaving(true);
    setStatus(null);
    const { error } = await supabase
      .from('restaurants')
      .update({
        address: fields.address.trim(),
        city: fields.city.trim() || null,
        postcode: fields.postcode.trim() || null,
        location: fields.location.trim(),
      })
      .eq('id', restaurantId);
    setSaving(false);
    setStatus(error
      ? { type: 'error', text: `Failed to save: ${error.message}` }
      : { type: 'success', text: 'Location saved.' }
    );
    if (!error) setTimeout(() => setStatus(null), 3000);
  };

  const fieldClass = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors';
  const labelClass = 'block text-xs font-medium text-slate-400 mb-1.5';

  return (
    <SectionCard
      icon={MapPin}
      title="Location & Address"
      subtitle="Used on your public booking page and in confirmation emails."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="sm:col-span-2">
          <label className={labelClass}>Street address</label>
          <input className={fieldClass} value={fields.address} onChange={set('address')} placeholder="e.g. 42 Church Street" />
        </div>
        <div>
          <label className={labelClass}>City / town</label>
          <input className={fieldClass} value={fields.city} onChange={set('city')} placeholder="e.g. London" />
        </div>
        <div>
          <label className={labelClass}>Postcode</label>
          <input className={fieldClass} value={fields.postcode} onChange={set('postcode')} placeholder="e.g. EC1A 1BB" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Area / neighbourhood <span className="text-slate-600">(shown in restaurant listings)</span></label>
          <input className={fieldClass} value={fields.location} onChange={set('location')} placeholder="e.g. Shoreditch, East London" />
        </div>
      </div>
      <SaveButton saving={saving} onClick={save} label="Save location" />
      {status && <StatusMsg type={status.type} text={status.text} />}
    </SectionCard>
  );
}

// ── Opening hours card ────────────────────────────────────────────────────────

function OpeningHoursCard({ restaurantId, initial }: { restaurantId: string; initial: OpeningHours }) {
  const [hours, setHours] = useState<OpeningHours>(
    Object.keys(initial).length > 0 ? initial : DEFAULT_OPENING_HOURS
  );
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const save = async () => {
    const errs = validateHours(hours);
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    setStatus(null);
    const { error } = await supabase
      .from('restaurants')
      .update({ opening_hours: hours })
      .eq('id', restaurantId);
    setSaving(false);
    setStatus(error
      ? { type: 'error', text: `Failed to save: ${error.message}` }
      : { type: 'success', text: 'Opening hours saved.' }
    );
    if (!error) setTimeout(() => setStatus(null), 3000);
  };

  return (
    <SectionCard
      icon={Clock}
      title="Opening Hours"
      subtitle="Controls when customers can make online bookings and what times are shown on your listing."
    >
      <OpeningHoursEditor value={hours} onChange={setHours} errors={errors} />
      {errors.length > 0 && (
        <p className="text-xs text-red-400 mt-3">Please fix the errors above before saving.</p>
      )}
      <div className="mt-5">
        <SaveButton saving={saving} onClick={save} label="Save opening hours" />
      </div>
      {status && <StatusMsg type={status.type} text={status.text} />}
    </SectionCard>
  );
}

// ── Google Rating card ────────────────────────────────────────────────────────

interface GoogleRatingCardProps {
  restaurantId: string;
  initialPlaceId: string;
  initialRating: number | null;
  initialReviewCount: number | null;
  initialLastSynced: string | null;
  onSynced: (rating: number, reviewCount: number, syncedAt: string) => void;
}

function GoogleRatingCard({
  restaurantId,
  initialPlaceId,
  initialRating,
  initialReviewCount,
  initialLastSynced,
  onSynced,
}: GoogleRatingCardProps) {
  const [placeId, setPlaceId] = useState(initialPlaceId);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rating, setRating] = useState(initialRating);
  const [reviewCount, setReviewCount] = useState(initialReviewCount);
  const [lastSynced, setLastSynced] = useState(initialLastSynced);

  const savePlaceId = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await updateRestaurantGooglePlaceId(restaurantId, placeId);
      setStatus({ type: 'success', text: 'Google Place ID saved.' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    if (!placeId.trim()) {
      setStatus({ type: 'error', text: 'Save a Google Place ID first.' });
      return;
    }
    setSyncing(true);
    setStatus(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/sync-google-rating`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? anonKey}`,
          'Apikey': anonKey,
        },
        body: JSON.stringify({ restaurant_id: restaurantId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Sync failed');
      }
      if (json.skipped) {
        setStatus({ type: 'success', text: json.message });
      } else {
        setRating(json.google_rating);
        setReviewCount(json.google_review_count);
        setLastSynced(json.synced_at);
        onSynced(json.google_rating, json.google_review_count, json.synced_at);
        setStatus({ type: 'success', text: `Synced: ${json.google_rating.toFixed(1)} stars from ${json.google_review_count.toLocaleString()} reviews.` });
      }
      setTimeout(() => setStatus(null), 5000);
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : 'Sync failed.' });
    } finally {
      setSyncing(false);
    }
  };

  const fieldClass = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors font-mono';

  return (
    <SectionCard
      icon={Star}
      title="Google Rating"
      subtitle="Display your verified Google star rating on your Rezerved listing."
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Google Place ID
          </label>
          <input
            className={fieldClass}
            value={placeId}
            onChange={e => setPlaceId(e.target.value)}
            placeholder="e.g. ChIJN1t_tDeuEmsRUsoyG83frY4"
            spellCheck={false}
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Used to display your public Google rating and review count on Rezerved.
            {' '}
            <a
              href="https://developers.google.com/maps/documentation/places/web-service/place-id"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
            >
              How to find your Place ID
            </a>
          </p>
        </div>

        {rating !== null && reviewCount !== null && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 bg-slate-800 rounded-lg border border-slate-700">
            <Star className="w-4 h-4 fill-amber-400 text-amber-400 flex-shrink-0" />
            <span className="text-sm font-bold text-slate-100">{rating.toFixed(1)}</span>
            <span className="text-xs text-slate-400">({reviewCount.toLocaleString()} Google reviews)</span>
            {lastSynced && (
              <span className="text-xs text-slate-600 ml-auto">
                Last synced {new Date(lastSynced).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <SaveButton saving={saving} onClick={savePlaceId} label="Save Place ID" />
          <button
            onClick={syncNow}
            disabled={syncing || !placeId.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600"
          >
            {syncing
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Syncing…</>
              : <><RefreshCw className="w-3.5 h-3.5" />Sync from Google</>
            }
          </button>
        </div>

        {status && <StatusMsg type={status.type} text={status.text} />}
      </div>
    </SectionCard>
  );
}

// ── SumUp Integration card ────────────────────────────────────────────────────

function SumUpCard({ restaurantId }: { restaurantId: string }) {
  const [settings, setSettings] = useState<SumUpSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New-value inputs only — never store or pre-fill the raw credentials
  const [apiKey, setApiKey] = useState('');
  const [merchantCode, setMerchantCode] = useState('');
  const [depositsEnabled, setDepositsEnabled] = useState(false);
  const [posEnabled, setPosEnabled] = useState(false);
  const [posTestMode, setPosTestMode] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    getSumUpSettings(restaurantId)
      .then(s => {
        setSettings(s);
        // Do NOT pre-fill apiKey or merchantCode — they must be re-entered to change
        setDepositsEnabled(s.deposits_enabled);
        setPosEnabled(s.pos_enabled);
        setPosTestMode(s.pos_test_mode ?? false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [restaurantId]);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const webhookUrl = `${supabaseUrl}/functions/v1/sumup-deposit-webhook`;

  const handleSave = async () => {
    const needsInitialSetup = !settings?.api_key_set || !settings?.merchant_code_set;
    if (needsInitialSetup && (!apiKey.trim() || !merchantCode.trim())) {
      setStatus({ type: 'error', text: 'Enter your SumUp API key and merchant code to connect.' });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await saveSumUpCredentials(restaurantId, apiKey, merchantCode, depositsEnabled, posEnabled, posTestMode);
      const updated = await getSumUpSettings(restaurantId);
      setSettings(updated);
      // Clear inputs after save — raw values must not linger in state
      setApiKey('');
      setMerchantCode('');
      setStatus({ type: 'success', text: 'SumUp settings saved.' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!settings?.api_key_set) {
      setStatus({ type: 'error', text: 'Save your API key first.' });
      return;
    }
    setTesting(true);
    setStatus(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/sumup-open-table`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? anonKey}`,
          'Apikey': anonKey,
        },
        body: JSON.stringify({
          reservation_id: '00000000-0000-0000-0000-000000000000',
          restaurant_id: restaurantId,
          table_name: 'Test',
          covers: 2,
          customer_name: 'Connection Test',
        }),
      });
      const json = await res.json();
      // A 503 "not enabled" or 404 "not found" means the key reached SumUp successfully
      if (res.status === 200 || res.status === 404 || (json.error && !json.error.includes('not configured'))) {
        setStatus({ type: 'success', text: 'SumUp connection verified.' });
      } else if (json.error?.includes('not configured')) {
        setStatus({ type: 'error', text: 'API key not saved yet.' });
      } else {
        setStatus({ type: 'error', text: json.error || 'Connection test failed.' });
      }
    } catch {
      setStatus({ type: 'error', text: 'Connection test failed. Check your API key.' });
    } finally {
      setTesting(false);
      setTimeout(() => setStatus(null), 5000);
    }
  };

  const fieldClass = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors font-mono';
  const labelClass = 'block text-xs font-medium text-slate-400 mb-1.5';

  function FeatureToggle({
    checked, onChange, label, description,
  }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
    return (
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="flex items-start gap-3 w-full text-left group"
      >
        <div className="mt-0.5 flex-shrink-0">
          {checked
            ? <ToggleRight className="w-5 h-5 text-blue-400" />
            : <ToggleLeft className="w-5 h-5 text-slate-600" />}
        </div>
        <div>
          <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </button>
    );
  }

  if (loading) {
    return (
      <SectionCard icon={CreditCard} title="SumUp Integration" subtitle="Payment processing and POS table management.">
        <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin" />Loading…
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={CreditCard}
      title="SumUp Integration"
      subtitle="Connect SumUp for deposits and POS table management. Money goes directly to your SumUp account."
    >
      <div className="space-y-6">

        {/* Status badge */}
        {settings?.api_key_set && settings?.merchant_code_set && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-900/20 border border-emerald-700/30 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="text-xs text-emerald-300 font-medium">SumUp connected</span>
            {settings.api_key_preview && (
              <span className="text-xs text-slate-500 ml-1 font-mono">{settings.api_key_preview}</span>
            )}
          </div>
        )}

        {/* API Key */}
        <div>
          <label className={labelClass}>
            API Key
            {settings?.api_key_set && <span className="text-slate-500 font-normal ml-1">(leave blank to keep existing)</span>}
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              className={fieldClass + ' pr-10'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={settings?.api_key_set ? settings.api_key_preview ?? '••••••••••••••••' : 'Paste your SumUp API key'}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Found in your SumUp Developer Dashboard under API Keys.
          </p>
        </div>

        {/* Merchant Code */}
        <div>
          <label className={labelClass}>
            Merchant Code
            {settings?.merchant_code_set && <span className="text-slate-500 font-normal ml-1">(leave blank to keep existing)</span>}
          </label>
          <input
            type="text"
            className={fieldClass}
            value={merchantCode}
            onChange={e => setMerchantCode(e.target.value.toUpperCase())}
            placeholder={settings?.merchant_code_set ? settings.merchant_code_preview ?? '•••••' : 'e.g. MXXXXXXX'}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Found in your SumUp account under Profile → Account → Merchant Code.
          </p>
        </div>

        {/* Feature toggles */}
        <div className="space-y-4 pt-1">
          <FeatureToggle
            checked={depositsEnabled}
            onChange={setDepositsEnabled}
            label="Enable deposit payments"
            description="Customers pay a deposit directly to your SumUp account before large-party bookings are confirmed."
          />
          <FeatureToggle
            checked={posEnabled}
            onChange={v => { setPosEnabled(v); if (!v) setPosTestMode(false); }}
            label="Enable POS table management"
            description="Automatically open a table on your SumUp POS terminal when guests are seated."
          />
          {posEnabled && (
            <div className="ml-8 pl-3 border-l-2 border-slate-700 space-y-3">
              <FeatureToggle
                checked={posTestMode}
                onChange={setPosTestMode}
                label="Shadow mode"
                description="Makes the real SumUp API call and opens a table on the terminal — use outside service to verify the integration works before going live."
              />
              {posTestMode && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-900/20 border border-amber-700/30 rounded-lg">
                  <span className="text-amber-400 text-xs mt-0.5 flex-shrink-0">&#9888;</span>
                  <p className="text-xs text-amber-300/80 leading-relaxed">
                    Shadow mode is on. Seating a guest <span className="font-semibold text-amber-300">will open a real table</span> on the POS terminal — close it manually after verifying. Turn this off when ready to go live.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Webhook URL (shown when deposits enabled) */}
        {depositsEnabled && (
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-slate-300">Webhook URL</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Register this URL in your SumUp Developer Dashboard under Webhooks. SumUp will call it when a deposit is paid.
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs text-amber-300/90 bg-slate-900/60 px-2 py-1.5 rounded font-mono flex-1 break-all">
                {webhookUrl}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(webhookUrl)}
                className="text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-2 py-1.5 rounded transition-colors flex-shrink-0"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <SaveButton saving={saving} onClick={handleSave} label="Save SumUp settings" />
          {settings?.api_key_set && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {testing ? 'Testing…' : 'Test connection'}
            </button>
          )}
        </div>

        {status && <StatusMsg type={status.type} text={status.text} />}
      </div>
    </SectionCard>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function RestaurantProfilePage({ activeTab, onNavigate, onLogout }: RestaurantProfilePageProps) {
  const { user, isAdmin } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.restaurant_id) { setLoading(false); return; }
    try {
      const data = await getRestaurant(user.restaurant_id);
      setRestaurant(data);
    } catch (err) {
      console.error('[RestaurantProfilePage] Failed to load restaurant:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.restaurant_id]);

  useEffect(() => { load(); }, [load]);

  if (isAdmin) return null;

  if (loading) {
    return (
      <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={null}>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading restaurant profile…</p>
        </div>
      </StaffLayout>
    );
  }

  if (!user?.restaurant_id || !restaurant) {
    return (
      <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={null}>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <AlertCircle className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Restaurant not found.</p>
        </div>
      </StaffLayout>
    );
  }

  return (
    <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
      <div className="space-y-5">

        {/* Page header */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-800 border border-slate-700">
            <Store className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Restaurant Profile</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage the public information shown to customers on the booking page.
            </p>
          </div>
        </div>

        {/* 1. Photos */}
        <SectionCard
          icon={Images}
          title="Restaurant Photos"
          subtitle="Up to 8 photos. The first photo is used as your cover image."
        >
          <RestaurantPhotosPanel
            restaurantId={restaurant.id}
            initialImages={restaurant.gallery_images ?? []}
            theme="staff"
            onSaved={(galleryImages, coverImageUrl) => {
              setRestaurant(prev => prev
                ? { ...prev, gallery_images: galleryImages, cover_image_url: coverImageUrl }
                : prev
              );
            }}
          />
        </SectionCard>

        {/* 2. Description */}
        <DescriptionCard
          restaurantId={restaurant.id}
          initial={restaurant.description ?? ''}
        />

        {/* 3. Location */}
        <LocationCard
          restaurantId={restaurant.id}
          initial={{
            address: restaurant.address ?? '',
            city: restaurant.city ?? '',
            postcode: restaurant.postcode ?? '',
            location: restaurant.location ?? '',
          }}
        />

        {/* 4. Opening Hours */}
        <OpeningHoursCard
          restaurantId={restaurant.id}
          initial={restaurant.opening_hours ?? {}}
        />

        {/* 5. Google Rating */}
        <GoogleRatingCard
          restaurantId={restaurant.id}
          initialPlaceId={restaurant.google_place_id ?? ''}
          initialRating={restaurant.google_rating ?? null}
          initialReviewCount={restaurant.google_review_count ?? null}
          initialLastSynced={restaurant.google_reviews_last_synced_at ?? null}
          onSynced={(google_rating, google_review_count, google_reviews_last_synced_at) => {
            setRestaurant(prev => prev
              ? { ...prev, google_rating, google_review_count, google_reviews_last_synced_at }
              : prev
            );
          }}
        />

        {/* 6. SumUp Integration */}
        <SumUpCard restaurantId={restaurant.id} />

      </div>
    </StaffLayout>
  );
}
