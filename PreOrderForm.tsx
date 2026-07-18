import React, { useState, useMemo, useEffect } from 'react';
import { MenuItem } from '../lib/menu';
import { PreOrderItem } from '../lib/types';
import { Minus, Plus } from 'lucide-react';

interface PreOrderFormProps {
  menuItems: MenuItem[];
  initialSelection?: PreOrderItem[];
  onChange: (preorderItems: PreOrderItem[], preorderTotal: number) => void;
}

export function PreOrderForm({ menuItems, initialSelection = [], onChange }: PreOrderFormProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    initialSelection.forEach(item => {
      const menuItem = menuItems.find(m => m.name === item.name);
      if (menuItem) {
        initial[menuItem.id] = item.quantity;
      }
    });
    return initial;
  });

  const groupedMenu = useMemo(() => {
    const groups: Record<string, MenuItem[]> = {
      Starter: [],
      Main: [],
      Dessert: [],
      Drink: []
    };
    menuItems.forEach(item => {
      groups[item.category].push(item);
    });
    return groups;
  }, [menuItems]);

  const selectedItems = useMemo(() => {
    return menuItems
      .filter(item => (quantities[item.id] || 0) > 0)
      .map(item => ({
        name: item.name,
        price: item.price,
        quantity: quantities[item.id]
      }));
  }, [quantities, menuItems]);

  const total = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [selectedItems]);

  useEffect(() => {
    onChange(selectedItems, total);
  }, [selectedItems, total, onChange]);

  const handleQuantityChange = (itemId: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[itemId] || 0;
      const newValue = Math.max(0, Math.min(20, current + delta));
      return { ...prev, [itemId]: newValue };
    });
  };

  const categoryOrder: Array<'Starter' | 'Main' | 'Dessert' | 'Drink'> = ['Starter', 'Main', 'Dessert', 'Drink'];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {categoryOrder.map(category => {
          const items = groupedMenu[category];
          if (items.length === 0) return null;

          return (
            <div key={category} className="space-y-2">
              <h3 className="text-lg font-semibold text-app-text">{category}s</h3>
              <div className="space-y-2">
                {items.map(item => {
                  const qty = quantities[item.id] || 0;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-app-bg border border-app-border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-app-text">{item.name}</div>
                        <div className="text-sm text-app-text-secondary">£{item.price.toFixed(2)}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.id, -1)}
                          disabled={qty === 0}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-app-bg-tertiary hover:bg-app-bg-tertiary/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-app-text"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="w-8 text-center font-medium text-app-text">{qty}</div>
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.id, 1)}
                          disabled={qty >= 20}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-app-bg-tertiary hover:bg-app-bg-tertiary/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-app-text"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {total > 0 && (
        <div className="pt-4 border-t border-app-border">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-app-text">Pre-order total:</span>
            <span className="text-xl font-bold text-app-text">£{total.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
