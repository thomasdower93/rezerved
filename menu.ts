export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: 'Starter' | 'Main' | 'Dessert' | 'Drink';
};

export const demoMenu: MenuItem[] = [
  { id: 'gb', name: 'Garlic Bread', price: 4.5, category: 'Starter' },
  { id: 'bw', name: 'Buffalo Wings', price: 6.5, category: 'Starter' },
  { id: 'mp', name: 'Margherita Pizza', price: 11.0, category: 'Main' },
  { id: 'spag', name: 'Spaghetti Bolognese', price: 12.5, category: 'Main' },
  { id: 'br', name: 'Brownie with Ice Cream', price: 6.0, category: 'Dessert' },
  { id: 'srw', name: 'House Red Wine (Glass)', price: 6.0, category: 'Drink' },
  { id: 'sw', name: 'Still Water (750ml)', price: 3.0, category: 'Drink' }
];
