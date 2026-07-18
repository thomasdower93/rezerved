import React, { useState, useEffect } from 'react';
import { PremiumTableEditor } from '../components/PremiumTableEditor';
import { StaffLayout } from '../components/StaffLayout';
import { useAuth } from '../contexts/AuthContext';
import { getRestaurant } from '../services/restaurants';
import { Restaurant } from '../lib/types';
import { StaffTab } from '../components/StaffLayout';

interface TableEditorV2WrapperProps {
  activeTab: StaffTab;
  onNavigate: (tab: StaffTab) => void;
  onLogout: () => void;
}

export function TableEditorV2Wrapper({ activeTab, onNavigate, onLogout }: TableEditorV2WrapperProps) {
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    if (user?.restaurant_id) {
      getRestaurant(user.restaurant_id).then(setRestaurant).catch(console.error);
    }
  }, [user?.restaurant_id]);

  if (!user?.restaurant_id) {
    return (
      <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
        <div className="flex items-center justify-center py-24">
          <p className="text-slate-400">No restaurant assigned to your account.</p>
        </div>
      </StaffLayout>
    );
  }

  return (
    <StaffLayout
      activeTab={activeTab}
      onNavigate={onNavigate}
      onLogout={onLogout}
      restaurant={restaurant}
      fullBleed
    >
      <PremiumTableEditor restaurantId={user.restaurant_id} />
    </StaffLayout>
  );
}
