import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MessageSquare, Loader2, AlertTriangle, RefreshCw, ChevronDown } from 'lucide-react';
import {
  getConversationForReservation,
  getOrCreateConversationForReservation,
  getMessagesForConversation,
  sendRestaurantMessage,
  markConversationReadByStaff,
  ReservationConversation,
  ReservationMessage,
  EmailNotificationStatus,
} from '../services/chat';
import { supabase } from '../lib/supabase';
import { Reservation } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';

interface ReservationChatPanelProps {
  reservation: Reservation;
  restaurantId: string;
  /** When true the panel opens and scrolls to latest message automatically */
  autoOpen?: boolean;
  /** Called once after autoOpen causes the panel to open */
  onChatOpened?: () => void;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

async function resolveMessageAlertsForReservation(
  restaurantId: string,
  reservationId: string,
  userId?: string
): Promise<void> {
  await supabase
    .from('app_error_events')
    .update({ resolved_at: new Date().toISOString(), resolved_by: userId ?? null })
    .eq('restaurant_id', restaurantId)
    .eq('reservation_id', reservationId)
    .eq('area', 'messages')
    .is('resolved_at', null);
}

export function ReservationChatPanel({
  reservation,
  restaurantId,
  autoOpen = false,
  onChatOpened,
}: ReservationChatPanelProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(autoOpen);
  const [conversation, setConversation] = useState<ReservationConversation | null>(null);
  const [messages, setMessages] = useState<ReservationMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  // 'idle' | 'loading' | 'loaded' | 'error'
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [loadError, setLoadError] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [lastEmailStatus, setLastEmailStatus] = useState<EmailNotificationStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoOpenHandled = useRef(false);
  const prevMsgCountRef = useRef(0);
  const isOpenRef = useRef(isOpen);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
  const pendingRealtimeIdRef = useRef<string | null>(null);
  const realtimeFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonically incrementing token — any fetch started with an older token is stale
  const fetchSeqRef = useRef(0);
  const readConversationRef = useRef<string | null>(null);

  const loadMessages = useCallback(async (conv: ReservationConversation) => {
    const msgs = await getMessagesForConversation(conv.id);
    setMessages(msgs);
    const latestCustomer = [...msgs].reverse().find(m => m.sender_type === 'customer' && !m.read_at);
    setHighlightId(latestCustomer?.id ?? null);
  }, []);

  // Load the existing conversation (read-only, no creation side-effect).
  // Only runs when the panel is open and we have valid IDs + auth session.
  const initConversation = useCallback(async () => {
    if (!reservation.id || !restaurantId) return;

    const mySeq = ++fetchSeqRef.current;
    setLoadState('loading');
    setLoadError('');

    try {
      const conv = await getConversationForReservation(reservation.id);

      // Discard if a newer fetch started (reservation switched mid-flight)
      if (mySeq !== fetchSeqRef.current) return;

      if (!conv) {
        // No conversation yet — that is a normal "no messages" state, not an error
        setConversation(null);
        setMessages([]);
        setLoadState('loaded');
        return;
      }

      setConversation(conv);
      await loadMessages(conv);
      if (mySeq !== fetchSeqRef.current) return;
      setLoadState('loaded');
    } catch (err: unknown) {
      if (mySeq !== fetchSeqRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[StaffChat] Failed to load conversation', {
        reservationId: reservation.id,
        restaurantId,
        error: msg,
        authReady: !!user,
      });
      setLoadError('Unable to load conversation.');
      setLoadState('error');
    }
  }, [reservation.id, restaurantId, loadMessages, user]);

  // Reset panel state when the reservation changes so stale data never bleeds
  // into the next reservation's view.
  const prevReservationIdRef = useRef(reservation.id);
  useEffect(() => {
    if (reservation.id !== prevReservationIdRef.current) {
      prevReservationIdRef.current = reservation.id;
      setConversation(null);
      setMessages([]);
      setLoadState('idle');
      setLoadError('');
      setMessageText('');
      setSendError('');
      setLastEmailStatus(null);
      prevMsgCountRef.current = 0;
      readConversationRef.current = null;
    }
  }, [reservation.id]);

  // Trigger load when the panel opens (or when reservation changes while open)
  useEffect(() => {
    if (!isOpen) return;
    if (!reservation.id || !restaurantId) return;
    // Only load if we haven't already loaded for this reservation
    if (loadState === 'idle' || (loadState !== 'loading' && conversation === null && loadState !== 'error')) {
      initConversation();
    }
  }, [isOpen, reservation.id, restaurantId, loadState, conversation, initConversation]);

  useEffect(() => {
    if (!isOpen || !conversation || readConversationRef.current === conversation.id) return;
    readConversationRef.current = conversation.id;
    markConversationReadByStaff(
      conversation.id,
      restaurantId,
      reservation.id,
      user?.auth_user_id
    ).catch(() => {
      readConversationRef.current = null;
    });
  }, [isOpen, conversation, restaurantId, reservation.id, user?.auth_user_id]);

  // Realtime: subscribe only after we have a valid conversation id
  useEffect(() => {
    if (!conversation) return;
    const convId = conversation.id;
    const reservationId = reservation.id;

    const channel = supabase
      .channel(`staff-chat-messages-${convId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reservation_messages' },
        (payload) => {
          const row = payload.new as ReservationMessage;
          if (!row || row.conversation_id !== convId) return;

          if (pendingRealtimeIdRef.current === row.id) {
            pendingRealtimeIdRef.current = null;
            if (realtimeFallbackTimerRef.current) {
              clearTimeout(realtimeFallbackTimerRef.current);
              realtimeFallbackTimerRef.current = null;
            }
          }

          setMessages(prev => {
            if (prev.some(m => m.id === row.id)) return prev;
            return [...prev, row];
          });

          if (isOpenRef.current && row.sender_type === 'customer') {
            markConversationReadByStaff(
              convId,
              restaurantId,
              reservationId,
              user?.auth_user_id
            ).catch(() => {});
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversation, reservation.id, restaurantId, user?.auth_user_id]);

  // Handle autoOpen from alert click
  useEffect(() => {
    if (autoOpen && !autoOpenHandled.current) {
      autoOpenHandled.current = true;
      setIsOpen(true);
      if (onChatOpened) onChatOpened();
    }
  }, [autoOpen, onChatOpened]);

  // Scroll to bottom when messages change (only when near bottom, or on first load)
  useEffect(() => {
    if (!isOpen) return;
    const el = scrollAreaRef.current;
    if (!el) return;
    const newCount = messages.length;
    const prevCount = prevMsgCountRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
    if (prevCount === 0 || nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
    prevMsgCountRef.current = newCount;
  }, [messages, isOpen]);

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(t);
  }, [highlightId]);

  useEffect(() => {
    return () => {
      if (realtimeFallbackTimerRef.current) clearTimeout(realtimeFallbackTimerRef.current);
    };
  }, []);

  const handleRefresh = async () => {
    if (refreshing || loadState === 'loading') return;
    setRefreshing(true);
    setLoadError('');
    if (conversation) {
      await loadMessages(conversation);
    } else {
      await initConversation();
    }
    setRefreshing(false);
  };

  const handleSend = async () => {
    const body = messageText.trim();
    if (!body || sending) return;

    setSending(true);
    setSendError('');

    const senderName = user?.name || user?.email?.split('@')[0] || 'Restaurant';

    // Lazily create the conversation if it doesn't exist yet
    let conv = conversation;
    if (!conv) {
      conv = await getOrCreateConversationForReservation(
        reservation.id,
        restaurantId,
        reservation.customer_name,
        reservation.customer_phone,
        reservation.customer_email
      );
      if (!conv) {
        setSendError('Failed to start conversation. Please try again.');
        setSending(false);
        return;
      }
      setConversation(conv);
      setLoadState('loaded');
    }

    const { message: msg, emailStatus } = await sendRestaurantMessage(
      conv.id,
      reservation.id,
      restaurantId,
      body,
      senderName,
      reservation.manage_token
    );

    if (!msg) {
      setSendError('Failed to send message. Please try again.');
      setSending(false);
      return;
    }

    pendingRealtimeIdRef.current = msg.id;
    if (realtimeFallbackTimerRef.current) clearTimeout(realtimeFallbackTimerRef.current);
    realtimeFallbackTimerRef.current = setTimeout(async () => {
      if (pendingRealtimeIdRef.current === msg.id && conv) {
        pendingRealtimeIdRef.current = null;
        const msgs = await getMessagesForConversation(conv.id);
        setMessages(msgs);
      }
    }, 2000);

    setMessageText('');
    setLastEmailStatus(emailStatus);
    setSending(false);
    inputRef.current?.focus();

    resolveMessageAlertsForReservation(restaurantId, reservation.id, user?.auth_user_id)
      .catch(() => {})
      .finally(() => {
        window.dispatchEvent(new CustomEvent('rezerved:alerts-changed', {
          detail: { reservationId: reservation.id, restaurantId },
        }));
      });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (!next) prevMsgCountRef.current = 0;
    if (next && loadState === 'idle') initConversation();
  };

  const isLoading = loadState === 'loading' || refreshing;

  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-xl overflow-hidden">
      {/* Panel header — always visible, click to toggle */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-700 hover:bg-slate-800/60 transition-colors"
        onClick={toggle}
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Customer Messages</span>
          {messages.filter(m => m.sender_type === 'customer' && !m.read_at).length > 0 && (
            <span className="w-4 h-4 rounded-full bg-amber-500/30 text-amber-300 text-[10px] font-bold flex items-center justify-center">
              {messages.filter(m => m.sender_type === 'customer' && !m.read_at).length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOpen && (
            <button
              onClick={e => { e.stopPropagation(); handleRefresh(); }}
              disabled={isLoading}
              className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-40"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <>
          {/* Messages area */}
          <div ref={scrollAreaRef} className="px-4 py-3 max-h-56 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
              </div>
            ) : loadState === 'error' ? (
              <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                {loadError}
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-xs text-slate-500">No messages yet</p>
                <p className="text-xs text-slate-600 mt-0.5">Send a message to start the conversation</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {messages.map(msg => (
                  <StaffMessageBubble
                    key={msg.id}
                    message={msg}
                    highlight={msg.id === highlightId}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-slate-700">
            {sendError && (
              <p className="text-red-400 text-xs mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {sendError}
              </p>
            )}
            {!sendError && lastEmailStatus && (
              <p className="text-xs mb-2 text-slate-500">
                {lastEmailStatus === 'sent' && (
                  <span className="text-emerald-500">Message sent &middot; email notification sent</span>
                )}
                {lastEmailStatus === 'skipped_cooldown' && (
                  <span>Message sent &middot; email notification skipped (cooldown)</span>
                )}
                {lastEmailStatus === 'skipped_restaurant_disabled' && (
                  <span>Message sent &middot; email notifications off in Booking Rules</span>
                )}
                {lastEmailStatus === 'skipped_customer_disabled' && (
                  <span>Message sent &middot; customer email notifications disabled</span>
                )}
                {lastEmailStatus === 'failed' && (
                  <span className="text-amber-500">Message sent &middot; email notification failed</span>
                )}
                {lastEmailStatus === 'not_attempted' && (
                  <span>Message sent</span>
                )}
              </p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={messageText}
                onChange={e => { setMessageText(e.target.value); setLastEmailStatus(null); }}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${reservation.customer_name.split(' ')[0]}...`}
                rows={1}
                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-500 resize-none focus:outline-none focus:border-amber-500/60 transition-colors"
                style={{ minHeight: '36px', maxHeight: '96px' }}
              />
              <button
                onClick={handleSend}
                disabled={!messageText.trim() || sending}
                className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: messageText.trim() && !sending ? '#d97706' : '#1e293b' }}
                aria-label="Send"
              >
                {sending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-white" />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StaffMessageBubble({ message, highlight }: { message: ReservationMessage; highlight?: boolean }) {
  const isRestaurant = message.sender_type === 'restaurant';
  const isSystem = message.sender_type === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="px-2.5 py-1 rounded-full bg-slate-700/60 text-slate-400 text-xs">
          {message.message_body}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-0.5 ${isRestaurant ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-center gap-1.5 ${isRestaurant ? 'flex-row-reverse' : ''}`}>
        <span className="text-slate-500 text-xs">{message.sender_name}</span>
        <span className="text-slate-600 text-xs">{formatTimestamp(message.created_at)}</span>
      </div>
      <div
        className={`max-w-xs px-3 py-2 rounded-xl text-xs leading-relaxed transition-all duration-700 ${
          isRestaurant
            ? 'rounded-br-sm text-white'
            : 'rounded-bl-sm text-slate-200 bg-slate-700'
        } ${highlight ? 'ring-1 ring-amber-400/60 shadow-[0_0_8px_rgba(251,191,36,0.25)]' : ''}`}
        style={isRestaurant ? { background: '#92400e' } : {}}
      >
        {message.message_body}
      </div>
    </div>
  );
}
