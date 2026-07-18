import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RezervdLogo } from './RezervdLogo';
import {
  LogOut,
  Calendar,
  LayoutGrid,
  UserPlus,
  UtensilsCrossed,
  Store,
  BookOpen,
  BarChart2,
  Plug,
  Globe,
  MessageSquare,
  Users,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { Restaurant, User } from '../lib/types';
import { useDashboardLayout } from '../hooks/useDashboardLayout';
import { supabase } from '../lib/supabase';

export type StaffTab =
  | 'dashboard'
  | 'messages'
  | 'customers'
  | 'tables'
  | 'walk_ins'
  | 'preorders'
  | 'profile'
  | 'booking_rules'
  | 'analytics'
  | 'epos'
  | 'website_integration';

interface StaffLayoutProps {
  children: React.ReactNode;
  activeTab: StaffTab;
  onNavigate: (tab: StaffTab) => void;
  onLogout: () => void;
  restaurant?: Restaurant | null;
  /** Removes padding from main and fills remaining height — for full-bleed canvas views */
  fullBleed?: boolean;
}

const BASE_TABS: { id: StaffTab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard',     label: 'Reservations',      icon: Calendar },
  { id: 'messages',      label: 'Messages',          icon: MessageSquare },
  { id: 'customers',     label: 'Customers',         icon: Users },
  { id: 'walk_ins',      label: 'Walk-ins & Phone',   icon: UserPlus },
  { id: 'tables',        label: 'Table Layout',       icon: LayoutGrid },
];

type StaffNavItem = {
  id: StaffTab;
  label: string;
  icon: React.ElementType;
  attention?: boolean;
};

function useUnreadMessageCount(restaurantId?: string | null) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!restaurantId) {
      setCount(0);
      return;
    }

    const { count: unreadCount } = await supabase
      .from('app_error_events')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('area', 'messages')
      .is('resolved_at', null);

    setCount(unreadCount ?? 0);
  }, [restaurantId]);

  useEffect(() => {
    refresh();
    if (!restaurantId) return;

    const channel = supabase
      .channel(`staff-nav-message-alerts-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_error_events' },
        payload => {
          const row = (payload.new || payload.old) as { restaurant_id?: string; area?: string };
          if (row?.restaurant_id === restaurantId && row?.area === 'messages') refresh();
        }
      )
      .subscribe();

    const onAlertsChanged = () => refresh();
    window.addEventListener('rezerved:alerts-changed', onAlertsChanged);

    return () => {
      window.removeEventListener('rezerved:alerts-changed', onAlertsChanged);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, refresh]);

  return count;
}

// ─── Shared user avatar pill ──────────────────────────────────────────────────
function UserAvatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <div
      className={`rounded-full bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0 ${
        small ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm'
      }`}
    >
      {(name || 'S').charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Desktop header ───────────────────────────────────────────────────────────
function DesktopHeader({
  user, restaurant, activeTab, allTabs, onNavigate, onLogout,
}: {
  user: User | null;
  restaurant?: Restaurant | null;
  activeTab: StaffTab;
  allTabs: StaffNavItem[];
  onNavigate: (tab: StaffTab) => void;
  onLogout: () => void;
}) {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4 min-w-0 flex-shrink">
            <RezervdLogo size="sm" />
            {restaurant?.name && (
              <>
                <div className="h-5 w-px bg-slate-700 flex-shrink-0" />
                <span className="text-sm font-semibold text-white truncate max-w-[200px]">
                  {restaurant.name}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {user && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700">
                <UserAvatar name={user.name || 'S'} />
                <span className="text-sm text-slate-300 hidden lg:block">{user.name}</span>
              </div>
            )}
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-700"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Sign out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-0 -mb-px overflow-x-auto scrollbar-none">
          {allTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                  isActive
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {tab.label}
                {tab.attention && (
                  <span
                    className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[11px] font-black flex items-center justify-center"
                    aria-label="Unread customer messages"
                  >
                    !
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}

// ─── Mobile header + slide-in drawer ─────────────────────────────────────────
function MobileHeader({
  user, restaurant, activeTab, allTabs, onNavigate, onLogout, isStandaloneApp,
}: {
  user: User | null;
  restaurant?: Restaurant | null;
  activeTab: StaffTab;
  allTabs: StaffNavItem[];
  onNavigate: (tab: StaffTab) => void;
  onLogout: () => void;
  isStandaloneApp: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Avatar dropdown state for sign-out access when top bar is tight
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  // Close drawer on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Close avatar dropdown on outside click
  useEffect(() => {
    if (!avatarOpen) return;
    const handler = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [avatarOpen]);

  const navigate = (tab: StaffTab) => { setOpen(false); onNavigate(tab); };

  const handleLogout = () => {
    setOpen(false);
    setAvatarOpen(false);
    onLogout();
  };

  return (
    <>
      {/* Top bar */}
      <header
        className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40"
        style={isStandaloneApp ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}
      >
        <div className="flex items-center h-16 px-3 gap-2">
          {/* Hamburger — always leftmost, never displaced */}
          <button
            onClick={() => setOpen(true)}
            className="p-2.5 -ml-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors active:bg-slate-700 min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
            aria-label="Open navigation"
            aria-expanded={open}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Centre: logo — fills available space, max-width keeps it proportional */}
          <div className="flex items-center min-w-0 flex-1 overflow-hidden justify-center px-2">
            <RezervdLogo size="sm" linkToHome={false} style={{ width: 'min(160px, 100%)', maxWidth: '160px' }} />
          </div>

          {/* Avatar with dropdown — sign-out always reachable here */}
          {user ? (
            <div ref={avatarRef} className="relative flex-shrink-0">
              <button
                onClick={() => setAvatarOpen(prev => !prev)}
                className="rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Account menu"
                aria-expanded={avatarOpen}
              >
                <UserAvatar name={user.name || 'S'} />
              </button>
              {avatarOpen && (
                <div
                  className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-1 z-50 min-w-[160px]"
                >
                  <div className="px-3 py-2 border-b border-slate-700">
                    <p className="text-xs font-medium text-white truncate">{user.name || 'Staff'}</p>
                    <p className="text-[11px] text-slate-500 truncate">{user.email || ''}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition-colors min-h-[44px]"
                  >
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="w-[44px] flex-shrink-0" />
          )}
        </div>
      </header>

      {/* Backdrop — only interactive when drawer is open */}
      <div
        className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer panel — slides from left, overflow-hidden so nothing leaks out */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={`fixed top-0 left-0 h-full z-[60] bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden
          transition-transform duration-300 ease-out will-change-transform
          w-[min(280px,82vw)]
          ${open ? 'translate-x-0 shadow-2xl pointer-events-auto' : '-translate-x-full pointer-events-none'}`}
        style={isStandaloneApp ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}
      >
        {/* Drawer top bar — close button is highest z-index, never overlapped */}
        <div className="relative flex items-center h-14 border-b border-slate-800 flex-shrink-0 px-4">
          {/* Logo container — right-padded so it never reaches the close button area */}
          <div
            className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden"
            style={{ paddingRight: '52px' }}
          >
            <RezervdLogo size="sm" linkToHome={false} />
            {restaurant?.name && (
              <span className="text-xs font-semibold text-white truncate min-w-0">
                {restaurant.name}
              </span>
            )}
          </div>

          {/* Close button — absolutely positioned top-right, always above logo */}
          <button
            onClick={() => setOpen(false)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center z-10"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {allTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.id)}
                className={`w-full flex items-center gap-3 px-3 min-h-[48px] rounded-xl text-sm font-medium mb-1 transition-all ${
                  isActive
                    ? 'bg-blue-500/15 text-blue-300 border border-blue-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent active:bg-slate-700'
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                <span className="flex-1 text-left">{tab.label}</span>
                {tab.attention && (
                  <span
                    className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-xs font-black flex items-center justify-center"
                    aria-label="Unread customer messages"
                  >
                    !
                  </span>
                )}
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-blue-400/60 flex-shrink-0" />}
              </button>
            );
          })}
        </nav>

        {/* Drawer footer — user info + sign out */}
        <div
          className="border-t border-slate-800 px-3 py-3 flex-shrink-0"
          style={
            isStandaloneApp
              ? { paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }
              : undefined
          }
        >
          {user && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 mb-1 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <UserAvatar name={user.name || 'S'} small />
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-xs font-medium text-white truncate">{user.name || 'Staff'}</p>
                <p className="text-[11px] text-slate-500 truncate">{user.email || ''}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors active:bg-slate-700"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Main layout shell ────────────────────────────────────────────────────────
export function StaffLayout({
  children,
  activeTab,
  onNavigate,
  onLogout,
  restaurant,
  fullBleed = false,
}: StaffLayoutProps) {
  const { user } = useAuth();
  const { isMobile, isTablet, isStandaloneApp } = useDashboardLayout();
  const showPreordersTab = restaurant?.preorders_plan_enabled ?? false;
  const unreadMessageCount = useUnreadMessageCount(restaurant?.id ?? user?.restaurant_id);

  const allTabs: StaffNavItem[] = [
    ...BASE_TABS.map(tab => ({
      ...tab,
      attention: tab.id === 'messages' && unreadMessageCount > 0,
    })),
    ...(showPreordersTab ? [{ id: 'preorders' as StaffTab, label: 'Pre-orders', icon: UtensilsCrossed }] : []),
    { id: 'booking_rules', label: 'Booking Rules',      icon: BookOpen },
    { id: 'profile',       label: 'Restaurant Profile', icon: Store },
    { id: 'analytics',     label: 'Analytics',          icon: BarChart2 },
    { id: 'epos',          label: 'EPOS',               icon: Plug },
    { id: 'website_integration', label: 'Website Widget', icon: Globe },
  ];

  return (
    <div className={`bg-slate-950 flex flex-col ${fullBleed ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      {isMobile || isTablet ? (
        <MobileHeader
          user={user}
          restaurant={restaurant}
          activeTab={activeTab}
          allTabs={allTabs}
          onNavigate={onNavigate}
          onLogout={onLogout}
          isStandaloneApp={isStandaloneApp}
        />
      ) : (
        <DesktopHeader
          user={user}
          restaurant={restaurant}
          activeTab={activeTab}
          allTabs={allTabs}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      )}

      {fullBleed ? (
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      ) : (
        <main
          className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6"
          style={
            isStandaloneApp
              ? { paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }
              : undefined
          }
        >
          {children}
        </main>
      )}
    </div>
  );
}
