import React, { useState, useEffect } from 'react';
import { Input } from '../components/Input';
import { DateSelector } from '../components/DateSelector';
import { TimeSelector } from '../components/TimeSelector';
import { QuickVisitModal } from '../components/QuickVisitModal';
import { ArrowLeft, Users, Phone, Calendar, Clock, CheckCircle2, Zap } from 'lucide-react';
import { Restaurant, TableAvailability, BookingFormData, Table } from '../lib/types';
import { getAvailability, createReservation } from '../services/reservations';
import { getTables } from '../services/tables';

type BookingType = 'walk_in' | 'phone';
type Step = 'select_type' | 'basic_info' | 'table_selection' | 'success';

interface WalkInPhoneBookingProps {
  restaurant: Restaurant;
  onBack: () => void;
  onReservationCreated?: () => void;
}

interface BasicInfoForm {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  party_size: string;
  date: string;
  time: string;
}

function getLocalDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCurrentTime() {
  const now = new Date();
  const rounded = Math.ceil(now.getMinutes() / 15) * 15;
  now.setMinutes(rounded);
  now.setSeconds(0);
  now.setMilliseconds(0);
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function DarkInput({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>
      <input
        {...props}
        className={`w-full px-4 py-2.5 bg-slate-800 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm ${
          error ? 'border-red-500' : 'border-slate-700'
        }`}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function WalkInPhoneBooking({ restaurant, onBack, onReservationCreated }: WalkInPhoneBookingProps) {
  const [bookingType, setBookingType] = useState<BookingType | null>(null);
  const [step, setStep] = useState<Step>('select_type');
  const [showQuickVisit, setShowQuickVisit] = useState(false);
  const [allTables, setAllTables] = useState<Table[]>([]);

  // Load tables once so QuickVisitModal can use them
  useEffect(() => {
    getTables(restaurant.id).then(setAllTables).catch(console.error);
  }, [restaurant.id]);

  const [formData, setFormData] = useState<BasicInfoForm>({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    party_size: '2',
    date: getLocalDate(),
    time: getCurrentTime(),
  });
  const [errors, setErrors] = useState<Partial<BasicInfoForm>>({});
  const [tables, setTables] = useState<TableAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [confirmedReservation, setConfirmedReservation] = useState<{ tableName: string; time: string } | null>(null);

  const handleSelectType = (type: BookingType) => {
    setBookingType(type);
    setStep('basic_info');
    if (type === 'walk_in') {
      setFormData(prev => ({ ...prev, date: getLocalDate(), time: getCurrentTime() }));
    }
  };

  const handleChange = (field: keyof BasicInfoForm, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const handleBasicInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Partial<BasicInfoForm> = {};
    if (!formData.customer_name.trim()) newErrors.customer_name = 'Name is required';
    const partySize = parseInt(formData.party_size);
    if (isNaN(partySize) || partySize < 1) newErrors.party_size = 'Valid party size required';
    if (bookingType === 'phone' && !formData.time) newErrors.time = 'Time is required';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    setLoading(true);
    setSubmitError(null);
    try {
      const availableTables = await getAvailability(restaurant.id, formData.date, formData.time, partySize);
      setTables(availableTables);
      setStep('table_selection');
    } catch (error) {
      console.error(error);
      setSubmitError('Failed to check availability. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTableSelect = async (table: TableAvailability) => {
    if (table.status !== 'green') return;
    setSelectedTable(table.id);
    setLoading(true);
    try {
      const bookingFormData: BookingFormData = {
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        customer_email: formData.customer_email,
        notes: '',
      };
      await createReservation(restaurant.id, table.id, formData.date, formData.time, parseInt(formData.party_size), bookingFormData, {
        source: bookingType || 'walk_in',
        preorderItems: [],
        preorderTotal: 0,
      });
      setConfirmedReservation({ tableName: table.name, time: formData.time });
      setStep('success');
      onReservationCreated?.();
    } catch (error) {
      console.error(error);
      setSubmitError('Failed to create reservation. Please try again.');
      setSelectedTable(null);
    } finally {
      setLoading(false);
    }
  };

  const handleNewBooking = () => {
    setBookingType(null);
    setStep('select_type');
    setFormData({ customer_name: '', customer_phone: '', customer_email: '', party_size: '2', date: getLocalDate(), time: getCurrentTime() });
    setErrors({});
    setTables([]);
    setSelectedTable(null);
    setConfirmedReservation(null);
  };

  const BackButton = ({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-6"
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </button>
  );

  if (step === 'select_type') {
    return (
      <>
        <div className="max-w-2xl mx-auto">
          <BackButton onClick={onBack} label="Back to Reservations" />
          <h2 className="text-xl font-bold text-white mb-1">New Booking</h2>
          <p className="text-sm text-slate-400 mb-6">Select the type of booking to create</p>

          <div className="grid sm:grid-cols-3 gap-4">
            <button
              onClick={() => handleSelectType('walk_in')}
              className="group p-6 bg-slate-900 border border-slate-700 hover:border-blue-500 rounded-xl text-left transition-all"
            >
              <div className="w-10 h-10 bg-blue-500/15 border border-blue-500/30 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-500/25 transition-colors">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-base font-semibold text-white mb-1">Walk-in</h3>
              <p className="text-sm text-slate-400">Customer is here now. Book a table immediately.</p>
            </button>

            <button
              onClick={() => handleSelectType('phone')}
              className="group p-6 bg-slate-900 border border-slate-700 hover:border-emerald-500 rounded-xl text-left transition-all"
            >
              <div className="w-10 h-10 bg-emerald-500/15 border border-emerald-500/30 rounded-lg flex items-center justify-center mb-4 group-hover:bg-emerald-500/25 transition-colors">
                <Phone className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-base font-semibold text-white mb-1">Phone Booking</h3>
              <p className="text-sm text-slate-400">Customer called to make a reservation for a specific time.</p>
            </button>

            <button
              onClick={() => setShowQuickVisit(true)}
              className="group p-6 bg-slate-900 border border-slate-700 hover:border-teal-500 rounded-xl text-left transition-all"
            >
              <div className="w-10 h-10 bg-teal-500/15 border border-teal-500/30 rounded-lg flex items-center justify-center mb-4 group-hover:bg-teal-500/25 transition-colors">
                <Zap className="w-5 h-5 text-teal-400" />
              </div>
              <h3 className="text-base font-semibold text-white mb-1">Quick Visit</h3>
              <p className="text-sm text-slate-400">Seat someone now for a short gap — no details required.</p>
            </button>
          </div>
        </div>

        {showQuickVisit && (
          <QuickVisitModal
            restaurantId={restaurant.id}
            tables={allTables}
            onClose={() => setShowQuickVisit(false)}
            onCreated={() => {
              // Keep modal open so staff can see success screen
              onReservationCreated?.();
            }}
          />
        )}
      </>
    );
  }

  if (step === 'basic_info') {
    return (
      <div className="max-w-2xl mx-auto">
        <BackButton onClick={() => setStep('select_type')} />
        <h2 className="text-xl font-bold text-white mb-1">
          {bookingType === 'walk_in' ? 'Walk-in Details' : 'Phone Booking Details'}
        </h2>
        <p className="text-sm text-slate-400 mb-6">Enter customer information to check availability</p>

        {submitError && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {submitError}
          </div>
        )}

        <form onSubmit={handleBasicInfoSubmit} className="space-y-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
            <DarkInput
              label="Customer Name"
              value={formData.customer_name}
              onChange={(e) => handleChange('customer_name', (e.target as HTMLInputElement).value)}
              error={errors.customer_name}
              placeholder="John Smith"
              required
            />
            <DarkInput
              label="Phone Number"
              type="tel"
              value={formData.customer_phone}
              onChange={(e) => handleChange('customer_phone', (e.target as HTMLInputElement).value)}
              placeholder="+44 20 1234 5678"
            />
            <DarkInput
              label="Email (Optional)"
              type="email"
              value={formData.customer_email}
              onChange={(e) => handleChange('customer_email', (e.target as HTMLInputElement).value)}
              placeholder="john@example.com"
            />
            <DarkInput
              label="Party Size"
              type="number"
              value={formData.party_size}
              onChange={(e) => handleChange('party_size', (e.target as HTMLInputElement).value)}
              error={errors.party_size}
              min="1"
              max="20"
              required
            />

            {bookingType === 'phone' && (
              <div className="grid sm:grid-cols-2 gap-4 pt-1">
                <DateSelector
                  label="Date"
                  value={formData.date}
                  onChange={(date) => handleChange('date', date)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full"
                />
                <TimeSelector
                  label="Time"
                  value={formData.time}
                  onChange={(time) => handleChange('time', time)}
                  className="w-full"
                />
              </div>
            )}

            {bookingType === 'walk_in' && (
              <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <p className="text-sm text-blue-300">
                  Walk-in for now — {formData.date} at {formData.time}
                </p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm"
          >
            {loading ? 'Checking availability...' : 'Check Available Tables'}
          </button>
        </form>
      </div>
    );
  }

  if (step === 'table_selection') {
    const greenTables = tables.filter(t => t.status === 'green');
    const otherTables = tables.filter(t => t.status !== 'green');

    return (
      <div className="max-w-4xl mx-auto">
        <BackButton onClick={() => setStep('basic_info')} />
        <h2 className="text-xl font-bold text-white mb-1">Select a Table</h2>
        <p className="text-sm text-slate-400 mb-6">
          {formData.customer_name} — party of {formData.party_size} — {formData.date} at {formData.time}
        </p>

        {submitError && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {submitError}
          </div>
        )}

        {greenTables.length > 0 ? (
          <div className="mb-6">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Available Tables</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {greenTables.map((table) => (
                <button
                  key={table.id}
                  onClick={() => handleTableSelect(table)}
                  disabled={loading && selectedTable === table.id}
                  className="p-5 bg-slate-900 border border-emerald-500/40 hover:border-emerald-400 hover:bg-emerald-500/5 rounded-xl text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-base font-semibold text-white">{table.name}</h4>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded-md">
                      Available
                    </span>
                  </div>
                  <p className="text-sm text-slate-400">
                    Up to {table.capacity} {table.capacity === 1 ? 'person' : 'people'}
                  </p>
                  {loading && selectedTable === table.id && (
                    <p className="text-xs text-blue-400 mt-2">Creating reservation...</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-6 p-5 bg-red-500/10 border border-red-500/30 rounded-xl">
            <p className="text-red-300 font-semibold">No tables available</p>
            <p className="text-sm text-red-400/70 mt-1">
              There are no suitable tables available for this time and party size.
            </p>
          </div>
        )}

        {otherTables.length > 0 && (
          <div className="opacity-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Unavailable Tables</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {otherTables.map((table) => (
                <div
                  key={table.id}
                  className="p-5 bg-slate-900 border border-slate-700 rounded-xl"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-base font-semibold text-white">{table.name}</h4>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-md ${
                      table.status === 'yellow'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {table.status === 'yellow' ? 'Alternative' : 'Unavailable'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    Capacity: {table.capacity} {table.capacity === 1 ? 'person' : 'people'}
                  </p>
                  {table.reason && <p className="text-xs text-slate-600 mt-1">{table.reason}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === 'success' && confirmedReservation) {
    return (
      <div className="max-w-md mx-auto text-center pt-8">
        <div className="w-16 h-16 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">
          {bookingType === 'walk_in' ? 'Walk-in Booked!' : 'Phone Booking Created!'}
        </h2>
        <p className="text-slate-400 mb-8 text-sm">
          {formData.customer_name} has been booked on <span className="text-white font-semibold">{confirmedReservation.tableName}</span> at <span className="text-white font-semibold">{confirmedReservation.time}</span>
        </p>
        <div className="space-y-3">
          <button
            onClick={handleNewBooking}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            Create Another Booking
          </button>
          <button
            onClick={onBack}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-semibold rounded-lg transition-colors text-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return null;
}
