import React, { useState, useEffect } from 'react';
import { WalkInPhoneBooking } from './WalkInPhoneBooking';
import { StaffLayout, StaffTab } from '../components/StaffLayout';
import { useAuth } from '../contexts/AuthContext';
import { getRestaurant } from '../services/restaurants';
import { Restaurant } from '../lib/types';
import { AlertCircle } from 'lucide-react';

interface WalkInPhoneBookingWrapperProps {
  activeTab: StaffTab;
  onNavigate: (tab: StaffTab) => void;
  onLogout: () => void;
}

export function WalkInPhoneBookingWrapper({ activeTab, onNavigate, onLogout }: WalkInPhoneBookingWrapperProps) {
  const { user, isAdmin } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.restaurant_id) {
      loadRestaurant();
    }
  }, [user]);

  const loadRestaurant = async () => {
    if (!user?.restaurant_id) return;
    try {
      const data = await getRestaurant(user.restaurant_id);
      setRestaurant(data);
    } catch (error) {
      console.error('Failed to load restaurant:', error);
    } finally {
      setLoading(false);
    }
  };

  if (isAdmin) return null;

  if (loading) {
    return (
      <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={null}>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </StaffLayout>
    );
  }

  if (!restaurant) {
    return (
      <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={null}>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <AlertCircle className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Failed to load restaurant</p>
        </div>
      </StaffLayout>
    );
  }

  return (
    <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
      <WalkInPhoneBooking
        restaurant={restaurant}
        onBack={() => onNavigate('dashboard')}
      />
    </StaffLayout>
  );
}
