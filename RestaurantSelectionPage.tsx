import React, { useState, useEffect } from 'react';
import { RezervdLogo } from '../components/RezervdLogo';
import { Button } from '../components/Button';
import { BackgroundImage } from '../components/BackgroundImage';
import { getRestaurants, RestaurantFilters } from '../services/restaurants';
import { getBatchAvailabilityInfo, RestaurantAvailabilityInfo } from '../services/reservations';
import { Restaurant } from '../lib/types';
import { formatOpeningHoursForDate, sanitizeDateTime, isInPast } from '../lib/utils';
import { MapPin, Clock, CheckCircle2, Calendar, Users, ArrowLeft, Search, Utensils, Star, Info, AlertCircle, Wifi, Car, Accessibility, UtensilsCrossed, TrendingUp, Sparkles, DollarSign } from 'lucide-react';
import { SearchFilters } from './LandingPage';
import { useTheme } from '../contexts/ThemeContext';
import { GuestSelector } from '../components/GuestSelector';
import { DateSelector } from '../components/DateSelector';
import { TimeSelector } from '../components/TimeSelector';
import { RestaurantCardSkeleton } from '../components/SkeletonLoader';

function getOrCreateSessionKey(): string {
  const key = 'booking_session_key';
  let sessionKey = sessionStorage.getItem(key);
  if (!sessionKey) {
    sessionKey = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    sessionStorage.setItem(key, sessionKey);
  }
  return sessionKey;
}

function getRestaurantImage(cuisine?: string, businessType?: string): string {
  const imageMap: Record<string, string> = {
    'Italian': 'https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Japanese': 'https://images.pexels.com/photos/2097090/pexels-photo-2097090.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Chinese': 'https://images.pexels.com/photos/1410235/pexels-photo-1410235.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Mexican': 'https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Indian': 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=800',
    'French': 'https://images.pexels.com/photos/262978/pexels-photo-262978.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Thai': 'https://images.pexels.com/photos/1092730/pexels-photo-1092730.jpeg?auto=compress&cs=tinysrgb&w=800',
    'American': 'https://images.pexels.com/photos/1639562/pexels-photo-1639562.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Mediterranean': 'https://images.pexels.com/photos/1305063/pexels-photo-1305063.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Cafe': 'https://images.pexels.com/photos/302899/pexels-photo-302899.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Bar': 'https://images.pexels.com/photos/274192/pexels-photo-274192.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Pub': 'https://images.pexels.com/photos/1267696/pexels-photo-1267696.jpeg?auto=compress&cs=tinysrgb&w=800',
    'Bistro': 'https://images.pexels.com/photos/67468/pexels-photo-67468.jpeg?auto=compress&cs=tinysrgb&w=800',
  };

  if (cuisine && imageMap[cuisine]) {
    return imageMap[cuisine];
  }
  if (businessType && imageMap[businessType]) {
    return imageMap[businessType];
  }

  return 'https://images.pexels.com/photos/262047/pexels-photo-262047.jpeg?auto=compress&cs=tinysrgb&w=800';
}

interface RestaurantSelectionPageProps {
  date: string;
  time: string;
  partySize: number;
  filters: SearchFilters;
  onSelectRestaurant: (restaurantId: string) => void;
  onBack: () => void;
  onStaffLogin: () => void;
  onDateChange?: (date: string) => void;
  onTimeChange?: (time: string) => void;
  onPartySizeChange?: (size: number) => void;
}

interface AvailabilityCache {
  data: Record<string, RestaurantAvailabilityInfo>;
  timestamp: number;
  params: string;
}

const CACHE_DURATION = 30000;

export function RestaurantSelectionPage({
  date,
  time,
  partySize,
  filters,
  onSelectRestaurant,
  onBack,
  onStaffLogin,
  onDateChange,
  onTimeChange,
  onPartySizeChange,
}: RestaurantSelectionPageProps) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stickyBarHeight, setStickyBarHeight] = useState(128);
  const [availability, setAvailability] = useState<Record<string, RestaurantAvailabilityInfo>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState<Record<string, boolean>>({});
  const [dateTimeWarning, setDateTimeWarning] = useState<string>('');
  const availabilityCacheRef = React.useRef<AvailabilityCache | null>(null);

  useEffect(() => {
    if (isInPast(date, time, 15)) {
      setDateTimeWarning('The selected date/time is in the past. Please choose a future time.');
      if (onDateChange && onTimeChange) {
        const sanitized = sanitizeDateTime(date, time);
        if (sanitized.wasCorrected) {
          onDateChange(sanitized.date);
          onTimeChange(sanitized.time);
        }
      }
    } else {
      setDateTimeWarning('');
    }
  }, [date, time]);

  useEffect(() => {
    let mounted = true;

    const loadRestaurants = async () => {
      console.log('[RestaurantSelection] Starting to load restaurants', filters);
      setLoading(true);
      setError(null);

      try {
        const restaurantFilters: RestaurantFilters = {
          cuisine: filters.cuisine,
          location: filters.location,
          business_type: filters.business_type,
        };

        console.log('[RestaurantSelection] Calling getRestaurants with filters:', restaurantFilters);
        const data = await getRestaurants(restaurantFilters);

        console.log('[RestaurantSelection] Received data:', data?.length, 'restaurants');

        if (mounted) {
          setRestaurants(data);
          setLoading(false);
          console.log('[RestaurantSelection] State updated, loading = false');
        } else {
          console.log('[RestaurantSelection] Component unmounted, ignoring results');
        }
      } catch (error) {
        console.error('[RestaurantSelection] Failed to load restaurants:', error);
        if (mounted) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load restaurants';
          console.error('[RestaurantSelection] Setting error:', errorMessage);
          setError(errorMessage);
          setLoading(false);
        }
      }
    };

    loadRestaurants();

    return () => {
      console.log('[RestaurantSelection] Component unmounting');
      mounted = false;
    };
  }, [filters]);

  useEffect(() => {
    let mounted = true;

    const loadAvailability = async () => {
      if (restaurants.length === 0) return;

      const cacheKey = `${date}-${time}-${partySize}`;

      const cachedEntry = availabilityCacheRef.current;
      if (cachedEntry &&
          cachedEntry.params === cacheKey &&
          Date.now() - cachedEntry.timestamp < CACHE_DURATION) {
        console.log('[Availability] Using cached data');
        if (mounted) {
          setAvailability(cachedEntry.data);
        }
        return;
      }

      const sessionKey = getOrCreateSessionKey();
      const loadingStates: Record<string, boolean> = {};
      restaurants.forEach(r => loadingStates[r.id] = true);

      if (mounted) {
        setAvailabilityLoading(loadingStates);
      }

      try {
        const restaurantIds = restaurants.map(r => r.id);
        const availabilityMap = await getBatchAvailabilityInfo(restaurantIds, date, time, partySize, sessionKey);

        if (mounted) {
          setAvailability(availabilityMap);
          const loadingComplete: Record<string, boolean> = {};
          restaurants.forEach(r => loadingComplete[r.id] = false);
          setAvailabilityLoading(loadingComplete);

          availabilityCacheRef.current = {
            data: availabilityMap,
            timestamp: Date.now(),
            params: cacheKey
          };
        }
      } catch (error) {
        console.error('Failed to load batch availability:', error);

        if (mounted) {
          const emptyAvailability: Record<string, RestaurantAvailabilityInfo> = {};
          const loadingComplete: Record<string, boolean> = {};
          restaurants.forEach(r => {
            emptyAvailability[r.id] = { count: 0 };
            loadingComplete[r.id] = false;
          });
          setAvailability(emptyAvailability);
          setAvailabilityLoading(loadingComplete);
        }
      }
    };

    loadAvailability();

    return () => {
      mounted = false;
    };
  }, [restaurants, date, time, partySize]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  if (loading) {
    return (
      <div className="customer-shell">
        <BackgroundImage />
        <StickySearchBar
          date={date}
          time={time}
          partySize={partySize}
          onBack={onBack}
          onStaffLogin={onStaffLogin}
          onDateChange={onDateChange}
          onTimeChange={onTimeChange}
          onPartySizeChange={onPartySizeChange}
          onHeightChange={setStickyBarHeight}
        />
        <div className="customer-scroll">
          <main className="customer-main">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" style={{ paddingTop: stickyBarHeight + 16 }}>
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-16 h-16 border-4 border-app-accent border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-xl font-semibold text-app-text mb-2">Finding restaurants</p>
                <p className="text-app-text-secondary">Searching for available tables...</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    style={{
                      animation: `fadeIn 0.5s ease-in-out ${i * 0.1}s both`,
                    }}
                  >
                    <RestaurantCardSkeleton />
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="customer-shell">
        <BackgroundImage />
        <StickySearchBar
          date={date}
          time={time}
          partySize={partySize}
          onBack={onBack}
          onStaffLogin={onStaffLogin}
          onDateChange={onDateChange}
          onTimeChange={onTimeChange}
          onPartySizeChange={onPartySizeChange}
          onHeightChange={setStickyBarHeight}
        />
        <div className="customer-scroll">
          <main className="customer-main">
            <div className="flex items-center justify-center min-h-[60vh]" style={{ paddingTop: stickyBarHeight + 16 }}>
              <div className="text-center max-w-md mx-auto px-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                  <p className="text-red-800 font-semibold mb-2">Error Loading Restaurants</p>
                  <p className="text-red-600 text-sm mb-4">{error}</p>
                  <Button onClick={() => window.location.reload()}>Refresh Page</Button>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-shell">
      <BackgroundImage />
      <StickySearchBar
        date={date}
        time={time}
        partySize={partySize}
        onBack={onBack}
        onStaffLogin={onStaffLogin}
        onDateChange={onDateChange}
        onTimeChange={onTimeChange}
        onPartySizeChange={onPartySizeChange}
        onHeightChange={setStickyBarHeight}
      />

      <div className="customer-scroll">
        <main className="customer-main">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" style={{ paddingTop: stickyBarHeight + 16 }}>
        <div className="text-center mb-10 animate-fadeIn">
          <h2 className="text-2xl sm:text-3xl font-bold text-app-text mb-3 leading-tight">
            Select a Restaurant
          </h2>
          <p className="text-base text-app-text-secondary leading-relaxed">
            {restaurants.length} {restaurants.length === 1 ? 'restaurant' : 'restaurants'} available
          </p>
        </div>

        {dateTimeWarning && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{dateTimeWarning}</span>
          </div>
        )}

        {restaurants.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-app-bg-tertiary rounded-3xl mb-6 p-4">
              <Search className="w-12 h-12 text-app-text-tertiary opacity-40" />
            </div>
            <h3 className="text-2xl font-bold text-app-text mb-3">No restaurants found</h3>
            <p className="text-base text-app-text-secondary mb-8 leading-relaxed max-w-md mx-auto">
              We couldn't find any restaurants matching your search. Try adjusting your date, time, or filters.
            </p>
            <Button onClick={onBack} variant="secondary" size="lg">
              Back to Search
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {restaurants.map((restaurant, index) => {
              const hoursText = formatOpeningHoursForDate(restaurant, date);
              const isClosedForDate = hoursText.startsWith('Closed');
              const availInfo = availability[restaurant.id];
              const isAvailable = availInfo !== undefined && (availInfo.count > 0 || !!availInfo.nextAvailableTime);

              return (
                <button
                  key={restaurant.id}
                  onClick={() => onSelectRestaurant(restaurant.id)}
                  className="group premium-card rounded-2xl overflow-hidden text-left transition-all duration-300 hover:shadow-2xl hover:border-app-accent/50 hover:-translate-y-2 active:scale-[0.98] animate-slideUp card-lift"
                  style={{ animationDelay: `${index * 0.1}s`, animationFillMode: 'both' }}
                >
                  <div className="aspect-video bg-gradient-to-br from-app-bg-tertiary to-app-bg relative overflow-hidden image-zoom-container">
                    <img
                      src={restaurant.cover_image_url || getRestaurantImage(restaurant.cuisine, restaurant.business_type)}
                      alt={restaurant.name}
                      loading="lazy"
                      className="w-full h-full object-cover opacity-90 image-zoom"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent group-hover:from-black/70 transition-all duration-300"></div>

                    <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {restaurant.tags?.includes('top_rated') && (
                          <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-2.5 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-1 group-hover:scale-110 transition-transform duration-300">
                            <Star className="w-3 h-3 fill-current" />
                            Top Rated
                          </div>
                        )}
                        {restaurant.tags?.includes('new') && (
                          <div className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-2.5 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-1 group-hover:scale-110 transition-transform duration-300">
                            <Sparkles className="w-3 h-3" />
                            New
                          </div>
                        )}
                        {restaurant.tags?.includes('popular') && (
                          <div className="bg-gradient-to-r from-pink-500 to-rose-500 text-white px-2.5 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-1 group-hover:scale-110 transition-transform duration-300">
                            <TrendingUp className="w-3 h-3" />
                            Popular
                          </div>
                        )}
                      </div>
                      {isAvailable && (
                        <div className="bg-emerald-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5 animate-pulse-subtle group-hover:scale-110 transition-transform duration-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Available
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="text-xl font-bold text-app-text line-clamp-1 leading-tight group-hover:text-app-accent transition-colors">
                        {restaurant.name}
                      </h3>
                      {restaurant.price_range && (
                        <span className="text-app-text-secondary font-semibold flex-shrink-0 text-sm">
                          {restaurant.price_range.replace(/\$/g, '£')}
                        </span>
                      )}
                    </div>

                    {((restaurant.google_rating || restaurant.rating) || (restaurant.recent_bookings && restaurant.recent_bookings > 0)) && (
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        {(restaurant.google_rating || restaurant.rating) && (
                          <>
                            <div className="flex items-center gap-1">
                              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                              <span className="text-sm font-bold text-app-text">
                                {(restaurant.google_rating ?? restaurant.rating!).toFixed(1)}
                              </span>
                            </div>
                            {restaurant.google_rating && restaurant.google_review_count ? (
                              <>
                                <span className="text-xs text-app-text-tertiary">
                                  ({restaurant.google_review_count.toLocaleString()} Google reviews)
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs text-app-text-tertiary/70 bg-app-bg-tertiary/50 px-1.5 py-0.5 rounded border border-app-border/30">
                                  <svg width="10" height="10" viewBox="0 0 24 24" className="flex-shrink-0">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                  </svg>
                                  Google
                                </span>
                              </>
                            ) : restaurant.review_count ? (
                              <span className="text-xs text-app-text-tertiary">({restaurant.review_count} reviews)</span>
                            ) : null}
                          </>
                        )}
                        {restaurant.recent_bookings && restaurant.recent_bookings > 0 && (
                          <>
                            {(restaurant.google_rating || restaurant.rating) && (
                              <span className="text-app-text-tertiary">•</span>
                            )}
                            <span className="text-xs text-app-text-tertiary">{restaurant.recent_bookings} booked recently</span>
                          </>
                        )}
                      </div>
                    )}

                    {restaurant.description && (
                      <p className="text-sm text-app-text-secondary line-clamp-2 mb-4 leading-relaxed">
                        {restaurant.description}
                      </p>
                    )}

                    <div className="space-y-2.5 mb-4">
                      <div className="flex items-center gap-2.5">
                        <MapPin className="w-4 h-4 flex-shrink-0 text-app-accent" />
                        <span className="text-sm text-app-text-secondary line-clamp-1">{restaurant.location}</span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <Clock className={`w-4 h-4 flex-shrink-0 ${isClosedForDate ? 'text-red-500' : 'text-app-accent'}`} />
                        <span className={`text-sm ${isClosedForDate ? 'text-red-600 dark:text-red-400 font-medium' : 'text-app-text-secondary'}`}>
                          {hoursText}
                        </span>
                      </div>
                    </div>

                    {restaurant.popular_dishes && restaurant.popular_dishes.length > 0 && (
                      <div className="mb-4 p-3 bg-gradient-to-br from-app-bg-tertiary/50 to-app-bg rounded-xl border border-app-border">
                        <div className="flex items-center gap-2 mb-2">
                          <UtensilsCrossed className="w-3.5 h-3.5 text-app-accent" />
                          <span className="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">
                            Popular Dishes
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {restaurant.popular_dishes.slice(0, 3).map((dish, idx) => (
                            <span key={idx} className="text-xs text-app-text-secondary">
                              {dish}{idx < Math.min(restaurant.popular_dishes!.length - 1, 2) ? ',' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mb-4 p-3 bg-app-bg-tertiary rounded-xl border border-app-border">
                      <div className="flex items-center gap-2 mb-1">
                        <Utensils className="w-4 h-4 text-app-accent" />
                        <span className="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">
                          Availability
                        </span>
                      </div>
                      {availabilityLoading[restaurant.id] ? (
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 border-2 border-app-accent border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-sm text-app-text-tertiary">Checking...</span>
                        </div>
                      ) : (
                        <div className={`text-sm font-bold ${
                          isAvailable
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-app-text-tertiary'
                        }`}>
                          {availInfo !== undefined
                            ? availInfo.count > 0
                              ? `${availInfo.count} ${availInfo.count === 1 ? 'table' : 'tables'} available`
                              : availInfo.nextAvailableTime
                                ? `Next available at ${availInfo.nextAvailableTime}`
                                : 'No tables available'
                            : 'Checking availability...'}
                        </div>
                      )}
                    </div>

                    {restaurant.amenities && restaurant.amenities.length > 0 && (
                      <div className="mb-4">
                        <div className="flex flex-wrap gap-3">
                          {restaurant.amenities.includes('outdoor_seating') && (
                            <div className="flex items-center gap-1.5 text-app-text-tertiary" title="Outdoor Seating">
                              <UtensilsCrossed className="w-4 h-4" />
                              <span className="text-xs">Outdoor</span>
                            </div>
                          )}
                          {restaurant.amenities.includes('wifi') && (
                            <div className="flex items-center gap-1.5 text-app-text-tertiary" title="WiFi Available">
                              <Wifi className="w-4 h-4" />
                              <span className="text-xs">WiFi</span>
                            </div>
                          )}
                          {restaurant.amenities.includes('parking') && (
                            <div className="flex items-center gap-1.5 text-app-text-tertiary" title="Parking Available">
                              <Car className="w-4 h-4" />
                              <span className="text-xs">Parking</span>
                            </div>
                          )}
                          {restaurant.amenities.includes('wheelchair_accessible') && (
                            <div className="flex items-center gap-1.5 text-app-text-tertiary" title="Wheelchair Accessible">
                              <Accessibility className="w-4 h-4" />
                              <span className="text-xs">Accessible</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {(restaurant.cuisine || restaurant.business_type) && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {restaurant.cuisine && (
                          <span className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-app-bg-tertiary to-app-bg text-app-text-secondary text-xs font-medium rounded-lg border border-app-border">
                            <Utensils className="w-3 h-3 mr-1.5" />
                            {restaurant.cuisine}
                          </span>
                        )}
                        {restaurant.business_type && (
                          <span className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-app-bg-tertiary to-app-bg text-app-text-secondary text-xs font-medium rounded-lg border border-app-border">
                            <Info className="w-3 h-3 mr-1.5" />
                            {restaurant.business_type}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="pt-4 border-t border-app-border">
                      <div className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                        isAvailable
                          ? 'bg-gradient-to-r from-app-accent to-app-accent/90 text-white shadow-lg shadow-app-accent/25 group-hover:shadow-xl group-hover:shadow-app-accent/40 group-hover:from-app-accent/90 group-hover:to-app-accent'
                          : 'bg-app-bg-tertiary text-app-text-tertiary border border-app-border'
                      }`}>
                        <Utensils className="w-4 h-4" />
                        {isAvailable ? 'Select your table' : 'View restaurant'}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
          </div>
        </main>
      </div>
    </div>
  );
}

interface StickySearchBarProps {
  date: string;
  time: string;
  partySize: number;
  onBack: () => void;
  onStaffLogin: () => void;
  onDateChange?: (date: string) => void;
  onTimeChange?: (time: string) => void;
  onPartySizeChange?: (size: number) => void;
  onHeightChange?: (height: number) => void;
}

function StickySearchBar({
  date,
  time,
  partySize,
  onBack,
  onStaffLogin,
  onDateChange,
  onTimeChange,
  onPartySizeChange,
  onHeightChange,
}: StickySearchBarProps) {
  const { theme } = useTheme();
  const barRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = barRef.current;
    if (!el || !onHeightChange) return;
    onHeightChange(el.offsetHeight);
    const observer = new ResizeObserver(() => onHeightChange(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeightChange]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div ref={barRef} className="fixed top-0 left-0 right-0 z-50 glass-header border-b border-app-border/60 dark:border-white/[0.06] shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-[72px]">
          <div className="flex items-center gap-3 min-w-0">
            <RezervdLogo size="sm" />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={onStaffLogin} variant="secondary" size="sm">
              Bookings
            </Button>
          </div>
        </div>

        <div className="pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-app-text-secondary hover:text-app-text transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Change</span>
            </button>

            <div className="flex flex-wrap items-center gap-3 flex-1">
              {onDateChange ? (
                <DateSelector
                  value={date}
                  onChange={onDateChange}
                />
              ) : (
                <div className="inline-flex items-center gap-2 px-3 py-2 bg-app-bg-tertiary rounded-xl border border-app-border">
                  <Calendar className="w-4 h-4 text-app-accent" />
                  <span className="text-sm font-medium text-app-text">{formatDate(date)}</span>
                </div>
              )}

              {onTimeChange ? (
                <TimeSelector
                  value={time}
                  onChange={onTimeChange}
                />
              ) : (
                <div className="inline-flex items-center gap-2 px-3 py-2 bg-app-bg-tertiary rounded-xl border border-app-border">
                  <Clock className="w-4 h-4 text-app-accent" />
                  <span className="text-sm font-medium text-app-text">{formatTime(time)}</span>
                </div>
              )}

              {onPartySizeChange ? (
                <GuestSelector value={partySize} onChange={onPartySizeChange} min={1} max={20} />
              ) : (
                <div className="inline-flex items-center gap-2 px-3 py-2 bg-app-bg-tertiary rounded-xl border border-app-border">
                  <Users className="w-4 h-4 text-app-accent" />
                  <span className="text-sm font-medium text-app-text">
                    {partySize} {partySize === 1 ? 'Guest' : 'Guests'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
