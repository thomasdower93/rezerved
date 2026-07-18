import React, { useState, useEffect } from 'react';
import { RezervdLogo } from '../components/RezervdLogo';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { DateSelector } from '../components/DateSelector';
import { TimeSelector } from '../components/TimeSelector';
import { ChevronDown, ChevronUp, Calendar, MapPin, CheckCircle2, MapPinned, AlertCircle } from 'lucide-react';
import { User } from '../lib/types';
import { getMinDate, getMinTime, isInPast } from '../lib/utils';

interface LandingPageProps {
  onSearch: (date: string, time: string, partySize: number, filters: SearchFilters) => void;
  onStaffLogin: () => void;
  onManageReservation: () => void;
  onForRestaurants: () => void;
  user: User | null;
  onCustomerDashboard: () => void;
}

export interface SearchFilters {
  cuisine?: string;
  location?: string;
  business_type?: string;
}

export function LandingPage({ onSearch, onStaffLogin, onManageReservation, onForRestaurants, user, onCustomerDashboard }: LandingPageProps) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [showFilters, setShowFilters] = useState(false);
  const [dateTimeError, setDateTimeError] = useState('');

  const [filters, setFilters] = useState<SearchFilters>({
    cuisine: '',
    location: '',
    business_type: '',
  });

  useEffect(() => {
    setDefaultDateTime();
  }, []);

  const setDefaultDateTime = () => {
    const now = new Date();
    now.setUTCHours(now.getUTCHours() + 2);

    const dateStr = now.toISOString().split('T')[0];
    const hours = now.getUTCHours();
    const minutes = Math.ceil(now.getUTCMinutes() / 15) * 15;
    const timeStr = `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;

    setDate(dateStr);
    setTime(timeStr);
  };

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setDateTimeError('');

    if (newDate === getMinDate()) {
      const minTime = getMinTime(newDate);
      if (minTime && time < minTime) {
        setTime(minTime);
      }
    }
  };

  const handleTimeChange = (newTime: string) => {
    setTime(newTime);
    setDateTimeError('');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDateTimeError('');

    if (!date || !time || partySize <= 0) {
      return;
    }

    if (isInPast(date, time, 15)) {
      setDateTimeError('Please select a future date and time');
      return;
    }

    const cleanFilters = {
      cuisine: filters.cuisine || undefined,
      location: filters.location || undefined,
      business_type: filters.business_type || undefined,
    };
    onSearch(date, time, partySize, cleanFilters);
  };

  const partySizeOptions = Array.from({ length: 20 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1} ${i === 0 ? 'Guest' : 'Guests'}`,
  }));

  const cuisineOptions = [
    { value: '', label: 'All Cuisines' },
    { value: 'Italian', label: 'Italian' },
    { value: 'Chinese', label: 'Chinese' },
    { value: 'Japanese', label: 'Japanese' },
    { value: 'Mexican', label: 'Mexican' },
    { value: 'Indian', label: 'Indian' },
    { value: 'French', label: 'French' },
    { value: 'Thai', label: 'Thai' },
    { value: 'American', label: 'American' },
    { value: 'Mediterranean', label: 'Mediterranean' },
  ];

  const businessTypeOptions = [
    { value: '', label: 'All Types' },
    { value: 'Restaurant', label: 'Restaurant' },
    { value: 'Cafe', label: 'Cafe' },
    { value: 'Bar', label: 'Bar' },
    { value: 'Pub', label: 'Pub' },
    { value: 'Bistro', label: 'Bistro' },
  ];

  return (
    <div className="customer-shell">
      <Header
        user={user}
        onStaffLogin={onStaffLogin}
        onCustomerDashboard={onCustomerDashboard}
        onForRestaurants={onForRestaurants}
      />

      <div className="customer-scroll">
        <main className="customer-main">
        <div className="hero-centered-wrapper">
          <div className="hero-card-container">
            <div className="premium-card rounded-3xl p-6 sm:p-10 hover:shadow-3xl transition-all duration-500 animate-scaleIn">
              <div className="text-center mb-8">
                <h1 className="text-3xl sm:text-4xl font-bold text-app-text mb-2 leading-tight">
                  Find Your Table
                </h1>
                <p className="text-sm font-light tracking-widest uppercase mb-1"
                  style={{ color: 'rgba(212,145,93,0.7)', letterSpacing: '0.18em' }}>
                  Dine with intention
                </p>
              </div>

              <form onSubmit={handleSearch} className="space-y-5">
                {dateTimeError && (
                  <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{dateTimeError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DateSelector
                    label="Date"
                    value={date}
                    onChange={handleDateChange}
                    min={getMinDate()}
                    className="w-full"
                  />

                  <TimeSelector
                    label="Time"
                    value={time}
                    onChange={handleTimeChange}
                    className="w-full"
                  />
                </div>

                <Select
                  label="Party Size"
                  value={String(partySize)}
                  onChange={(e) => setPartySize(Number(e.target.value))}
                  options={partySizeOptions}
                  required
                />

                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-app-bg-tertiary hover:bg-app-bg-tertiary/80 rounded-xl transition-colors text-app-text-secondary font-normal text-sm border border-app-border"
                >
                  <span className="flex items-center gap-2">
                    <MapPinned className="w-3.5 h-3.5" />
                    Optional filters
                    {(filters.cuisine || filters.location || filters.business_type) && (
                      <span className="ml-1.5 px-1.5 py-0.5 bg-app-accent/20 text-app-accent text-xs rounded-full">
                        {[filters.cuisine, filters.location, filters.business_type].filter(Boolean).length}
                      </span>
                    )}
                  </span>
                  {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showFilters && (
                  <div className="space-y-4 p-5 bg-app-bg-tertiary rounded-xl border border-app-border">
                    <Input
                      label="Location"
                      placeholder="City, area, or postcode"
                      value={filters.location || ''}
                      onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                    />

                    <Select
                      label="Cuisine"
                      value={filters.cuisine || ''}
                      onChange={(e) => setFilters({ ...filters, cuisine: e.target.value })}
                      options={cuisineOptions}
                    />

                    <Select
                      label="Business Type"
                      value={filters.business_type || ''}
                      onChange={(e) => setFilters({ ...filters, business_type: e.target.value })}
                      options={businessTypeOptions}
                    />

                    {(filters.cuisine || filters.location || filters.business_type) && (
                      <button
                        type="button"
                        onClick={() => setFilters({ cuisine: '', location: '', business_type: '' })}
                        className="text-sm text-app-text-secondary hover:text-app-text font-normal"
                      >
                        Clear all filters
                      </button>
                    )}
                  </div>
                )}

                <Button type="submit" size="lg" className="w-full">
                  Find Available Tables
                </Button>
              </form>
            </div>
          </div>
        </div>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-2xl sm:text-3xl font-bold text-app-text mb-3 leading-tight">
                How It Works
              </h2>
              <p className="text-base text-app-text-secondary leading-relaxed">
                Book your table in three simple steps
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
              <div
                className="premium-card rounded-2xl p-6 text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group animate-slideUp"
                style={{ animationDelay: '0.1s', animationFillMode: 'both' }}
              >
                <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-app-accent/20 to-app-accent/10 rounded-xl mb-4 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <Calendar className="w-7 h-7 text-app-accent" />
                </div>
                <h3 className="text-base font-bold text-app-text mb-2 leading-snug">
                  Choose your time
                </h3>
                <p className="text-sm text-app-text-secondary leading-relaxed">
                  Select your date, time, and party size.
                </p>
              </div>

              <div
                className="premium-card rounded-2xl p-6 text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group animate-slideUp"
                style={{ animationDelay: '0.2s', animationFillMode: 'both' }}
              >
                <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-app-accent/20 to-app-accent/10 rounded-xl mb-4 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <MapPin className="w-7 h-7 text-app-accent" />
                </div>
                <h3 className="text-base font-bold text-app-text mb-2 leading-snug">
                  Pick your table
                </h3>
                <p className="text-sm text-app-text-secondary leading-relaxed">
                  Choose your preferred table from an interactive floor plan.
                </p>
              </div>

              <div
                className="premium-card rounded-2xl p-6 text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group animate-slideUp"
                style={{ animationDelay: '0.3s', animationFillMode: 'both' }}
              >
                <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-app-accent/20 to-app-accent/10 rounded-xl mb-4 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <CheckCircle2 className="w-7 h-7 text-app-accent" />
                </div>
                <h3 className="text-base font-bold text-app-text mb-2 leading-snug">
                  Confirm your booking
                </h3>
                <p className="text-sm text-app-text-secondary leading-relaxed">
                  Secure your reservation and receive confirmation.
                </p>
              </div>
            </div>
          </div>
        </section>
        </main>

        <Footer onManageReservation={onManageReservation} />
      </div>
    </div>
  );
}

function Header({ user, onStaffLogin, onCustomerDashboard, onForRestaurants }: {
  user: User | null;
  onStaffLogin: () => void;
  onCustomerDashboard: () => void;
  onForRestaurants: () => void;
}) {
  return (
    <header className="customer-header">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-[72px] gap-2">
          <div className="flex items-center min-w-0">
            <RezervdLogo size="sm" />
          </div>
          <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
            {user ? (
              <Button onClick={onCustomerDashboard} variant="secondary" size="sm">
                My Account
              </Button>
            ) : (
              <>
                {/* Low-emphasis restaurant link — hidden on very small screens to prevent overflow */}
                <button
                  onClick={onForRestaurants}
                  className="hidden sm:inline-block text-xs whitespace-nowrap transition-colors duration-200 bg-transparent border-0 p-0 cursor-pointer"
                  style={{ color: 'rgba(255,255,255,0.38)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.65)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.38)')}
                >
                  List your restaurant
                </button>
                <Button
                  onClick={onStaffLogin}
                  variant="secondary"
                  size="sm"
                  className="!px-3 !py-1.5 !text-xs sm:!px-4 sm:!py-2 sm:!text-sm whitespace-nowrap"
                >
                  Manage booking
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function Footer({ onManageReservation }: { onManageReservation: () => void }) {
  return (
    <footer className="customer-footer customer-header border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-6">

        {/* 3-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10 items-start">

          {/* Col 1 — Brand block */}
          <div style={{ alignSelf: 'start' }}>
            {/* Monogram — sized to match the h3 heading line height so tops align */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ width: '36px', height: '36px', mixBlendMode: 'screen' }}>
                <img
                  src="/faviconlogo-Photoroom.png"
                  alt="Rezerved"
                  style={{ width: '36px', height: '36px', display: 'block' }}
                  draggable={false}
                />
              </div>
            </div>
            <ul className="space-y-3 text-sm">
              <li>
                <p style={{ color: 'rgba(255,255,255,0.45)', maxWidth: '220px', lineHeight: '1.5' }}>
                  The easiest way to book your next dining experience.
                </p>
              </li>
            </ul>
          </div>

          {/* Col 2 — For Diners */}
          <div>
            <h3 className="text-sm font-semibold tracking-wider uppercase mb-4"
                style={{ color: 'rgba(255,255,255,0.75)', letterSpacing: '0.08em' }}>
              For Diners
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <button
                  onClick={onManageReservation}
                  className="transition-all duration-200 hover:translate-x-1 inline-block"
                  style={{ color: 'rgba(255,255,255,0.45)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgb(var(--color-accent))')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
                >
                  Manage existing reservation
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3 — For Restaurants */}
          <div>
            <h3 className="text-sm font-semibold tracking-wider uppercase mb-4"
                style={{ color: 'rgba(255,255,255,0.75)', letterSpacing: '0.08em' }}>
              For Restaurants
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="/restaurants"
                  onClick={(e) => {
                    e.preventDefault();
                    window.history.pushState({}, '', '/restaurants');
                    window.location.href = '/restaurants';
                  }}
                  className="transition-all duration-200 hover:translate-x-1 inline-block"
                  style={{ color: 'rgba(255,255,255,0.45)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgb(var(--color-accent))')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
                >
                  Info for restaurants
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright + legal links row */}
        <div className="border-t pt-6 text-center space-y-2" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
            {[
              { label: 'Booking Terms', href: '/booking-terms' },
              { label: 'Cancellation Policy', href: '/cancellation-policy' },
              { label: 'Privacy Policy', href: '/privacy-policy' },
              { label: 'Cookie & Storage Policy', href: '/cookie-policy' },
              { label: 'Terms of Use', href: '/terms' },
            ].map(({ label, href }) => (
              <a
                key={href}
                href={href}
                className="text-xs transition-colors hover:opacity-70"
                style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                {label}
              </a>
            ))}
          </div>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            &copy; {new Date().getFullYear()} Rezerved. All rights reserved.
          </div>
        </div>

      </div>
    </footer>
  );
}
