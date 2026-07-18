import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../components/Button';
import {
  ArrowLeft,
  Send,
  MessageSquare,
  Calendar,
  Clock,
  Users,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  getOrCreateConversationByToken,
  getMessagesByTokenOnly,
  sendCustomerMessage,
  markConversationViewedByToken,
  ReservationConversation,
  ReservationMessage,
} from '../services/chat';
import { getReservationByToken } from '../services/reservations';
import { getRestaurant } from '../services/restaurants';
import { Reservation, Restaurant } from '../lib/types';

interface CustomerChatPageProps {
  token: string;
  onBack: () => void;
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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatReservationDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatReservationTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${(h % 12) || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function CustomerChatPage({ token, onBack }: CustomerChatPageProps) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [conversation, setConversation] = useState<ReservationConversation | null>(null);
  const [messages, setMessages] = useState<ReservationMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // The messages container is the ONLY scrollable element — scroll is set directly
  // on this ref, never via scrollIntoView which can escape to the page scroller.
  const msgsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wasNearBottomRef = useRef(true);

  useEffect(() => {
    async function init() {
      setLoading(true);
      setLoadError('');
      try {
        const [res, convResult] = await Promise.all([
          getReservationByToken(token),
          getOrCreateConversationByToken(token),
        ]);

        if (!res) {
          setLoadError('This reservation link is invalid or has expired.');
          return;
        }

        setReservation(res);

        if (convResult.error || !convResult.conversation) {
          setLoadError('Unable to load the conversation. Please try again.');
          return;
        }

        setConversation(convResult.conversation);
        console.log('[CustomerChat Token Context]', {
          tokenPresent: Boolean(token),
          reservationId: res.id,
          conversationId: convResult.conversation.id,
          restaurantId: res.restaurant_id,
        });
        markConversationViewedByToken(token, convResult.conversation.id).catch(() => {});

        if (res.restaurant_id) {
          const r = await getRestaurant(res.restaurant_id);
          if (r) setRestaurant(r);
        }
      } catch {
        setLoadError('Something went wrong loading the chat. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [token]);

  // After messages update: scroll to bottom only if user was already near the bottom.
  // Uses direct scrollTop assignment — never scrollIntoView — so the page never moves.
  useEffect(() => {
    const el = msgsRef.current;
    if (!el) return;
    if (wasNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Track whether user is near the bottom before each messages update
  const handleMessagesScroll = () => {
    const el = msgsRef.current;
    if (!el) return;
    wasNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
  };

  // Polling loop — token is the only dependency.
  // pollRef lets handleSend trigger an immediate poll without recreating the interval.
  const pollRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    console.log('[CustomerChat Poll] token present', Boolean(token));

    const poll = async () => {
      console.log('[CustomerChat Poll] fetching messages');
      try {
        const msgs = await getMessagesByTokenOnly(token);
        console.log('[CustomerChat Poll] message count', msgs.length);
        if (msgs.length > 0) {
          console.log('[CustomerChat Poll] latest message', msgs[msgs.length - 1]);
        }
        // Snapshot near-bottom state before React re-renders
        const el = msgsRef.current;
        if (el) {
          wasNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
        }
        // Replace state with the canonical server list — no merging needed because
        // we never add optimistic messages locally. This is always authoritative.
        setMessages(
          msgs.slice().sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          )
        );
      } catch (err) {
        console.error('[CustomerChat Poll] failed', err);
      }
    };

    pollRef.current = poll;

    // Initial load — force scroll to bottom on first render
    wasNearBottomRef.current = true;
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      clearInterval(interval);
      pollRef.current = null;
    };
  }, [token]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    wasNearBottomRef.current = true;
    const msgs = await getMessagesByTokenOnly(token);
    setMessages(
      msgs.slice().sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    );
    setRefreshing(false);
  };

  const handleSend = async () => {
    const body = messageText.trim();
    if (!body || !conversation || sending) return;

    setSending(true);
    setSendError('');

    const result = await sendCustomerMessage(
      token,
      conversation.id,
      body,
      reservation?.customer_name || 'Customer'
    );

    if (result.error || !result.message) {
      if (result.error === 'conversation_closed') {
        setSendError('This conversation is now closed. Please contact the restaurant directly.');
      } else {
        setSendError('Failed to send message. Please try again.');
      }
      setSending(false);
      return;
    }

    // Do NOT manually append the message — the polling loop is the single source
    // of truth. Appending here and then having the next poll replace the list can
    // briefly show the same message twice if the poll fires before React commits
    // the append. Instead, scroll to bottom and trigger an immediate poll so the
    // saved message appears within milliseconds with no duplication risk.
    wasNearBottomRef.current = true;
    setMessageText('');
    setSending(false);
    inputRef.current?.focus();
    // Immediate re-poll to show the sent message without waiting 3 seconds
    pollRef.current?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isClosed = conversation?.status === 'closed';

  // Render directly without Layout — Layout's customer-scroll container is a
  // page-level scroller that would intercept scrollIntoView calls. The chat
  // manages its own locked viewport structure here.
  const shell = (content: React.ReactNode) => (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#0a0a0a',
        zIndex: 10,
      }}
    >
      {content}
    </div>
  );

  if (loading) {
    return shell(
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto mb-3" />
          <p className="text-stone-400 text-sm">Loading conversation...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return shell(
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="text-white font-medium mb-2">Unable to load chat</p>
          <p className="text-stone-400 text-sm mb-6">{loadError}</p>
          <Button variant="secondary" onClick={onBack}>Go Back</Button>
        </div>
      </div>
    );
  }

  return shell(
    <>
      {/* Header — flex-shrink:0, never moves */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid #292524', background: '#111' }}>
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span className="text-white font-medium text-sm truncate">
                {restaurant?.name || 'Restaurant'}
              </span>
            </div>
            {reservation && (
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-stone-500 text-xs flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatReservationDate(reservation.start_time)}
                </span>
                <span className="text-stone-500 text-xs flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatReservationTime(reservation.start_time)}
                </span>
                <span className="text-stone-500 text-xs flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {reservation.party_size}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors disabled:opacity-40"
            aria-label="Refresh messages"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Messages — the ONLY scrollable element, fills remaining height */}
      <div
        ref={msgsRef}
        onScroll={handleMessagesScroll}
        style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}
      >
        <div className="max-w-xl mx-auto px-4 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-10 h-10 text-stone-600 mx-auto mb-3" />
              <p className="text-stone-400 text-sm font-medium">No messages yet</p>
              <p className="text-stone-600 text-xs mt-1">
                Send a message to the restaurant about your reservation.
              </p>
            </div>
          ) : (
            messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}
        </div>
      </div>

      {/* Input — flex-shrink:0, never pushed down by messages */}
      <div style={{ flexShrink: 0, borderTop: '1px solid #292524', background: '#111' }}>
        <div className="max-w-xl mx-auto px-4 py-3">
          {sendError && (
            <p className="text-red-400 text-xs mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {sendError}
            </p>
          )}
          {isClosed ? (
            <p className="text-stone-500 text-sm text-center py-2">
              This conversation is closed.
            </p>
          ) : (
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message the restaurant..."
                rows={1}
                className="flex-1 bg-stone-900 border border-stone-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-stone-500 resize-none focus:outline-none focus:border-amber-500 transition-colors"
                style={{ minHeight: '42px', maxHeight: '120px' }}
              />
              <button
                onClick={handleSend}
                disabled={!messageText.trim() || sending}
                className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: messageText.trim() && !sending ? '#d97706' : '#292524' }}
                aria-label="Send message"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Send className="w-4 h-4 text-white" />
                )}
              </button>
            </div>
          )}
          <p className="text-stone-600 text-xs mt-1.5 text-center">
            Press Enter to send &middot; Shift+Enter for new line
          </p>
        </div>
      </div>
    </>
  );
}

function MessageBubble({ message }: { message: ReservationMessage }) {
  const isCustomer = message.sender_type === 'customer';
  const isSystem = message.sender_type === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="px-3 py-1.5 rounded-full bg-stone-800 text-stone-400 text-xs">
          {message.message_body}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${isCustomer ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-center gap-1.5 ${isCustomer ? 'flex-row-reverse' : 'flex-row'}`}>
        <span className="text-stone-500 text-xs">{message.sender_name}</span>
        <span className="text-stone-600 text-xs">{formatTimestamp(message.created_at)}</span>
      </div>
      <div
        className={`max-w-xs lg:max-w-sm px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isCustomer
            ? 'rounded-br-sm text-white'
            : 'rounded-bl-sm text-stone-100 bg-stone-800'
        }`}
        style={isCustomer ? { background: '#d97706' } : {}}
      >
        {message.message_body}
      </div>
    </div>
  );
}
