import React, { useState, useEffect } from 'react';
import { StaffLayout, StaffTab } from '../components/StaffLayout';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { getRestaurant, updateRestaurantPreordersEnabled } from '../services/restaurants';
import { getPreorderMenuItems, upsertPreorderMenuItems, deletePreorderMenuItem, PreorderMenuItem } from '../services/preorderMenu';
import { Restaurant } from '../lib/types';
import { UtensilsCrossed, Info, Plus, Trash2, Save, AlertCircle, CheckCircle2 } from 'lucide-react';

interface PreordersManagementProps {
  activeTab: StaffTab;
  onNavigate: (tab: StaffTab) => void;
  onLogout: () => void;
}

function DarkField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

const inputCls = 'w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm';

export function PreordersManagement({ activeTab, onNavigate, onLogout }: PreordersManagementProps) {
  const { user, isAdmin } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menuItems, setMenuItems] = useState<PreorderMenuItem[]>([]);
  const [deletedItemIds, setDeletedItemIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [deleteItemName, setDeleteItemName] = useState<string>('');

  useEffect(() => { loadData(); }, [user]);

  const loadData = async () => {
    if (!user?.restaurant_id) return;
    setLoading(true);
    try {
      const [restaurantData, menuData] = await Promise.all([
        getRestaurant(user.restaurant_id),
        getPreorderMenuItems(user.restaurant_id),
      ]);
      setRestaurant(restaurantData);
      setMenuItems(menuData);
      setDeletedItemIds([]);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePreorders = async () => {
    if (!restaurant) return;
    setUpdating(true);
    setError(null);
    setSuccess(null);
    const newValue = !restaurant.preorders_enabled;
    try {
      await updateRestaurantPreordersEnabled(restaurant.id, newValue);
      setRestaurant({ ...restaurant, preorders_enabled: newValue });
    } catch {
      setError('Failed to update pre-orders status');
    } finally {
      setUpdating(false);
    }
  };

  const handleAddItem = () => {
    const maxSortOrder = menuItems.length > 0 ? Math.max(...menuItems.map(i => i.sort_order)) : 0;
    setMenuItems([...menuItems, {
      restaurant_id: user!.restaurant_id!,
      name: '',
      description: '',
      price: 0,
      is_active: true,
      sort_order: maxSortOrder + 1,
    }]);
  };

  const handleUpdateItem = (index: number, field: keyof PreorderMenuItem, value: any) => {
    const updated = [...menuItems];
    updated[index] = { ...updated[index], [field]: value };
    setMenuItems(updated);
  };

  const handleDeleteClick = (index: number) => {
    setDeleteIndex(index);
    setDeleteItemName(menuItems[index].name || 'this item');
  };

  const handleDeleteConfirm = () => {
    if (deleteIndex === null) return;
    const item = menuItems[deleteIndex];
    if (item.id) setDeletedItemIds([...deletedItemIds, item.id]);
    setMenuItems(menuItems.filter((_, i) => i !== deleteIndex));
    setDeleteIndex(null);
    setDeleteItemName('');
  };

  const handleSaveMenu = async () => {
    if (!user?.restaurant_id) return;
    setError(null);
    setSuccess(null);
    const validationErrors: string[] = [];
    menuItems.forEach((item, index) => {
      if (!item.name.trim()) validationErrors.push(`Item ${index + 1}: Name is required`);
      if (item.price < 0) validationErrors.push(`Item ${index + 1}: Price must be non-negative`);
    });
    if (validationErrors.length > 0) { setError(validationErrors.join(', ')); return; }

    setSaving(true);
    try {
      await Promise.all([
        upsertPreorderMenuItems(user.restaurant_id, menuItems),
        ...deletedItemIds.map(id => deletePreorderMenuItem(id)),
      ]);
      await loadData();
      setSuccess('Pre-order menu saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError('Failed to save menu');
    } finally {
      setSaving(false);
    }
  };

  if (isAdmin) return null;

  if (!user?.restaurant_id) {
    return (
      <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <AlertCircle className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No restaurant assigned to your account.</p>
        </div>
      </StaffLayout>
    );
  }

  if (loading) {
    return (
      <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </StaffLayout>
    );
  }

  if (!restaurant?.preorders_plan_enabled) {
    return (
      <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
              <Info className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white mb-1">Pre-orders Not Available</h2>
              <p className="text-sm text-slate-400">
                Pre-orders are not available for your plan. Contact your administrator to enable this feature.
              </p>
            </div>
          </div>
        </div>
      </StaffLayout>
    );
  }

  return (
    <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
      <div className="space-y-5 max-w-3xl">

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            {success}
          </div>
        )}

        {/* Toggle card */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <UtensilsCrossed className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-white">Customer Pre-orders</h3>
              </div>
              <p className="text-sm text-slate-400 mb-3">
                When enabled, customers can pre-order food and drinks during the booking process.
              </p>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                restaurant.preorders_enabled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-800 border-slate-700 text-slate-500'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${restaurant.preorders_enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                {restaurant.preorders_enabled ? 'Active — customers can pre-order' : 'Disabled — customers proceed directly to confirmation'}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={restaurant.preorders_enabled ?? false}
                  onChange={handleTogglePreorders}
                  disabled={updating}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:bg-blue-600 transition-colors peer-disabled:opacity-50" />
                <div className="absolute left-0.5 top-0.5 bg-white w-5 h-5 rounded-full transition-transform peer-checked:translate-x-5 shadow-sm" />
              </div>
            </label>
          </div>
        </div>

        {/* Menu items */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-white">Pre-order Menu</h3>
              <p className="text-xs text-slate-500 mt-0.5">Items customers can add to their reservation</p>
            </div>
            <button
              onClick={handleAddItem}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>

          {menuItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 border border-dashed border-slate-700 rounded-xl">
              <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                <UtensilsCrossed className="w-6 h-6 text-slate-600" />
              </div>
              <p className="text-slate-400 text-sm font-medium">No menu items yet</p>
              <p className="text-xs text-slate-600">Add items to replace the default pre-order menu</p>
              <button
                onClick={handleAddItem}
                className="mt-1 flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add First Item
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {menuItems.map((item, index) => (
                <div
                  key={item.id || `new-${index}`}
                  className="bg-slate-800/60 border border-slate-700 rounded-xl p-4"
                >
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 space-y-3">
                      <DarkField label="Item Name">
                        <input
                          className={inputCls}
                          value={item.name}
                          onChange={(e) => handleUpdateItem(index, 'name', e.target.value)}
                          placeholder="e.g. Garlic Bread"
                        />
                      </DarkField>
                      <DarkField label="Description (Optional)">
                        <textarea
                          value={item.description || ''}
                          onChange={(e) => handleUpdateItem(index, 'description', e.target.value)}
                          placeholder="Short description"
                          rows={2}
                          className={`${inputCls} resize-none`}
                        />
                      </DarkField>
                    </div>

                    <div className="flex flex-row md:flex-col gap-3 md:w-40 md:items-stretch">
                      <div className="flex-1 md:flex-none">
                        <DarkField label="Price (£)">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.price}
                            onChange={(e) => handleUpdateItem(index, 'price', parseFloat(e.target.value) || 0)}
                            className={inputCls}
                          />
                        </DarkField>
                      </div>

                      <div className="flex items-center gap-2 md:pt-1">
                        <input
                          type="checkbox"
                          id={`active-${index}`}
                          checked={item.is_active}
                          onChange={(e) => handleUpdateItem(index, 'is_active', e.target.checked)}
                          className="w-4 h-4 accent-blue-500 rounded"
                        />
                        <label htmlFor={`active-${index}`} className="text-sm text-slate-400 cursor-pointer">Active</label>
                      </div>

                      <button
                        onClick={() => handleDeleteClick(index)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="md:hidden">Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveMenu}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Menu'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleteIndex !== null}
        title="Delete Menu Item"
        message={`Are you sure you want to delete "${deleteItemName}"? This action cannot be undone.`}
        confirmLabel="Delete Item"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => { setDeleteIndex(null); setDeleteItemName(''); }}
      />
    </StaffLayout>
  );
}
