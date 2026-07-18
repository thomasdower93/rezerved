import React, { useState, useEffect } from 'react';
import { LogOut, MapPin, Clock, Plus, Users, X, Trash2, ChevronDown, ChevronUp, Images, ClipboardList } from 'lucide-react';
import { RezervdLogo } from '../../components/RezervdLogo';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { OpeningHoursEditor, DEFAULT_OPENING_HOURS, validateHours, ValidationError } from '../../components/OpeningHoursEditor';
import { useAuth } from '../../contexts/AuthContext';
import { getRestaurants, updateRestaurantTableMapEnabled, updateRestaurantPreordersPlanEnabled, updateRestaurantDessertsEnabled, updateRestaurantBookingLimits } from '../../services/restaurants';
import { RestaurantPhotosPanel } from '../../components/RestaurantPhotosPanel';
import { createRestaurant, createStaffAccount, getRestaurantStaff, removeStaffMember, updateStaffRole, updateRestaurantAmenities, updateRestaurantTags, updateRestaurantOpeningHours, StaffMember, CreateRestaurantData, CreateStaffData } from '../../services/admin';
import { getTrialRequests, updateTrialRequestStatus, TrialRequest } from '../../services/trialRequests';
import { Restaurant, OpeningHours } from '../../lib/types';

interface RestaurantsAdminPageProps {
  onLogout: () => void;
}

export function RestaurantsAdminPage({ onLogout }: RestaurantsAdminPageProps) {
  const { user } = useAuth();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedRestaurantId, setExpandedRestaurantId] = useState<string | null>(null);
  const [staffMembers, setStaffMembers] = useState<Record<string, StaffMember[]>>({});
  const [loadingStaff, setLoadingStaff] = useState<Record<string, boolean>>({});
  const [showStaffForm, setShowStaffForm] = useState<string | null>(null);
  const [generatedCredentials, setGeneratedCredentials] = useState<{ email: string; password: string; label?: string } | null>(null);

  // Trial requests
  const [trialRequests, setTrialRequests] = useState<TrialRequest[]>([]);
  const [loadingTrials, setLoadingTrials] = useState(false);
  const [showTrialRequests, setShowTrialRequests] = useState(true);
  const [updatingTrialId, setUpdatingTrialId] = useState<string | null>(null);

  const [newRestaurant, setNewRestaurant] = useState<CreateRestaurantData>({
    name: '',
    location: '',
    address: '',
    description: '',
    cuisine: '',
    business_type: '',
    city: '',
    postcode: '',
    country: 'United Kingdom',
    table_map_enabled: true,
    preorders_plan_enabled: false,
    price_range: '$$',
    amenities: [],
    tags: [],
    minimum_booking_notice_minutes: 120,
    max_online_party_size: 8,
    createOwner: false,
    ownerEmail: '',
    ownerName: '',
  });

  // Per-restaurant booking limits editing state
  const [editingBookingLimits, setEditingBookingLimits] = useState<Record<string, {
    minimum_booking_notice_minutes: number;
    max_online_party_size: number | null;
  }>>({});
  const [savingBookingLimits, setSavingBookingLimits] = useState<Record<string, boolean>>({});

  const [newStaff, setNewStaff] = useState<Omit<CreateStaffData, 'restaurant_id'>>({
    email: '',
    full_name: '',
    role: 'staff',
    initial_password: '',
  });

  // Opening hours editor state
  const [createFormHours, setCreateFormHours] = useState<OpeningHours>(DEFAULT_OPENING_HOURS);
  const [createFormHoursErrors, setCreateFormHoursErrors] = useState<ValidationError[]>([]);
  const [editingHours, setEditingHours] = useState<Record<string, OpeningHours>>({});
  const [editingHoursErrors, setEditingHoursErrors] = useState<Record<string, ValidationError[]>>({});
  const [savingHours, setSavingHours] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (user?.role !== 'admin') {
      onLogout();
      return;
    }
    loadRestaurants();
    loadTrials();
  }, [user]);

  const loadRestaurants = async () => {
    try {
      setLoading(true);
      const data = await getRestaurants();
      setRestaurants(data);
    } catch (err) {
      setError('Failed to load restaurants');
    } finally {
      setLoading(false);
    }
  };

  const loadTrials = async () => {
    setLoadingTrials(true);
    try {
      const data = await getTrialRequests();
      setTrialRequests(data);
    } catch {
      // non-fatal — admin can refresh
    } finally {
      setLoadingTrials(false);
    }
  };

  const handleTrialStatusChange = async (id: string, status: string) => {
    setUpdatingTrialId(id);
    try {
      await updateTrialRequestStatus(id, status);
      setTrialRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch {
      setError('Failed to update trial request status');
    } finally {
      setUpdatingTrialId(null);
    }
  };

  const handleCreateRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const hoursErrors = validateHours(createFormHours);
    if (hoursErrors.length > 0) {
      setCreateFormHoursErrors(hoursErrors);
      return;
    }
    setCreateFormHoursErrors([]);
    setLoading(true);

    try {
      const { restaurant, ownerCredentials } = await createRestaurant({ ...newRestaurant, opening_hours: createFormHours });
      setSuccessMessage(`Restaurant "${restaurant.name}" created successfully!`);
      if (ownerCredentials) {
        setGeneratedCredentials({ email: ownerCredentials.email, password: ownerCredentials.temporaryPassword, label: 'Owner Account Created' });
      }
      setNewRestaurant({
        name: '',
        location: '',
        address: '',
        description: '',
        cuisine: '',
        business_type: '',
        city: '',
        postcode: '',
        country: 'United Kingdom',
        table_map_enabled: true,
        preorders_plan_enabled: false,
        price_range: '$$',
        amenities: [],
        tags: [],
        minimum_booking_notice_minutes: 120,
        max_online_party_size: 8,
        createOwner: false,
        ownerEmail: '',
        ownerName: '',
      });
      setCreateFormHours(DEFAULT_OPENING_HOURS);
      setCreateFormHoursErrors([]);
      setShowCreateForm(false);
      await loadRestaurants();
    } catch (err: any) {
      setError(err.message || 'Failed to create restaurant');
    } finally {
      setLoading(false);
    }
  };

  const loadStaffForRestaurant = async (restaurantId: string) => {
    setLoadingStaff(prev => ({ ...prev, [restaurantId]: true }));
    try {
      const staff = await getRestaurantStaff(restaurantId);
      setStaffMembers(prev => ({ ...prev, [restaurantId]: staff }));
    } catch (err: any) {
      setError(err.message || 'Failed to load staff');
    } finally {
      setLoadingStaff(prev => ({ ...prev, [restaurantId]: false }));
    }
  };

  const handleToggleRestaurant = async (restaurantId: string) => {
    if (expandedRestaurantId === restaurantId) {
      setExpandedRestaurantId(null);
    } else {
      setExpandedRestaurantId(restaurantId);
      if (!staffMembers[restaurantId]) {
        await loadStaffForRestaurant(restaurantId);
      }
      // Initialise editing hours from current restaurant data
      const restaurant = restaurants.find(r => r.id === restaurantId);
      if (restaurant && !editingHours[restaurantId]) {
        const hours = restaurant.opening_hours && Object.keys(restaurant.opening_hours).length > 0
          ? restaurant.opening_hours
          : DEFAULT_OPENING_HOURS;
        setEditingHours(prev => ({ ...prev, [restaurantId]: hours }));
      }
      // Initialise booking limits editing state
      if (restaurant && !editingBookingLimits[restaurantId]) {
        setEditingBookingLimits(prev => ({
          ...prev,
          [restaurantId]: {
            minimum_booking_notice_minutes: restaurant.minimum_booking_notice_minutes ?? 120,
            max_online_party_size: restaurant.max_online_party_size ?? 8,
          },
        }));
      }
    }
  };

  const handleSaveOpeningHours = async (restaurantId: string) => {
    const hours = editingHours[restaurantId];
    if (!hours) return;

    const errors = validateHours(hours);
    if (errors.length > 0) {
      setEditingHoursErrors(prev => ({ ...prev, [restaurantId]: errors }));
      return;
    }
    setEditingHoursErrors(prev => ({ ...prev, [restaurantId]: [] }));
    setSavingHours(prev => ({ ...prev, [restaurantId]: true }));

    try {
      await updateRestaurantOpeningHours(restaurantId, hours);
      setRestaurants(prev => prev.map(r => r.id === restaurantId ? { ...r, opening_hours: hours } : r));
      setSuccessMessage('Opening hours updated successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to save opening hours');
    } finally {
      setSavingHours(prev => ({ ...prev, [restaurantId]: false }));
    }
  };

  const handleSaveBookingLimits = async (restaurantId: string) => {
    const limits = editingBookingLimits[restaurantId];
    if (!limits) return;
    setSavingBookingLimits(prev => ({ ...prev, [restaurantId]: true }));
    try {
      await updateRestaurantBookingLimits(
        restaurantId,
        limits.minimum_booking_notice_minutes,
        limits.max_online_party_size
      );
      setRestaurants(prev => prev.map(r =>
        r.id === restaurantId
          ? { ...r, minimum_booking_notice_minutes: limits.minimum_booking_notice_minutes, max_online_party_size: limits.max_online_party_size }
          : r
      ));
      setSuccessMessage('Booking limits updated successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to save booking limits');
    } finally {
      setSavingBookingLimits(prev => ({ ...prev, [restaurantId]: false }));
    }
  };

  const handleAddStaff = async (e: React.FormEvent, restaurantId: string) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const result = await createStaffAccount({
        ...newStaff,
        restaurant_id: restaurantId,
      });
      setGeneratedCredentials({
        email: result.email,
        password: result.temporaryPassword,
        label: 'Staff Account Created',
      });
      setSuccessMessage(`Staff account created successfully!`);
      setNewStaff({ email: '', full_name: '', role: 'staff', initial_password: '' });
      setShowStaffForm(null);
      await loadStaffForRestaurant(restaurantId);
    } catch (err: any) {
      setError(err.message || 'Failed to create staff account');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveStaff = async (userId: string, restaurantId: string) => {
    if (!window.confirm('Are you sure you want to remove this staff member? They will lose access to this restaurant.')) {
      return;
    }

    setError(null);
    try {
      await removeStaffMember(userId, restaurantId);
      setSuccessMessage('Staff member removed successfully');
      await loadStaffForRestaurant(restaurantId);
    } catch (err: any) {
      setError(err.message || 'Failed to remove staff member');
    }
  };

  const handleUpdateStaffRole = async (userId: string, restaurantId: string, newRole: 'staff' | 'restaurant_admin') => {
    setError(null);
    try {
      await updateStaffRole(userId, restaurantId, newRole);
      setSuccessMessage('Staff role updated successfully');
      await loadStaffForRestaurant(restaurantId);
    } catch (err: any) {
      setError(err.message || 'Failed to update staff role');
    }
  };

  const handleToggle = async (restaurantId: string, currentValue: boolean) => {
    const restaurant = restaurants.find(r => r.id === restaurantId);
    const newValue = !currentValue;
    const action = newValue ? 'enable' : 'disable';

    if (!window.confirm(`Are you sure you want to ${action} the table map for "${restaurant?.name}"? ${!newValue ? 'Customers will not be able to see or select tables visually.' : ''}`)) {
      return;
    }

    setUpdatingId(restaurantId);
    setError(null);

    setRestaurants(prevRestaurants =>
      prevRestaurants.map(r =>
        r.id === restaurantId ? { ...r, table_map_enabled: newValue } : r
      )
    );

    try {
      await updateRestaurantTableMapEnabled(restaurantId, newValue);
    } catch (err) {
      setRestaurants(prevRestaurants =>
        prevRestaurants.map(r =>
          r.id === restaurantId ? { ...r, table_map_enabled: currentValue } : r
        )
      );
      setError('Failed to update module status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePreordersPlanToggle = async (restaurantId: string, currentValue: boolean) => {
    const restaurant = restaurants.find(r => r.id === restaurantId);
    const newValue = !currentValue;
    const action = newValue ? 'enable' : 'disable';

    if (!window.confirm(`Are you sure you want to ${action} pre-orders for "${restaurant?.name}"? ${!newValue ? 'This will also disable staff pre-order management for this restaurant.' : ''}`)) {
      return;
    }

    setUpdatingId(restaurantId);
    setError(null);

    const updates: Partial<Restaurant> = { preorders_plan_enabled: newValue };

    if (!newValue) {
      updates.preorders_enabled = false;
    }

    setRestaurants(prevRestaurants =>
      prevRestaurants.map(r =>
        r.id === restaurantId ? { ...r, ...updates } : r
      )
    );

    try {
      await updateRestaurantPreordersPlanEnabled(restaurantId, newValue);
    } catch (err) {
      setRestaurants(prevRestaurants =>
        prevRestaurants.map(r =>
          r.id === restaurantId ? { ...r, preorders_plan_enabled: currentValue } : r
        )
      );
      setError('Failed to update preorders module status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDessertsToggle = async (restaurantId: string, currentValue: boolean) => {
    const newValue = !currentValue;
    setUpdatingId(restaurantId);
    setError(null);

    setRestaurants(prevRestaurants =>
      prevRestaurants.map(r =>
        r.id === restaurantId ? { ...r, desserts_enabled: newValue } : r
      )
    );

    try {
      await updateRestaurantDessertsEnabled(restaurantId, newValue);
    } catch (err) {
      setRestaurants(prevRestaurants =>
        prevRestaurants.map(r =>
          r.id === restaurantId ? { ...r, desserts_enabled: currentValue } : r
        )
      );
      setError('Failed to update desserts setting');
    } finally {
      setUpdatingId(null);
    }
  };

  const getPreordersStatus = (restaurant: Restaurant) => {
    if (!restaurant.preorders_plan_enabled) {
      return { text: 'Not available for this restaurant', color: 'text-slate-500' };
    }
    if (restaurant.preorders_enabled) {
      return { text: 'Restaurant currently using pre-orders', color: 'text-green-600' };
    }
    return { text: 'Restaurant has pre-orders turned off', color: 'text-amber-600' };
  };

  const formatOpeningHours = (hours: OpeningHours) => {
    const days = Object.keys(hours).slice(0, 2);
    if (days.length === 0) return 'Hours not set';

    const firstDay = hours[days[0]];
    if (firstDay.closed) return 'Closed today';

    return `${firstDay.open} - ${firstDay.close}`;
  };

  const availableAmenities = [
    { id: 'wifi', label: 'WiFi' },
    { id: 'wheelchair_accessible', label: 'Wheelchair Accessible' },
    { id: 'outdoor_seating', label: 'Outdoor Seating' },
    { id: 'parking', label: 'Parking Available' },
  ];

  const availableTags = [
    { id: 'popular', label: 'Popular' },
    { id: 'top_rated', label: 'Top Rated' },
    { id: 'new', label: 'New' },
  ];

  const toggleAmenityInForm = (amenity: string) => {
    const current = newRestaurant.amenities || [];
    const updated = current.includes(amenity)
      ? current.filter(a => a !== amenity)
      : [...current, amenity];
    setNewRestaurant({ ...newRestaurant, amenities: updated });
  };

  const toggleTagInForm = (tag: string) => {
    const current = newRestaurant.tags || [];
    const updated = current.includes(tag)
      ? current.filter(t => t !== tag)
      : [...current, tag];
    setNewRestaurant({ ...newRestaurant, tags: updated });
  };

  const handleToggleAmenity = async (restaurantId: string, amenity: string) => {
    const restaurant = restaurants.find(r => r.id === restaurantId);
    if (!restaurant) return;

    const currentAmenities = restaurant.amenities || [];
    const newAmenities = currentAmenities.includes(amenity)
      ? currentAmenities.filter(a => a !== amenity)
      : [...currentAmenities, amenity];

    setRestaurants(prevRestaurants =>
      prevRestaurants.map(r =>
        r.id === restaurantId ? { ...r, amenities: newAmenities } : r
      )
    );

    try {
      await updateRestaurantAmenities(restaurantId, newAmenities);
    } catch (err: any) {
      setError(err.message || 'Failed to update amenities');
      setRestaurants(prevRestaurants =>
        prevRestaurants.map(r =>
          r.id === restaurantId ? { ...r, amenities: currentAmenities } : r
        )
      );
    }
  };

  const handleToggleTag = async (restaurantId: string, tag: string) => {
    const restaurant = restaurants.find(r => r.id === restaurantId);
    if (!restaurant) return;

    const currentTags = restaurant.tags || [];
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];

    setRestaurants(prevRestaurants =>
      prevRestaurants.map(r =>
        r.id === restaurantId ? { ...r, tags: newTags } : r
      )
    );

    try {
      await updateRestaurantTags(restaurantId, newTags);
    } catch (err: any) {
      setError(err.message || 'Failed to update tags');
      setRestaurants(prevRestaurants =>
        prevRestaurants.map(r =>
          r.id === restaurantId ? { ...r, tags: currentTags } : r
        )
      );
    }
  };

  if (user?.role !== 'admin') {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      <nav className="bg-white shadow-md border-b border-slate-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <RezervdLogo size="sm" />
              <div className="h-10 w-px bg-slate-300"></div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
                <p className="text-sm text-slate-600 mt-1">Manage restaurants and staff</p>
              </div>
            </div>
            <Button variant="secondary" onClick={onLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex justify-between items-center">
            <span>{successMessage}</span>
            <button onClick={() => setSuccessMessage(null)} className="text-green-700 hover:text-green-900">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {generatedCredentials && (
          <div className="mb-6 p-6 bg-blue-50 border-2 border-blue-300 rounded-lg">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-blue-900">{generatedCredentials.label ?? 'Account Created'}</h3>
              <button onClick={() => setGeneratedCredentials(null)} className="text-blue-700 hover:text-blue-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-blue-800 mb-4">Share these credentials with the new staff member:</p>
            <div className="bg-white p-4 rounded border border-blue-200 space-y-2">
              <div>
                <span className="font-semibold text-slate-700">Email:</span>
                <span className="ml-2 text-slate-900">{generatedCredentials.email}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-700">Temporary Password:</span>
                <span className="ml-2 text-slate-900 font-mono">{generatedCredentials.password}</span>
              </div>
            </div>
            <p className="text-sm text-blue-700 mt-4">
              The staff member should change this password after their first login.
            </p>
          </div>
        )}

        <div className="space-y-6">

          {/* ── Trial Requests Panel ── */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <button
              className="w-full flex items-center justify-between text-left"
              onClick={() => setShowTrialRequests(v => !v)}
            >
              <div className="flex items-center gap-3">
                <ClipboardList className="w-5 h-5 text-amber-600" />
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Trial Requests</h2>
                  <p className="text-slate-600 text-sm mt-0.5">
                    Restaurant owners who requested a Rezerved trial
                    {trialRequests.length > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-semibold">
                        {trialRequests.filter(r => r.status === 'new').length} new
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {showTrialRequests ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </button>

            {showTrialRequests && (
              <div className="mt-6">
                {loadingTrials ? (
                  <p className="text-slate-500 text-sm">Loading trial requests...</p>
                ) : trialRequests.length === 0 ? (
                  <p className="text-slate-400 text-sm">No trial requests yet.</p>
                ) : (
                  <div className="space-y-4">
                    {trialRequests.map(req => (
                      <div key={req.id} className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors">
                        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                          <div>
                            <p className="font-semibold text-slate-900">{req.restaurant_name}</p>
                            <p className="text-sm text-slate-600">{req.contact_name} {'\u2014'} {req.location}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <select
                              value={req.status}
                              disabled={updatingTrialId === req.id}
                              onChange={e => handleTrialStatusChange(req.id, e.target.value)}
                              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-amber-400"
                            >
                              <option value="new">New</option>
                              <option value="contacted">Contacted</option>
                              <option value="trial_agreed">Trial agreed</option>
                              <option value="not_suitable">Not suitable</option>
                              <option value="closed">Closed</option>
                            </select>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              req.status === 'new' ? 'bg-amber-100 text-amber-700' :
                              req.status === 'contacted' ? 'bg-blue-100 text-blue-700' :
                              req.status === 'trial_agreed' ? 'bg-green-100 text-green-700' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {req.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-sm mb-3">
                          <div><span className="text-slate-400 text-xs">Email</span><br /><a href={`mailto:${req.email}`} className="text-blue-600 hover:underline">{req.email}</a></div>
                          <div><span className="text-slate-400 text-xs">Phone</span><br /><span className="text-slate-700">{req.phone}</span></div>
                          <div><span className="text-slate-400 text-xs">Current system</span><br /><span className="text-slate-700">{req.current_booking_system}</span></div>
                          {req.website && <div><span className="text-slate-400 text-xs">Website</span><br /><a href={req.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block">{req.website}</a></div>}
                          {req.covers && <div><span className="text-slate-400 text-xs">Covers</span><br /><span className="text-slate-700">{req.covers}</span></div>}
                          <div><span className="text-slate-400 text-xs">Submitted</span><br /><span className="text-slate-700">{new Date(req.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                        </div>
                        {req.interests && req.interests.length > 0 && (
                          <div className="mb-2">
                            <span className="text-slate-400 text-xs">Interests: </span>
                            <span className="text-slate-600 text-xs">{req.interests.join(', ')}</span>
                          </div>
                        )}
                        {req.message && (
                          <div className="mt-2 p-3 bg-slate-50 rounded-lg text-sm text-slate-600 italic">
                            "{req.message}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Restaurants</h2>
                <p className="text-slate-600 mt-1">Manage restaurants and their staff</p>
              </div>
              <Button onClick={() => setShowCreateForm(!showCreateForm)} variant="primary">
                <Plus className="w-4 h-4 mr-2" />
                Create Restaurant
              </Button>
            </div>

            {showCreateForm && (
              <form onSubmit={handleCreateRestaurant} className="mb-6 p-6 bg-slate-50 border border-slate-200 rounded-lg">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Create New Restaurant</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Restaurant Name"
                    value={newRestaurant.name}
                    onChange={(e) => setNewRestaurant({ ...newRestaurant, name: e.target.value })}
                    required
                  />
                  <Input
                    label="Location"
                    value={newRestaurant.location}
                    onChange={(e) => setNewRestaurant({ ...newRestaurant, location: e.target.value })}
                    required
                  />
                  <Input
                    label="Address"
                    value={newRestaurant.address}
                    onChange={(e) => setNewRestaurant({ ...newRestaurant, address: e.target.value })}
                    required
                    className="md:col-span-2"
                  />
                  <Input
                    label="City"
                    value={newRestaurant.city || ''}
                    onChange={(e) => setNewRestaurant({ ...newRestaurant, city: e.target.value })}
                  />
                  <Input
                    label="Postcode"
                    value={newRestaurant.postcode || ''}
                    onChange={(e) => setNewRestaurant({ ...newRestaurant, postcode: e.target.value })}
                  />
                  <Input
                    label="Cuisine"
                    value={newRestaurant.cuisine || ''}
                    onChange={(e) => setNewRestaurant({ ...newRestaurant, cuisine: e.target.value })}
                  />
                  <Input
                    label="Business Type"
                    value={newRestaurant.business_type || ''}
                    onChange={(e) => setNewRestaurant({ ...newRestaurant, business_type: e.target.value })}
                  />
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                    <textarea
                      value={newRestaurant.description || ''}
                      onChange={(e) => setNewRestaurant({ ...newRestaurant, description: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      rows={3}
                    />
                  </div>

                  <div className="md:col-span-2 flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRestaurant.table_map_enabled}
                        onChange={(e) => setNewRestaurant({ ...newRestaurant, table_map_enabled: e.target.checked })}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-slate-700">Enable Table Map</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRestaurant.preorders_plan_enabled}
                        onChange={(e) => setNewRestaurant({ ...newRestaurant, preorders_plan_enabled: e.target.checked })}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-slate-700">Enable Pre-orders</span>
                    </label>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Amenities</label>
                    <div className="flex flex-wrap gap-3">
                      {availableAmenities.map(amenity => (
                        <label key={amenity.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newRestaurant.amenities?.includes(amenity.id)}
                            onChange={() => toggleAmenityInForm(amenity.id)}
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700">{amenity.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Badges</label>
                    <div className="flex flex-wrap gap-3">
                      {availableTags.map(tag => (
                        <label key={tag.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newRestaurant.tags?.includes(tag.id)}
                            onChange={() => toggleTagInForm(tag.id)}
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700">{tag.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-2 border-t border-slate-300 pt-4 mt-2">
                    <h4 className="text-sm font-semibold text-slate-900 mb-1">Booking Limits</h4>
                    <p className="text-xs text-slate-500 mb-3">Controls for online bookings only. Staff can always book regardless of these limits.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Minimum notice for online bookings</label>
                        <select
                          value={newRestaurant.minimum_booking_notice_minutes ?? 120}
                          onChange={e => setNewRestaurant({ ...newRestaurant, minimum_booking_notice_minutes: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        >
                          <option value={0}>No minimum</option>
                          <option value={30}>30 minutes</option>
                          <option value={60}>1 hour</option>
                          <option value={120}>2 hours</option>
                          <option value={240}>4 hours</option>
                          <option value={1440}>24 hours</option>
                        </select>
                        <p className="text-xs text-slate-500 mt-1">Prevents last-minute online bookings.</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Maximum online party size</label>
                        <select
                          value={newRestaurant.max_online_party_size ?? 8}
                          onChange={e => {
                            const v = e.target.value;
                            setNewRestaurant({ ...newRestaurant, max_online_party_size: v === 'null' ? null : Number(v) });
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        >
                          <option value={2}>2 guests</option>
                          <option value={4}>4 guests</option>
                          <option value={6}>6 guests</option>
                          <option value={8}>8 guests</option>
                          <option value={10}>10 guests</option>
                          <option value={12}>12 guests</option>
                          <option value="null">No limit</option>
                        </select>
                        <p className="text-xs text-slate-500 mt-1">Larger groups can be asked to contact the restaurant directly.</p>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2 border-t border-slate-300 pt-4 mt-2">
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Opening Times</h4>
                    <OpeningHoursEditor
                      value={createFormHours}
                      onChange={setCreateFormHours}
                      errors={createFormHoursErrors}
                    />
                  </div>

                  <div className="md:col-span-2 border-t border-slate-300 pt-4 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer mb-4">
                      <input
                        type="checkbox"
                        checked={newRestaurant.createOwner}
                        onChange={(e) => setNewRestaurant({ ...newRestaurant, createOwner: e.target.checked })}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-slate-700">Create owner account</span>
                    </label>
                    {newRestaurant.createOwner && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
                        <Input
                          label="Owner Email"
                          type="email"
                          value={newRestaurant.ownerEmail || ''}
                          onChange={(e) => setNewRestaurant({ ...newRestaurant, ownerEmail: e.target.value })}
                          required={newRestaurant.createOwner}
                        />
                        <Input
                          label="Owner Name"
                          value={newRestaurant.ownerName || ''}
                          onChange={(e) => setNewRestaurant({ ...newRestaurant, ownerName: e.target.value })}
                          required={newRestaurant.createOwner}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button type="submit" variant="primary" disabled={loading}>
                    Create Restaurant
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setShowCreateForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {loading && !showCreateForm ? (
              <div className="text-center py-12">
                <p className="text-slate-600">Loading restaurants...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {restaurants.map((restaurant) => (
                  <div
                    key={restaurant.id}
                    className="border border-slate-200 rounded-lg overflow-hidden"
                  >
                    <div className="p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-slate-900">
                              {restaurant.name}
                            </h3>
                            <button
                              onClick={() => handleToggleRestaurant(restaurant.id)}
                              className="text-slate-500 hover:text-slate-700"
                            >
                              <Users className="w-5 h-5" />
                            </button>
                          </div>

                          <div className="flex items-center text-sm text-slate-600 mb-1">
                            <MapPin className="w-4 h-4 mr-1" />
                            <span>{restaurant.location}</span>
                          </div>

                          <div className="flex items-center text-sm text-slate-600 mb-2">
                            <Clock className="w-4 h-4 mr-1" />
                            <span>{formatOpeningHours(restaurant.opening_hours)}</span>
                          </div>

                          {restaurant.description && (
                            <p className="text-sm text-slate-500 line-clamp-2">
                              {restaurant.description}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col gap-3 md:items-end">
                          <label className="flex items-center justify-between md:justify-start gap-2 md:gap-3 cursor-pointer w-full md:w-auto">
                            <span className="text-sm md:text-base font-medium text-slate-700">
                              Table Map module
                            </span>
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                <input
                                  type="checkbox"
                                  checked={restaurant.table_map_enabled ?? true}
                                  onChange={() => handleToggle(restaurant.id, restaurant.table_map_enabled ?? true)}
                                  disabled={updatingId === restaurant.id}
                                  className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-blue-600 peer-focus:ring-4 peer-focus:ring-blue-300 transition-colors"></div>
                                <div className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-5"></div>
                              </div>
                              <div className="text-xs md:text-sm w-16 text-right">
                                {restaurant.table_map_enabled ? (
                                  <span className="text-green-600 font-medium">Enabled</span>
                                ) : (
                                  <span className="text-slate-500 font-medium">Disabled</span>
                                )}
                              </div>
                            </div>
                          </label>

                          <div className="w-full md:w-auto">
                            <label className="flex items-center justify-between md:justify-start gap-2 md:gap-3 cursor-pointer w-full md:w-auto">
                              <span className="text-sm md:text-base font-medium text-slate-700">
                                Pre-orders module
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="relative">
                                  <input
                                    type="checkbox"
                                    checked={restaurant.preorders_plan_enabled ?? true}
                                    onChange={() => handlePreordersPlanToggle(restaurant.id, restaurant.preorders_plan_enabled ?? true)}
                                    disabled={updatingId === restaurant.id}
                                    className="sr-only peer"
                                  />
                                  <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-blue-600 peer-focus:ring-4 peer-focus:ring-blue-300 transition-colors"></div>
                                  <div className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-5"></div>
                                </div>
                                <div className="text-xs md:text-sm w-16 text-right">
                                  {restaurant.preorders_plan_enabled ? (
                                    <span className="text-green-600 font-medium">Enabled</span>
                                  ) : (
                                    <span className="text-slate-500 font-medium">Disabled</span>
                                  )}
                                </div>
                              </div>
                            </label>
                            <div className={`text-xs mt-1 md:text-right ${getPreordersStatus(restaurant).color}`}>
                              {getPreordersStatus(restaurant).text}
                            </div>
                          </div>

                          <label className="flex items-center justify-between md:justify-start gap-2 md:gap-3 cursor-pointer w-full md:w-auto">
                            <span className="text-sm md:text-base font-medium text-slate-700">
                              Desserts course
                            </span>
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                <input
                                  type="checkbox"
                                  checked={restaurant.desserts_enabled !== false}
                                  onChange={() => handleDessertsToggle(restaurant.id, restaurant.desserts_enabled !== false)}
                                  disabled={updatingId === restaurant.id}
                                  className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-blue-600 peer-focus:ring-4 peer-focus:ring-blue-300 transition-colors"></div>
                                <div className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-5"></div>
                              </div>
                              <div className="text-xs md:text-sm w-16 text-right">
                                {restaurant.desserts_enabled !== false ? (
                                  <span className="text-green-600 font-medium">Enabled</span>
                                ) : (
                                  <span className="text-slate-500 font-medium">Disabled</span>
                                )}
                              </div>
                            </div>
                          </label>
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleRestaurant(restaurant.id)}
                        className="mt-4 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {expandedRestaurantId === restaurant.id ? (
                          <>
                            <ChevronUp className="w-4 h-4" />
                            Hide Staff
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4" />
                            Manage Staff
                          </>
                        )}
                      </button>
                    </div>

                    {expandedRestaurantId === restaurant.id && (
                      <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-6">

                        {/* Opening Times Editor */}
                        <div>
                          <h4 className="text-md font-semibold text-slate-900 mb-3">Opening Times</h4>
                          <OpeningHoursEditor
                            value={editingHours[restaurant.id] || restaurant.opening_hours || DEFAULT_OPENING_HOURS}
                            onChange={hours => setEditingHours(prev => ({ ...prev, [restaurant.id]: hours }))}
                            errors={editingHoursErrors[restaurant.id]}
                          />
                          {editingHoursErrors[restaurant.id]?.length > 0 && (
                            <p className="text-sm text-red-600 mt-2">Please fix the errors above before saving.</p>
                          )}
                          <div className="mt-4">
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              disabled={savingHours[restaurant.id]}
                              onClick={() => handleSaveOpeningHours(restaurant.id)}
                            >
                              {savingHours[restaurant.id] ? 'Saving…' : 'Save Opening Times'}
                            </Button>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-md font-semibold text-slate-900 mb-1">Booking Limits</h4>
                          <p className="text-xs text-slate-500 mb-3">Online bookings only. Staff can always book regardless of these limits.</p>
                          {editingBookingLimits[restaurant.id] ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Minimum notice for online bookings</label>
                                <select
                                  value={editingBookingLimits[restaurant.id].minimum_booking_notice_minutes}
                                  onChange={e => setEditingBookingLimits(prev => ({
                                    ...prev,
                                    [restaurant.id]: { ...prev[restaurant.id], minimum_booking_notice_minutes: Number(e.target.value) },
                                  }))}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                                >
                                  <option value={0}>No minimum</option>
                                  <option value={30}>30 minutes</option>
                                  <option value={60}>1 hour</option>
                                  <option value={120}>2 hours</option>
                                  <option value={240}>4 hours</option>
                                  <option value={1440}>24 hours</option>
                                </select>
                                <p className="text-xs text-slate-500 mt-1">Prevents last-minute online bookings.</p>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Maximum online party size</label>
                                <select
                                  value={editingBookingLimits[restaurant.id].max_online_party_size ?? 'null'}
                                  onChange={e => {
                                    const v = e.target.value;
                                    setEditingBookingLimits(prev => ({
                                      ...prev,
                                      [restaurant.id]: { ...prev[restaurant.id], max_online_party_size: v === 'null' ? null : Number(v) },
                                    }));
                                  }}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                                >
                                  <option value={2}>2 guests</option>
                                  <option value={4}>4 guests</option>
                                  <option value={6}>6 guests</option>
                                  <option value={8}>8 guests</option>
                                  <option value={10}>10 guests</option>
                                  <option value={12}>12 guests</option>
                                  <option value="null">No limit</option>
                                </select>
                                <p className="text-xs text-slate-500 mt-1">Larger groups can be asked to contact the restaurant directly.</p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500">Loading…</p>
                          )}
                          <div className="mt-3">
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              disabled={savingBookingLimits[restaurant.id] || !editingBookingLimits[restaurant.id]}
                              onClick={() => handleSaveBookingLimits(restaurant.id)}
                            >
                              {savingBookingLimits[restaurant.id] ? 'Saving…' : 'Save Booking Limits'}
                            </Button>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-md font-semibold text-slate-900 mb-3">Customer-Facing Features</h4>

                          <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-700 mb-2">Amenities</label>
                            <div className="flex flex-wrap gap-3">
                              {availableAmenities.map(amenity => (
                                <label key={amenity.id} className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded border border-slate-200 hover:border-blue-300 transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={restaurant.amenities?.includes(amenity.id)}
                                    onChange={() => handleToggleAmenity(restaurant.id, amenity.id)}
                                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                  />
                                  <span className="text-sm text-slate-700">{amenity.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Badges</label>
                            <div className="flex flex-wrap gap-3">
                              {availableTags.map(tag => (
                                <label key={tag.id} className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded border border-slate-200 hover:border-blue-300 transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={restaurant.tags?.includes(tag.id)}
                                    onChange={() => handleToggleTag(restaurant.id, tag.id)}
                                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                  />
                                  <span className="text-sm text-slate-700">{tag.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Photos section */}
                        <div className="border-t border-slate-300 pt-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Images className="w-4 h-4 text-amber-600" />
                            <h4 className="text-md font-semibold text-slate-900">Restaurant Photos</h4>
                          </div>
                          <RestaurantPhotosPanel
                            restaurantId={restaurant.id}
                            initialImages={restaurant.gallery_images ?? []}
                            theme="admin"
                            onSaved={(galleryImages, coverImageUrl) => {
                              setRestaurants(prev => prev.map(r =>
                                r.id === restaurant.id
                                  ? { ...r, gallery_images: galleryImages, cover_image_url: coverImageUrl }
                                  : r
                              ));
                            }}
                          />
                        </div>

                        <div className="border-t border-slate-300 pt-4">
                          <div className="flex justify-between items-center mb-4">
                            <h4 className="text-md font-semibold text-slate-900">Staff Members</h4>
                          <Button
                            onClick={() => setShowStaffForm(showStaffForm === restaurant.id ? null : restaurant.id)}
                            variant="primary"
                            size="sm"
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Add Staff
                          </Button>
                        </div>

                        {showStaffForm === restaurant.id && (
                          <form onSubmit={(e) => handleAddStaff(e, restaurant.id)} className="mb-4 p-4 bg-white border border-slate-200 rounded-lg">
                            <h5 className="text-sm font-semibold text-slate-900 mb-3">Add New Staff Member</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Input
                                label="Email"
                                type="email"
                                value={newStaff.email}
                                onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                                required
                              />
                              <Input
                                label="Full Name"
                                value={newStaff.full_name}
                                onChange={(e) => setNewStaff({ ...newStaff, full_name: e.target.value })}
                                required
                              />
                              <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
                                <select
                                  value={newStaff.role}
                                  onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as 'staff' | 'restaurant_admin' })}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  <option value="staff">Staff</option>
                                  <option value="restaurant_admin">Restaurant Admin</option>
                                </select>
                              </div>
                              <Input
                                label="Initial Password"
                                type="password"
                                value={newStaff.initial_password || ''}
                                onChange={(e) => setNewStaff({ ...newStaff, initial_password: e.target.value })}
                                placeholder="Leave blank to auto-generate"
                              />
                            </div>
                            <div className="flex gap-2 mt-4">
                              <Button type="submit" variant="primary" size="sm" disabled={loading}>
                                Create Account
                              </Button>
                              <Button type="button" variant="secondary" size="sm" onClick={() => setShowStaffForm(null)}>
                                Cancel
                              </Button>
                            </div>
                          </form>
                        )}

                        {loadingStaff[restaurant.id] ? (
                          <p className="text-sm text-slate-600">Loading staff...</p>
                        ) : staffMembers[restaurant.id]?.length ? (
                          <div className="space-y-2">
                            {staffMembers[restaurant.id].map((member) => (
                              <div key={member.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                                <div className="flex-1">
                                  <p className="font-medium text-slate-900">{member.full_name}</p>
                                  <p className="text-sm text-slate-600">{member.email}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <select
                                    value={member.role}
                                    onChange={(e) => handleUpdateStaffRole(member.id, restaurant.id, e.target.value as 'staff' | 'restaurant_admin')}
                                    className="text-sm px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="staff">Staff</option>
                                    <option value="restaurant_admin">Admin</option>
                                  </select>
                                  <button
                                    onClick={() => handleRemoveStaff(member.id, restaurant.id)}
                                    className="text-red-600 hover:text-red-700"
                                    title="Remove staff member"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">No staff members yet</p>
                        )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {restaurants.length === 0 && (
                  <p className="text-center text-slate-500 py-8">
                    No restaurants found. Create your first restaurant to get started.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
