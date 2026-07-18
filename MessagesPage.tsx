import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Clock,
  Hash,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Users,
} from 'lucide-react';
import { StaffLayout, StaffTab } from '../components/StaffLayout';
import { ReservationChatPanel } from '../components/ReservationChatPanel';
import { useAuth } from '../contexts/AuthContext';
import { getRestaurant } from '../services/restaurants';
import {
  getOpenConversationsForRestaurant,
  markConversationReadByStaff,
  ReservationConversation,
  ReservationMessage,
} from '../services/chat';
import { Restaurant, Reservation } from '../lib/types';
import { supabase } from '../lib/supabase';

interface MessagesPageProps {
  activeTab: StaffTab;
  onNavigate: (tab: StaffTab) => void;
  onLogout: () => void;
}

type ConversationRow = {
  conversation: ReservationConversation;
  reservation: Reservation | null;
  latestMessage: ReservationMessage | null;
  unread: boolean;
  sortTime: number;
};

function dateTimeLabel(iso?: string | null) {
  if (!iso) return 'No messages yet';
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function bookingDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function bookingTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  });
}

export function MessagesPage({ activeTab, onNavigate, onLogout }: MessagesPageProps) {
  const { user } = useAuth();
  const restaurantId = user?.restaurant_id;
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setError('');

    try {
      const conversations = await getOpenConversationsForRestaurant(restaurantId);
      const reservationIds = conversations.map(item => item.reservation_id);
      const conversationIds = conversations.map(item => item.id);

      const [reservationResult, messageResult, alertResult] = await Promise.all([
        reservationIds.length
          ? supabase.from('reservations').select('*').in('id', reservationIds)
          : Promise.resolve({ data: [], error: null }),
        conversationIds.length
          ? supabase
              .from('reservation_messages')
              .select('*')
              .in('conversation_id', conversationIds)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('app_error_events')
          .select('conversation_id, reservation_id')
          .eq('restaurant_id', restaurantId)
          .eq('area', 'messages')
          .is('resolved_at', null),
      ]);

      if (reservationResult.error) throw reservationResult.error;
      if (messageResult.error) throw messageResult.error;
      if (alertResult.error) throw alertResult.error;

      const reservations = new Map(
        ((reservationResult.data || []) as Reservation[]).map(item => [item.id, item])
      );
      const latestByConversation = new Map<string, ReservationMessage>();
      for (const message of (messageResult.data || []) as ReservationMessage[]) {
        if (!latestByConversation.has(message.conversation_id)) {
          latestByConversation.set(message.conversation_id, message);
        }
      }
      const unreadConversationIds = new Set(
        (alertResult.data || []).map(item => item.conversation_id).filter(Boolean)
      );
      const unreadReservationIds = new Set(
        (alertResult.data || []).map(item => item.reservation_id).filter(Boolean)
      );

      const nextRows = conversations
        .map(conversation => {
          const latestMessage = latestByConversation.get(conversation.id) ?? null;
          const latestAt = latestMessage?.created_at
            || conversation.last_customer_message_at
            || conversation.last_restaurant_message_at
            || conversation.updated_at;
          return {
            conversation,
            reservation: reservations.get(conversation.reservation_id) ?? null,
            latestMessage,
            unread: unreadConversationIds.has(conversation.id)
              || unreadReservationIds.has(conversation.reservation_id),
            sortTime: new Date(latestAt).getTime(),
          };
        })
        .sort((a, b) => b.sortTime - a.sortTime);

      setRows(nextRows);
      setSelectedId(current => {
        if (current && nextRows.some(row => row.conversation.id === current)) return current;
        return null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load conversations.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    getRestaurant(restaurantId).then(setRestaurant).catch(() => setRestaurant(null));
    load();
  }, [restaurantId, load]);

  useEffect(() => {
    if (!restaurantId) return;
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(load, 150);
    };

    const channel = supabase
      .channel(`messages-inbox-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservation_messages' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservation_conversations' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_error_events' }, scheduleRefresh)
      .subscribe();

    const onAlertsChanged = () => scheduleRefresh();
    window.addEventListener('rezerved:alerts-changed', onAlertsChanged);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      window.removeEventListener('rezerved:alerts-changed', onAlertsChanged);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, load]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(row => {
      const reservation = row.reservation;
      return [
        row.conversation.customer_name,
        row.conversation.customer_email,
        row.conversation.customer_phone,
        reservation?.reservation_code,
        row.latestMessage?.message_body,
      ].some(value => value?.toLowerCase().includes(term));
    });
  }, [rows, search]);

  const selected = rows.find(row => row.conversation.id === selectedId) ?? null;

  const selectConversation = async (row: ConversationRow) => {
    setSelectedId(row.conversation.id);
    if (!restaurantId) return;
    setRows(current => current.map(item => (
      item.conversation.id === row.conversation.id ? { ...item, unread: false } : item
    )));
    await markConversationReadByStaff(
      row.conversation.id,
      restaurantId,
      row.conversation.reservation_id,
      user?.auth_user_id
    );
  };

  return (
    <StaffLayout
      activeTab={activeTab}
      onNavigate={onNavigate}
      onLogout={onLogout}
      restaurant={restaurant}
      fullBleed
    >
      <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-[360px_1fr] bg-slate-950">
        <aside className="min-h-0 border-r border-slate-800 flex flex-col">
          <div className="p-4 border-b border-slate-800">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h1 className="text-lg font-bold text-white">Messages</h1>
                <p className="text-xs text-slate-500">{rows.length} ongoing conversation{rows.length === 1 ? '' : 's'}</p>
              </div>
              {rows.some(row => row.unread) && (
                <span className="px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-semibold">
                  New
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search conversations"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
            ) : error ? (
              <div className="m-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300 flex gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <MessageSquare className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-slate-400">No ongoing conversations</p>
              </div>
            ) : filteredRows.map(row => {
              const active = selectedId === row.conversation.id;
              return (
                <button
                  key={row.conversation.id}
                  onClick={() => selectConversation(row)}
                  className={`w-full text-left px-4 py-4 border-b border-slate-800 transition-colors ${
                    active ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : 'hover:bg-slate-900/70 border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-slate-200">
                        {(row.conversation.customer_name || '?').charAt(0).toUpperCase()}
                      </div>
                      {row.unread && (
                        <span className="absolute -right-0.5 -top-0.5 w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[11px] font-black flex items-center justify-center">!</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm truncate ${row.unread ? 'font-bold text-white' : 'font-semibold text-slate-200'}`}>
                          {row.conversation.customer_name || 'Customer'}
                        </p>
                        <span className="text-[11px] text-slate-500 flex-shrink-0">
                          {dateTimeLabel(row.latestMessage?.created_at || row.conversation.updated_at)}
                        </span>
                      </div>
                      <p className={`text-xs truncate mt-1 ${row.unread ? 'text-slate-300' : 'text-slate-500'}`}>
                        {row.latestMessage?.sender_type === 'restaurant' ? 'You: ' : ''}
                        {row.latestMessage?.message_body || 'Conversation started'}
                      </p>
                      {row.reservation && (
                        <p className="text-[11px] text-slate-600 mt-1.5">
                          {bookingDate(row.reservation.start_time)} · {bookingTime(row.reservation.start_time)} · {row.reservation.party_size} guests
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto p-4 sm:p-6">
          {!selected?.reservation ? (
            <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center">
              <MessageSquare className="w-10 h-10 text-slate-700 mb-3" />
              <p className="text-slate-300 font-semibold">Select a conversation</p>
              <p className="text-sm text-slate-500 mt-1">Customer messages and reservation details will appear here.</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">{selected.reservation.customer_name}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Reservation details</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    selected.reservation.status === 'booked'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : selected.reservation.status === 'pending_acceptance'
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-slate-700 text-slate-300'
                  }`}>
                    {selected.reservation.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                  <Detail icon={Calendar} label="Date" value={bookingDate(selected.reservation.start_time)} />
                  <Detail icon={Clock} label="Time" value={`${bookingTime(selected.reservation.start_time)}–${bookingTime(selected.reservation.end_time)}`} />
                  <Detail icon={Users} label="Party" value={`${selected.reservation.party_size} guests`} />
                  <Detail icon={Phone} label="Phone" value={selected.reservation.customer_phone || 'Not provided'} />
                  <Detail icon={Mail} label="Email" value={selected.reservation.customer_email || 'Not provided'} />
                  <Detail icon={Hash} label="Code" value={selected.reservation.reservation_code || '—'} />
                </div>
              </div>

              <ReservationChatPanel
                key={selected.conversation.id}
                reservation={selected.reservation}
                restaurantId={restaurantId!}
                autoOpen
              />
            </div>
          )}
        </section>
      </div>
    </StaffLayout>
  );
}

function Detail({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex gap-2.5 min-w-0">
      <Icon className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-600">{label}</p>
        <p className="text-slate-300 truncate">{value}</p>
      </div>
    </div>
  );
}
