import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { BookingControlBar, BookingParams } from '../components/BookingControlBar';
import { ArrowLeft, Clock, TrendingUp, Flame } from 'lucide-react';
import { Restaurant, AvailabilityQuery } from '../lib/types';
import { getAvailableTimeSlots, TimeSlot } from '../services/reservations';

interface SelectTimePageProps {
  restaurant: Restaurant;
  query: AvailabilityQuery;
  onBack: () => void;
  onSelectTime: (time: string, tableId: string) => void;
  onStaffLogin: () => void;
  onManageReservation: () => void;
  onQueryChange?: (query: AvailabilityQuery) => void;
}

export function SelectTimePage({
  restaurant,
  query,
  onBack,
  onSelectTime,
  onStaffLogin,
  onManageReservation,
  onQueryChange,
}: SelectTimePageProps) {
  const [localQuery, setLocalQuery] = useState<AvailabilityQuery>(query);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalQuery(query);
  }, [query.date, query.time, query.party_size]);

  useEffect(() => {
    loadTimeSlots();
  }, [localQuery.date, localQuery.party_size, restaurant.id]);

  const loadTimeSlots = async () => {
    try {
      setLoading(true);
      setError(null);
      const slots = await getAvailableTimeSlots(restaurant.id, localQuery.date, localQuery.party_size);
      setTimeSlots(slots);
    } catch {
      setError('Failed to load available times');
    } finally {
      setLoading(false);
    }
  };

  const handleParamsChange = (params: BookingParams) => {
    const newQuery: AvailabilityQuery = {
      date: params.date,
      time: params.time,
      party_size: params.partySize,
    };
    setLocalQuery(newQuery);
    onQueryChange?.(newQuery);
  };

  const bookingParams: BookingParams = {
    date: localQuery.date,
    time: localQuery.time,
    partySize: localQuery.party_size,
  };

  return (
    <Layout onStaffLogin={onStaffLogin} onManageReservation={onManageReservation} bookingStep="select-table">
      <div className="max-w-4xl mx-auto">
        <Button variant="secondary" onClick={onBack} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Search
        </Button>

        <div
          className="rounded-2xl overflow-hidden shadow-2xl mb-6"
          style={{
            background: 'linear-gradient(160deg, #141210 0%, #0e0c0a 60%, #111009 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          {/* Header */}
          <div className="px-6 pt-7 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <h1 className="text-2xl font-bold mb-4" style={{ color: 'rgba(240,232,218,0.96)', letterSpacing: '-0.01em' }}>
              Select a Time
            </h1>

            {/* Restaurant info */}
            <div className="text-sm mb-5" style={{ color: 'rgba(185,170,148,0.65)' }}>
              {restaurant.name}
              {restaurant.location && (
                <span style={{ color: 'rgba(185,170,148,0.45)' }}> · {restaurant.location}</span>
              )}
            </div>

            {/* Editable booking controls */}
            <BookingControlBar
              params={bookingParams}
              onParamsChange={handleParamsChange}
              isUpdating={loading}
            />
          </div>

          {/* Time slots */}
          <div className="px-6 py-6">
            {loading && (
              <div className="text-center py-10">
                <div
                  className="w-10 h-10 rounded-full animate-spin mx-auto mb-4"
                  style={{ border: '3px solid rgba(185,155,80,0.25)', borderTopColor: 'rgba(185,155,80,0.90)' }}
                />
                <p className="text-sm" style={{ color: 'rgba(185,170,148,0.55)' }}>Loading available times…</p>
              </div>
            )}

            {error && (
              <div
                className="mb-6 rounded-xl px-4 py-3.5 text-sm"
                style={{ background: 'rgba(160,40,40,0.14)', border: '1px solid rgba(180,60,60,0.35)', color: 'rgba(220,140,140,0.90)' }}
              >
                {error}
              </div>
            )}

            {!loading && !error && timeSlots.length === 0 && (
              <div className="text-center py-10">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <Clock className="w-7 h-7" style={{ color: 'rgba(185,155,80,0.55)' }} />
                </div>
                <h2 className="text-lg font-semibold mb-2" style={{ color: 'rgba(235,225,208,0.88)' }}>
                  No Available Times
                </h2>
                <p className="text-sm mb-6" style={{ color: 'rgba(185,170,148,0.60)' }}>
                  No available times for this date and party size. Try a different date or party size above.
                </p>
              </div>
            )}

            {!loading && !error && timeSlots.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(185,155,80,0.70)' }}>
                    Available Times
                  </p>
                  <div className="flex items-center gap-4 text-xs" style={{ color: 'rgba(185,170,148,0.55)' }}>
                    <div className="flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5" style={{ color: 'rgba(230,120,60,0.80)' }} />
                      <span>Popular</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" style={{ color: 'rgba(100,150,230,0.80)' }} />
                      <span>Prime Time</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
                  {timeSlots.map((slot) => {
                    const hour = parseInt(slot.time.split(':')[0]);
                    const isPrimeTime = hour >= 18 && hour < 21;
                    const isPopular = hour >= 19 && hour < 20;

                    return (
                      <button
                        key={slot.time}
                        onClick={() => onSelectTime(slot.time, slot.availableTableId!)}
                        className="relative px-3 py-3 rounded-xl font-medium transition-all focus:outline-none text-sm"
                        style={
                          isPopular
                            ? {
                                background: 'linear-gradient(135deg, rgba(200,80,30,0.85) 0%, rgba(180,50,20,0.85) 100%)',
                                color: 'rgba(255,230,200,0.95)',
                                border: '1px solid rgba(220,100,40,0.40)',
                                boxShadow: '0 2px 10px rgba(180,60,20,0.25)',
                              }
                            : isPrimeTime
                            ? {
                                background: 'linear-gradient(135deg, rgba(50,90,200,0.80) 0%, rgba(30,70,180,0.80) 100%)',
                                color: 'rgba(200,220,255,0.95)',
                                border: '1px solid rgba(80,120,220,0.40)',
                                boxShadow: '0 2px 10px rgba(40,70,190,0.20)',
                              }
                            : {
                                background: 'rgba(255,255,255,0.05)',
                                color: 'rgba(220,210,195,0.85)',
                                border: '1px solid rgba(255,255,255,0.09)',
                              }
                        }
                      >
                        {isPopular && (
                          <Flame className="absolute top-1 right-1 w-3 h-3 animate-pulse" style={{ color: 'rgba(255,200,100,0.85)' }} />
                        )}
                        {isPrimeTime && !isPopular && (
                          <TrendingUp className="absolute top-1 right-1 w-3 h-3" style={{ color: 'rgba(160,190,255,0.70)' }} />
                        )}
                        {slot.time}
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs mt-5 text-center" style={{ color: 'rgba(185,170,148,0.45)' }}>
                  Select a time to continue with your reservation
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
