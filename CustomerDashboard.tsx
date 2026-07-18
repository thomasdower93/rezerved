import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getCustomerReservations, cancelReservation } from '../services/reservations';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Calendar, Clock, Users, MapPin, X, User, Mail, Phone, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ReservationWithDetails {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  party_size: number;
  start_time: string;
  end_time: string;
  status: string;
  notes: string;
  manage_token: string;
  restaurants: {
    name: string;
    address: string;
  };
  tables: {
    name: string;
  };
}

interface CustomerDashboardProps {
  onMakeReservation: () => void;
  onLogout: () => void;
}

export function CustomerDashboard({ onMakeReservation, onLogout }: CustomerDashboardProps) {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<ReservationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past' | 'profile'>('upcoming');

  const [profileData, setProfileData] = useState({
    full_name: '',
    email: '',
    phone: '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');

  useEffect(() => {
    if (!user) return;
    loadReservations();
    loadProfile();
  }, [user]);

  const loadReservations = async () => {
    if (!user?.email) return;

    try {
      setLoading(true);
      const data = await getCustomerReservations(user.email) as unknown as ReservationWithDetails[];
      setReservations(data);
    } catch (err) {
      setError('Failed to load reservations');
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = async () => {
    if (!user?.auth_user_id) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('user_id', user.auth_user_id)
        .maybeSingle();

      if (!error && data) {
        setProfileData({
          full_name: data.full_name || user.name || '',
          email: data.email || user.email || '',
          phone: data.phone || '',
        });
      } else {
        setProfileData({
          full_name: user.name || '',
          email: user.email || '',
          phone: '',
        });
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.auth_user_id) return;

    setProfileLoading(true);
    setError('');
    setProfileSuccess('');

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.auth_user_id,
          full_name: profileData.full_name,
          email: profileData.email,
          phone: profileData.phone,
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      await supabase
        .from('users')
        .update({
          name: profileData.full_name,
          email: profileData.email,
        })
        .eq('auth_user_id', user.auth_user_id);

      setProfileSuccess('Profile updated successfully');
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (err) {
      setError('Failed to update profile');
      console.error('Profile update error:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleCancelReservation = async (token: string) => {
    if (!confirm('Are you sure you want to cancel this reservation?')) {
      return;
    }

    try {
      await cancelReservation(token);
      await loadReservations();
    } catch (err) {
      setError('Failed to cancel reservation');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const upcomingStatuses = new Set(['booked', 'pending_acceptance', 'pending_payment']);
  const upcomingReservations = reservations.filter(
    r => upcomingStatuses.has(r.status) && new Date(r.start_time) > new Date()
  );

  const pastReservations = reservations.filter(
    r => !upcomingStatuses.has(r.status) || new Date(r.start_time) <= new Date()
  );

  if (loading) {
    return (
      <div className="customer-shell">
        <div className="customer-scroll">
          <main className="customer-main flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-accent mx-auto"></div>
              <p className="mt-4 text-app-text-secondary">Loading your reservations...</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-shell">
      <div className="customer-scroll">
        <main className="customer-main">
          <div className="max-w-6xl mx-auto p-6">
        <div className="premium-card rounded-2xl p-8 mb-6">
          <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
            <div className="flex-1 min-w-0 max-w-full sm:max-w-[60%]">
              <h1 className="text-2xl sm:text-3xl font-bold text-app-text mb-2 break-words">
                Welcome back, {user?.name}
              </h1>
              <p className="text-sm sm:text-base text-app-text-secondary truncate">{user?.email}</p>
            </div>
            <div className="flex flex-wrap gap-3 flex-shrink-0">
              <Button onClick={onMakeReservation} className="whitespace-nowrap">
                Make a Reservation
              </Button>
              <Button onClick={onLogout} variant="secondary" className="whitespace-nowrap">
                Sign Out
              </Button>
            </div>
          </div>

          <div className="flex gap-4 border-b border-app-border">
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'upcoming'
                  ? 'text-app-accent border-b-2 border-app-accent'
                  : 'text-app-text-secondary hover:text-app-text'
              }`}
            >
              Upcoming
            </button>
            <button
              onClick={() => setActiveTab('past')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'past'
                  ? 'text-app-accent border-b-2 border-app-accent'
                  : 'text-app-text-secondary hover:text-app-text'
              }`}
            >
              Past
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'profile'
                  ? 'text-app-accent border-b-2 border-app-accent'
                  : 'text-app-text-secondary hover:text-app-text'
              }`}
            >
              Profile
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {profileSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
            {profileSuccess}
          </div>
        )}

        {activeTab === 'upcoming' && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-app-text mb-4">Upcoming Reservations</h2>
            {upcomingReservations.length === 0 ? (
              <div className="premium-card rounded-xl p-8 text-center">
                <Calendar className="w-16 h-16 text-app-text-tertiary mx-auto mb-4" />
                <p className="text-app-text-secondary mb-4">You don't have any upcoming reservations</p>
                <Button onClick={onMakeReservation}>Make a Reservation</Button>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingReservations.map((reservation) => (
                <div key={reservation.id} className="premium-card rounded-xl p-6 hover:shadow-lg transition-shadow">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-app-text mb-3">
                        {reservation.restaurants.name}
                      </h3>
                      {reservation.status !== 'booked' && (
                        <div className={`inline-flex mb-3 px-3 py-1 rounded-full text-xs font-semibold ${
                          reservation.status === 'pending_acceptance'
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        }`}>
                          {reservation.status === 'pending_acceptance' ? 'Awaiting restaurant acceptance' : 'Deposit payment required'}
                        </div>
                      )}
                      <div className="space-y-2 text-app-text-secondary">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(reservation.start_time)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>{formatTime(reservation.start_time)} - {formatTime(reservation.end_time)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          <span>{reservation.party_size} {reservation.party_size === 1 ? 'guest' : 'guests'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          <span>{reservation.restaurants.address}</span>
                        </div>
                        {reservation.notes && (
                          <div className="mt-3 p-3 bg-app-bg-tertiary rounded-lg">
                            <p className="text-sm text-app-text">
                              <strong>Notes:</strong> {reservation.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => handleCancelReservation(reservation.manage_token)}
                      className="ml-4"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'past' && (
          <div>
            <h2 className="text-2xl font-bold text-app-text mb-4">Past Reservations</h2>
            {pastReservations.length === 0 ? (
              <div className="premium-card rounded-xl p-8 text-center">
                <Calendar className="w-16 h-16 text-app-text-tertiary mx-auto mb-4" />
                <p className="text-app-text-secondary">No past reservations</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pastReservations.map((reservation) => (
                <div key={reservation.id} className="premium-card rounded-xl p-6 opacity-75">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-app-text mb-3">
                        {reservation.restaurants.name}
                      </h3>
                      <div className="space-y-2 text-app-text-secondary">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(reservation.start_time)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>{formatTime(reservation.start_time)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          <span>{reservation.party_size} {reservation.party_size === 1 ? 'guest' : 'guests'}</span>
                        </div>
                      </div>
                      {reservation.status === 'cancelled' && (
                        <div className="mt-3 inline-block px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-sm font-medium">
                          Cancelled
                        </div>
                      )}
                      {reservation.status === 'declined' && (
                        <div className="mt-3 inline-block px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-sm font-medium">
                          Request declined
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="premium-card rounded-xl p-8">
            <h2 className="text-2xl font-bold text-app-text mb-6">Your Profile</h2>

            <div className="space-y-6 max-w-lg">
              <div>
                <label className="block text-sm font-medium text-app-text mb-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Full Name
                  </div>
                </label>
                <Input
                  type="text"
                  value={profileData.full_name}
                  onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                  placeholder="Your full name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-app-text mb-2">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email
                  </div>
                </label>
                <Input
                  type="email"
                  value={profileData.email}
                  onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                  placeholder="your.email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-app-text mb-2">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone Number
                  </div>
                </label>
                <Input
                  type="tel"
                  value={profileData.phone}
                  onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                />
                <p className="text-sm text-app-text-secondary mt-1">
                  Your phone number will be used to pre-fill reservation forms
                </p>
              </div>

              <Button
                onClick={handleSaveProfile}
                disabled={profileLoading}
                className="w-full sm:w-auto"
              >
                <Save className="w-4 h-4 mr-2" />
                {profileLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        )}
          </div>
        </main>
      </div>
    </div>
  );
}
