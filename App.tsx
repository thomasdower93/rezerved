import React, { useState, useEffect, useCallback } from 'react';
import { LandingPage, SearchFilters } from './pages/LandingPage';
import { RestaurantSelectionPage } from './pages/RestaurantSelectionPage';
import { AvailabilityPage } from './pages/AvailabilityPage';
import { SelectTimePage } from './pages/SelectTimePage';
import { BookingPage } from './pages/BookingPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { ManageReservationPage } from './pages/ManageReservationPage';
import { ManageReservationLookupPage } from './pages/ManageReservationLookupPage';
import { LoginPage } from './pages/LoginPage';
import { SignUpPage } from './pages/SignUpPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { CustomerDashboard } from './pages/CustomerDashboard';
import { StaffDashboard } from './pages/StaffDashboard';
import { ServiceViewPage } from './pages/ServiceViewPage';
import { TableEditorV2Wrapper } from './pages/TableEditorV2Wrapper';
import { WalkInPhoneBookingWrapper } from './pages/WalkInPhoneBookingWrapper';
import { PreordersManagement } from './pages/PreordersManagement';
import { RestaurantProfilePage } from './pages/RestaurantProfilePage';
import { BookingRulesPage } from './pages/BookingRulesPage';
import { RestaurantsAdminPage } from './pages/admin/RestaurantsAdminPage';
import { RestaurantsInfoPage } from './pages/RestaurantsInfoPage';
import { EmailLogsPage } from './pages/EmailLogsPage';
import { CustomerChatPage } from './pages/CustomerChatPage';
import { ReconfirmPage } from './pages/ReconfirmPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { BookingTermsPage } from './pages/BookingTermsPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { CookiePolicyPage } from './pages/CookiePolicyPage';
import { CancellationPolicyPage } from './pages/CancellationPolicyPage';
import { EarlyAccessPage } from './pages/EarlyAccessPage';
import { RestaurantPartnersPage } from './pages/RestaurantPartnersPage';
import { PreLaunchSplashPage } from './pages/PreLaunchSplashPage';
import { EposIntegrationPage } from './pages/EposIntegrationPage';
import { WebsiteIntegrationPage } from './pages/WebsiteIntegrationPage';
import { EmbedBookingWidget } from './pages/EmbedBookingWidget';
import { DevBanner } from './components/DevBanner';
import { SplashPage } from './pages/SplashPage';
import { ForRestaurantsPage } from './pages/ForRestaurantsPage';
import { RequestTrialPage } from './pages/RequestTrialPage';
import { MessagesPage } from './pages/MessagesPage';
import { CustomerDataPage } from './pages/CustomerDataPage';

const RIVER_SPICE_ID = '9fbbd6fd-32a2-48d8-b4a8-3bd6c555bd50';
import { ProtectedRoute } from './components/ProtectedRoute';
import { FloorplanErrorBoundary } from './components/FloorplanErrorBoundary';
import { PageTransition } from './components/PageTransition';
import { getRestaurant } from './services/restaurants';
import { getAvailability } from './services/reservations';
import { TableAvailability, Restaurant, AvailabilityQuery } from './lib/types';
import { useAuth } from './contexts/AuthContext';

/** Default booking params used when a restaurant URL has no query params */
function getDefaultQuery(): AvailabilityQuery {
  const today = new Date();
  const date = today.toISOString().split('T')[0];
  // Default time: 19:00
  return { date, time: '19:00', party_size: 2 };
}

/** Safely parse query params for a restaurant page, falling back to defaults */
function parseRestaurantQueryParams(params: URLSearchParams): AvailabilityQuery {
  const defaults = getDefaultQuery();
  const dateParam = params.get('date');
  const timeParam = params.get('time');
  const partyParam = params.get('party');

  const dateOk = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam);
  const timeOk = timeParam && /^\d{2}:\d{2}$/.test(timeParam);
  const partyNum = partyParam ? parseInt(partyParam, 10) : NaN;
  const partyOk = !isNaN(partyNum) && partyNum >= 1 && partyNum <= 20;

  return {
    date: dateOk ? dateParam! : defaults.date,
    time: timeOk ? timeParam! : defaults.time,
    party_size: partyOk ? partyNum : defaults.party_size,
  };
}

function getOrCreateSessionKey(): string {
  const key = 'booking_session_key';
  let sessionKey = sessionStorage.getItem(key);
  if (!sessionKey) {
    sessionKey = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    sessionStorage.setItem(key, sessionKey);
  }
  return sessionKey;
}

type Page =
  | { type: 'splash' }
  | { type: 'for-restaurants' }
  | { type: 'request-trial' }
  | { type: 'landing' }
  | { type: 'restaurant-selection'; query: AvailabilityQuery; filters: SearchFilters }
  | { type: 'availability'; restaurantId: string; query: AvailabilityQuery }
  | { type: 'select-time'; restaurantId: string; query: AvailabilityQuery }
  | { type: 'booking'; restaurantId: string; table: TableAvailability; query: AvailabilityQuery; useAlternative: boolean }
  | { type: 'confirmation'; token: string; emailSent?: boolean; emailError?: string; customerEmail?: string; reservationCode?: string; awaitingAcceptance?: boolean; depositOutcome?: 'paid' | 'cancelled' | null }
  | { type: 'manage'; token: string }
  | { type: 'manage-lookup' }
  | { type: 'login' }
  | { type: 'signup' }
  | { type: 'forgot-password' }
  | { type: 'reset-password' }
  | { type: 'customer-dashboard' }
  | { type: 'staff-dashboard'; tab: 'dashboard' | 'messages' | 'customers' | 'tables' | 'walk_ins' | 'preorders' | 'profile' | 'booking_rules' | 'analytics' | 'epos' | 'website_integration' }
  | { type: 'email-logs' }
  | { type: 'admin-restaurants' }
  | { type: 'restaurants-info' }
  | { type: 'customer-chat'; token: string }
  | { type: 'reconfirm'; action: 'confirm' | 'cancel'; token: string }
  | { type: 'service-view' }
  | { type: 'booking-terms'; source?: 'booking-flow' | 'home' | 'footer' | 'manage-booking' | 'confirmation'; returnToPage?: Page; preserveHold?: boolean }
  | { type: 'privacy-policy'; source?: 'booking-flow' | 'home' | 'footer' | 'manage-booking' | 'confirmation'; returnToPage?: Page; preserveHold?: boolean }
  | { type: 'cookie-policy'; source?: 'booking-flow' | 'home' | 'footer' | 'manage-booking' | 'confirmation'; returnToPage?: Page; preserveHold?: boolean }
  | { type: 'cancellation-policy'; source?: 'booking-flow' | 'home' | 'footer' | 'manage-booking' | 'confirmation'; returnToPage?: Page; preserveHold?: boolean }
  | { type: 'early-access' }
  | { type: 'restaurant-partners' }
  | { type: 'pre-launch-splash' };

function pageToUrl(page: Page): string {
  switch (page.type) {
    case 'splash': return '/';
    case 'for-restaurants': return '/for-restaurants';
    case 'request-trial': return '/request-trial';
    case 'landing': return '/search';
    case 'restaurant-selection': {
      const params = new URLSearchParams({
        date: page.query.date,
        time: page.query.time,
        party: page.query.party_size.toString(),
      });
      if (page.filters.location) params.set('location', page.filters.location);
      if (page.filters.cuisine) params.set('cuisine', page.filters.cuisine);
      if (page.filters.business_type) params.set('business_type', page.filters.business_type);
      return `/search?${params.toString()}`;
    }
    case 'availability':
    case 'select-time': {
      const params = new URLSearchParams({
        date: page.query.date,
        time: page.query.time,
        party: page.query.party_size.toString(),
      });
      return `/restaurant/${page.restaurantId}?${params.toString()}`;
    }
    case 'booking': {
      const params = new URLSearchParams({
        date: page.query.date,
        time: page.query.time,
        party: page.query.party_size.toString(),
      });
      return `/restaurant/${page.restaurantId}/book?${params.toString()}`;
    }
    case 'confirmation': return `/confirmation?token=${page.token}`;
    case 'manage': return `/manage?token=${page.token}`;
    case 'customer-chat': return `/chat?token=${page.token}`;
    case 'reconfirm': return `/reconfirm?action=${page.action}&token=${page.token}`;
    case 'manage-lookup': return '/manage-reservation';
    case 'login': return '/login';
    case 'signup': return '/signup';
    case 'forgot-password': return '/forgot-password';
    case 'reset-password': return '/reset-password';
    case 'customer-dashboard': return '/customer/dashboard';
    case 'staff-dashboard': return '/staff/dashboard';
    case 'email-logs': return '/email-logs';
    case 'admin-restaurants': return '/admin/restaurants';
    case 'restaurants-info': return '/restaurants';
    case 'service-view': return '/staff/service-view';
    case 'booking-terms': return '/booking-terms';
    case 'privacy-policy': return '/privacy-policy';
    case 'cookie-policy': return '/cookie-policy';
    case 'cancellation-policy': return '/cancellation-policy';
    case 'early-access': return '/early-access';
    case 'restaurant-partners': return '/restaurant-partners';
    case 'pre-launch-splash': return '/';
    default: return '/';
  }
}

function navigate(page: Page, replace = false) {
  const url = pageToUrl(page);
  if (replace) {
    window.history.replaceState({ page }, '', url);
  } else {
    window.history.pushState({ page }, '', url);
  }
}

function App() {
  const { user, logout, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>({ type: 'landing' });
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const initialNavigationDone = React.useRef(false);
  // Tracks the live query for the current restaurant page (updated by onQueryChange)
  const liveQueryRef = React.useRef<AvailabilityQuery | null>(null);

  const userRef = React.useRef(user);
  userRef.current = user;
  const restaurantRef = React.useRef(restaurant);
  restaurantRef.current = restaurant;

  const goTo = React.useCallback((page: Page, replace = false) => {
    setCurrentPage(page);
    navigate(page, replace);
  }, []);

  const resolveInitialPage = React.useCallback((currentUser: typeof user): Page => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      return { type: 'reset-password' };
    }

    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname;


    // Path-specific token routes — checked before the generic token fallback
    if (path === '/confirmation') {
      const confToken = params.get('token');
      const depositParam = params.get('deposit');
      const depositOutcome = depositParam === 'paid' ? 'paid' : depositParam === 'cancelled' ? 'cancelled' : null;
      if (confToken) return { type: 'confirmation', token: confToken, depositOutcome };
      return { type: 'landing' };
    }
    if (path === '/chat') {
      const chatToken = params.get('token');
      if (chatToken) return { type: 'customer-chat', token: chatToken };
      return { type: 'landing' };
    }
    if (path === '/reconfirm') {
      const rcToken = params.get('token');
      const rcAction = params.get('action');
      if (rcToken && (rcAction === 'confirm' || rcAction === 'cancel')) {
        return { type: 'reconfirm', action: rcAction, token: rcToken };
      }
      return { type: 'landing' };
    }

    // Generic token fallback: any URL with ?token= is a manage link
    // (covers /?token=, /manage?token=, and any other paths the email might generate)
    const token = params.get('token');
    if (token) {
      return { type: 'manage', token };
    }

    if (path === '/search') {
      const date = params.get('date');
      const time = params.get('time');
      const partySize = params.get('party');
      const location = params.get('location');
      const cuisine = params.get('cuisine');
      const businessType = params.get('business_type');

      if (date && time && partySize) {
        return {
          type: 'restaurant-selection',
          query: { date, time, party_size: parseInt(partySize, 10) },
          filters: {
            location: location || undefined,
            cuisine: cuisine || undefined,
            business_type: businessType || undefined,
          },
        };
      }
      return { type: 'landing' };
    }

    const restaurantBookMatch = path.match(/^\/restaurant\/([a-f0-9-]+)\/book$/);
    if (restaurantBookMatch) {
      // Direct /book URL — land on availability page without a pre-selected table
      const restaurantId = restaurantBookMatch[1];
      const query = parseRestaurantQueryParams(params);
      return { type: 'availability', restaurantId, query };
    }

    const restaurantMatch = path.match(/^\/restaurant\/([a-f0-9-]+)$/);
    if (restaurantMatch) {
      const restaurantId = restaurantMatch[1];
      const query = parseRestaurantQueryParams(params);
      return { type: 'availability', restaurantId, query };
    }

    if (path === '/signup') return { type: 'signup' };
    if (path === '/forgot-password') return { type: 'forgot-password' };
    if (path === '/reset-password') return { type: 'reset-password' };

    if (path === '/login' || path === '/staff/login' || path === '/staff') {
      if (currentUser) {
        if (currentUser.role === 'admin') return { type: 'admin-restaurants' };
        if (currentUser.role === 'staff') return { type: 'staff-dashboard', tab: 'dashboard' };
        if (currentUser.role === 'customer') return { type: 'customer-dashboard' };
      }
      return { type: 'login' };
    }

    if (path === '/customer/dashboard') {
      if (currentUser?.role === 'customer') return { type: 'customer-dashboard' };
      return { type: 'login' };
    }

    if (path === '/staff/service-view') {
      if (currentUser?.role === 'staff' || currentUser?.role === 'admin') {
        return { type: 'service-view' };
      }
      if (currentUser?.role === 'customer') return { type: 'customer-dashboard' };
      return { type: 'login' };
    }

    if (path === '/staff/dashboard' || path.startsWith('/staff/')) {
      if (currentUser?.role === 'staff' || currentUser?.role === 'admin') {
        return { type: 'staff-dashboard', tab: 'dashboard' };
      }
      if (currentUser?.role === 'customer') return { type: 'customer-dashboard' };
      return { type: 'login' };
    }

    if (path === '/admin/restaurants') {
      if (currentUser?.role === 'admin') return { type: 'admin-restaurants' };
      if (currentUser?.role === 'customer') return { type: 'customer-dashboard' };
      return { type: 'login' };
    }

    if (path === '/booking-terms') return { type: 'booking-terms' };
    if (path === '/privacy-policy') return { type: 'privacy-policy' };
    if (path === '/cookie-policy') return { type: 'cookie-policy' };
    if (path === '/cancellation-policy') return { type: 'cancellation-policy' };
    if (path === '/early-access') return { type: 'early-access' };
    if (path === '/restaurant-partners') return { type: 'restaurant-partners' };
    if (path === '/manage-reservation') return { type: 'manage-lookup' };
    if (path === '/restaurants') return { type: 'restaurants-info' };

    if (path === '/search') return { type: 'landing' };
    if (path === '/for-restaurants') return { type: 'for-restaurants' };
    if (path === '/request-trial') return { type: 'request-trial' };

    if (path === '/') {
      if (currentUser?.role === 'admin') return { type: 'admin-restaurants' };
      if (currentUser?.role === 'staff') return { type: 'staff-dashboard', tab: 'dashboard' };
      return { type: 'splash' };
    }

    return { type: 'splash' };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (initialNavigationDone.current) return;
    initialNavigationDone.current = true;

    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      const page: Page = { type: 'reset-password' };
      setCurrentPage(page);
      window.history.replaceState({ page }, '', '/reset-password' + hash);
      return;
    }

    const page = resolveInitialPage(user);
    setCurrentPage(page);
    window.history.replaceState({ page }, '', pageToUrl(page));
  }, [loading, user, resolveInitialPage]);

  useEffect(() => {
    const popStateHandler = (event: PopStateEvent) => {
      const state = event.state as { page?: Page } | null;
      if (state?.page) {
        setCurrentPage(state.page);
        if (
          state.page.type === 'availability' ||
          state.page.type === 'select-time' ||
          state.page.type === 'booking'
        ) {
          const id = (state.page as { restaurantId: string }).restaurantId;
          getRestaurant(id).then(r => {
            if (r) setRestaurant(r);
          }).catch(() => {});
        }
      } else {
        const page = resolveInitialPage(userRef.current);
        setCurrentPage(page);
      }
    };

    window.addEventListener('popstate', popStateHandler);
    return () => window.removeEventListener('popstate', popStateHandler);
  }, [resolveInitialPage]);

  const handleSearch = async (date: string, time: string, partySize: number, filters: SearchFilters) => {
    const page: Page = {
      type: 'restaurant-selection',
      query: { date, time, party_size: partySize },
      filters,
    };
    setCurrentPage(page);
    navigate(page);
  };

  const handleSelectRestaurant = async (restaurantId: string) => {
    if (currentPage.type !== 'restaurant-selection') return;

    const restaurantData = await getRestaurant(restaurantId);
    setRestaurant(restaurantData);

    let page: Page;
    if (restaurantData?.table_map_enabled === false) {
      page = { type: 'select-time', restaurantId, query: currentPage.query };
    } else {
      page = { type: 'availability', restaurantId, query: currentPage.query };
    }

    setCurrentPage(page);
    navigate(page);
  };

  const handleSelectTable = async (table: TableAvailability, useAlternative: boolean) => {
    if (currentPage.type !== 'availability') return;

    // Use the live query from the page's local state if available
    const query = liveQueryRef.current ?? currentPage.query;

    const page: Page = {
      type: 'booking',
      restaurantId: currentPage.restaurantId,
      table,
      query,
      useAlternative,
    };
    setCurrentPage(page);
    navigate(page);
  };

  const handleSelectTime = async (time: string, tableId: string) => {
    if (currentPage.type !== 'select-time') return;

    const liveQuery = liveQueryRef.current ?? currentPage.query;
    const sessionKey = getOrCreateSessionKey();
    const availability = await getAvailability(
      currentPage.restaurantId,
      liveQuery.date,
      time,
      liveQuery.party_size,
      sessionKey
    );

    const selectedTable = availability.find(t => t.id === tableId && t.status === 'green');
    const tableToBook = selectedTable || availability.find(t => t.status === 'green');
    if (!tableToBook) return;

    const page: Page = {
      type: 'booking',
      restaurantId: currentPage.restaurantId,
      table: tableToBook,
      query: { ...liveQuery, time },
      useAlternative: false,
    };
    liveQueryRef.current = null;
    setCurrentPage(page);
    navigate(page);
  };

  const handleBookingSuccess = (token: string, emailSent?: boolean, emailError?: string, customerEmail?: string, reservationCode?: string, awaitingAcceptance?: boolean) => {
    const page: Page = { type: 'confirmation', token, emailSent, emailError, customerEmail, reservationCode, awaitingAcceptance };
    setCurrentPage(page);
    navigate(page);
  };

  const handleNewBooking = () => {
    setRestaurant(null);
    liveQueryRef.current = null;
    goTo({ type: 'landing' });
  };

  const handleBackToAvailability = () => {
    if (currentPage.type !== 'booking') return;
    let page: Page;
    if (restaurant?.table_map_enabled === false) {
      page = { type: 'select-time', restaurantId: currentPage.restaurantId, query: currentPage.query };
    } else {
      page = { type: 'availability', restaurantId: currentPage.restaurantId, query: currentPage.query };
    }
    setCurrentPage(page);
    navigate(page);
  };

  const handleStaffLogin = () => {
    if (user?.role === 'admin') {
      goTo({ type: 'admin-restaurants' });
    } else if (user?.role === 'staff') {
      goTo({ type: 'staff-dashboard', tab: 'dashboard' });
    } else if (user?.role === 'customer') {
      goTo({ type: 'customer-dashboard' });
    }
  };

  const handleStaffLogout = async () => {
    await logout();
    goTo({ type: 'landing' });
  };

  const handleCustomerLogout = async () => {
    await logout();
    goTo({ type: 'landing' });
  };

  const handleCustomerMakeReservation = () => {
    setRestaurant(null);
    goTo({ type: 'landing' });
  };

  const handleStaffNavigate = (tab: 'dashboard' | 'messages' | 'customers' | 'tables' | 'walk_ins' | 'preorders' | 'profile' | 'booking_rules' | 'analytics' | 'epos' | 'website_integration') => {
    const page: Page = { type: 'staff-dashboard', tab };
    setCurrentPage(page);
    navigate(page);
  };

  const handleSearchUpdate = (date: string, time: string, partySize: number) => {
    if (currentPage.type !== 'restaurant-selection') return;
    const page: Page = {
      type: 'restaurant-selection',
      query: { date, time, party_size: partySize },
      filters: currentPage.filters,
    };
    setCurrentPage(page);
    navigate(page, true);
  };

  const handleGoToDinerSearch = () => {
    goTo({ type: 'landing' });
  };

  const handleGoToStaffLogin = () => {
    if (user) {
      if (user.role === 'admin') goTo({ type: 'admin-restaurants' });
      else if (user.role === 'staff') goTo({ type: 'staff-dashboard', tab: 'dashboard' });
      else if (user.role === 'customer') goTo({ type: 'customer-dashboard' });
    } else {
      goTo({ type: 'login' });
    }
  };

  const handleGoToManageReservation = () => {
    goTo({ type: 'manage-lookup' });
  };

  const handleReservationFound = (token: string) => {
    goTo({ type: 'manage', token });
  };

  const handleBackToRestaurantSelection = () => {
    if (currentPage.type !== 'availability' && currentPage.type !== 'select-time') return;
    const query = liveQueryRef.current ?? currentPage.query;
    const page: Page = {
      type: 'restaurant-selection',
      query,
      filters: {},
    };
    liveQueryRef.current = null;
    setCurrentPage(page);
    navigate(page);
  };

  /** Called when AvailabilityPage or SelectTimePage updates booking params in-place */
  const handleRestaurantQueryChange = useCallback((newQuery: AvailabilityQuery) => {
    liveQueryRef.current = newQuery;
    // Shallow replace the URL so the address bar stays in sync without pushing history
    if (currentPage.type === 'availability' || currentPage.type === 'select-time') {
      const restaurantId = currentPage.restaurantId;
      const params = new URLSearchParams({
        date: newQuery.date,
        time: newQuery.time,
        party: newQuery.party_size.toString(),
      });
      window.history.replaceState(
        { page: { ...currentPage, query: newQuery } },
        '',
        `/restaurant/${restaurantId}?${params.toString()}`
      );
    }
  }, [currentPage]);

  const getTransitionKey = () => {
    if (currentPage.type === 'staff-dashboard') {
      return `${currentPage.type}-${currentPage.tab}`;
    }
    return currentPage.type;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-bg">
        <div className="w-10 h-10 border-4 border-app-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const renderPage = () => { switch (currentPage.type) {
    case 'splash':
      return (
        <SplashPage
          onDiner={handleGoToDinerSearch}
          onRestaurant={handleGoToStaffLogin}
        />
      );

    case 'landing':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <LandingPage
            onSearch={handleSearch}
            onStaffLogin={handleGoToStaffLogin}
            onManageReservation={handleGoToManageReservation}
            onForRestaurants={() => goTo({ type: 'for-restaurants' })}
            user={user}
            onCustomerDashboard={() => goTo({ type: 'customer-dashboard' })}
          />
        </PageTransition>
      );

    case 'restaurant-selection':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <RestaurantSelectionPage
            date={currentPage.query.date}
            time={currentPage.query.time}
            partySize={currentPage.query.party_size}
            filters={currentPage.filters}
            onSelectRestaurant={handleSelectRestaurant}
            onBack={handleNewBooking}
            onStaffLogin={handleGoToStaffLogin}
            onDateChange={(date) => handleSearchUpdate(date, currentPage.query.time, currentPage.query.party_size)}
            onTimeChange={(time) => handleSearchUpdate(currentPage.query.date, time, currentPage.query.party_size)}
            onPartySizeChange={(size) => handleSearchUpdate(currentPage.query.date, currentPage.query.time, size)}
          />
        </PageTransition>
      );

    case 'availability':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <FloorplanErrorBoundary>
            <AvailabilityPage
              restaurantId={currentPage.restaurantId}
              query={currentPage.query}
              onBack={handleBackToRestaurantSelection}
              onSelectTable={handleSelectTable}
              onStaffLogin={handleGoToStaffLogin}
              onManageReservation={handleGoToManageReservation}
              onQueryChange={handleRestaurantQueryChange}
            />
          </FloorplanErrorBoundary>
        </PageTransition>
      );

    case 'select-time':
      if (!restaurant) {
        // Lazy-load restaurant for direct URL access
        getRestaurant(currentPage.restaurantId).then(r => {
          if (r) setRestaurant(r);
        }).catch(() => {});
        return (
          <div className="min-h-screen flex items-center justify-center bg-app-bg">
            <div className="w-10 h-10 border-4 border-app-accent border-t-transparent rounded-full animate-spin" />
          </div>
        );
      }
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <SelectTimePage
            restaurant={restaurant}
            query={currentPage.query}
            onBack={handleBackToRestaurantSelection}
            onSelectTime={handleSelectTime}
            onStaffLogin={handleGoToStaffLogin}
            onManageReservation={handleGoToManageReservation}
            onQueryChange={handleRestaurantQueryChange}
          />
        </PageTransition>
      );

    case 'booking':
      if (!restaurant) {
        return null;
      }
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <BookingPage
            restaurant={restaurant}
            table={currentPage.table}
            date={currentPage.query.date}
            time={currentPage.query.time}
            partySize={currentPage.query.party_size}
            useAlternativeTime={currentPage.useAlternative}
            onBack={handleBackToAvailability}
            onSuccess={handleBookingSuccess}
            onStaffLogin={handleGoToStaffLogin}
            onManageReservation={handleGoToManageReservation}
            onOpenBookingTerms={() => {
              const bookingPage = currentPage as Extract<Page, { type: 'booking' }>;
              goTo({
                type: 'booking-terms',
                source: 'booking-flow',
                preserveHold: true,
                returnToPage: bookingPage,
              });
            }}
            onOpenPrivacyPolicy={() => {
              const bookingPage = currentPage as Extract<Page, { type: 'booking' }>;
              goTo({
                type: 'privacy-policy',
                source: 'booking-flow',
                preserveHold: true,
                returnToPage: bookingPage,
              });
            }}
            onOpenCookiePolicy={() => {
              const bookingPage = currentPage as Extract<Page, { type: 'booking' }>;
              goTo({
                type: 'cookie-policy',
                source: 'booking-flow',
                preserveHold: true,
                returnToPage: bookingPage,
              });
            }}
            onOpenCancellationPolicy={() => {
              const bookingPage = currentPage as Extract<Page, { type: 'booking' }>;
              goTo({
                type: 'cancellation-policy',
                source: 'booking-flow',
                preserveHold: true,
                returnToPage: bookingPage,
              });
            }}
          />
        </PageTransition>
      );

    case 'confirmation':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <ConfirmationPage
            token={currentPage.token}
            reservationCode={currentPage.reservationCode}
            emailSent={currentPage.emailSent}
            emailError={currentPage.emailError}
            customerEmail={currentPage.customerEmail}
            depositOutcome={currentPage.depositOutcome}
            awaitingAcceptance={currentPage.awaitingAcceptance}
            onNewBooking={handleNewBooking}
            onStaffLogin={handleGoToStaffLogin}
            onManageReservation={handleGoToManageReservation}
            onOpenChat={() => goTo({ type: 'customer-chat', token: currentPage.token })}
          />
        </PageTransition>
      );

    case 'manage':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <ManageReservationPage
            token={currentPage.token}
            onNewBooking={handleNewBooking}
            onStaffLogin={handleGoToStaffLogin}
            onManageLookup={handleGoToManageReservation}
            onOpenChat={() => goTo({ type: 'customer-chat', token: currentPage.token })}
            preLaunchMode={false}
          />
        </PageTransition>
      );

    case 'reconfirm':
      return (
        <ReconfirmPage
          action={currentPage.action}
          token={currentPage.token}
          onManageBooking={(manageToken) => goTo({ type: 'manage', token: manageToken })}
        />
      );

    case 'manage-lookup':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <ManageReservationLookupPage
            onReservationFound={handleReservationFound}
            onBack={handleNewBooking}
            onStaffLogin={handleGoToStaffLogin}
            preLaunchMode={false}
          />
        </PageTransition>
      );

    case 'login':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <LoginPage
            onSuccess={handleStaffLogin}
            onBack={handleNewBooking}
            onStaffLogin={handleGoToStaffLogin}
            onForgotPassword={() => goTo({ type: 'forgot-password' })}
            onSignUp={() => goTo({ type: 'signup' })}
          />
        </PageTransition>
      );

    case 'signup':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <SignUpPage
            onSuccess={() => goTo({ type: 'customer-dashboard' })}
            onLogin={() => goTo({ type: 'login' })}
            onBack={handleNewBooking}
          />
        </PageTransition>
      );

    case 'forgot-password':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <ForgotPasswordPage
            onBack={() => goTo({ type: 'login' })}
            onStaffLogin={handleGoToStaffLogin}
          />
        </PageTransition>
      );

    case 'reset-password':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <ResetPasswordPage
            onSuccess={() => goTo({ type: 'login' })}
            onStaffLogin={handleGoToStaffLogin}
          />
        </PageTransition>
      );

    case 'customer-dashboard':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <ProtectedRoute onLoginRequired={() => setCurrentPage({ type: 'login' })}>
            <CustomerDashboard
              onMakeReservation={handleCustomerMakeReservation}
              onLogout={handleCustomerLogout}
            />
          </ProtectedRoute>
        </PageTransition>
      );

    case 'staff-dashboard':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <ProtectedRoute onLoginRequired={() => setCurrentPage({ type: 'login' })}>
            {user?.role === 'admin' ? (
              <RestaurantsAdminPage onLogout={handleStaffLogout} />
            ) : currentPage.tab === 'dashboard' ? (
              <StaffDashboard
                activeTab={currentPage.tab}
                onNavigate={handleStaffNavigate}
                onLogout={handleStaffLogout}
              />
            ) : currentPage.tab === 'messages' ? (
              <MessagesPage
                activeTab={currentPage.tab}
                onNavigate={handleStaffNavigate}
                onLogout={handleStaffLogout}
              />
            ) : currentPage.tab === 'customers' ? (
              <CustomerDataPage
                activeTab={currentPage.tab}
                onNavigate={handleStaffNavigate}
                onLogout={handleStaffLogout}
              />
            ) : currentPage.tab === 'tables' ? (
              <TableEditorV2Wrapper
                activeTab={currentPage.tab}
                onNavigate={handleStaffNavigate}
                onLogout={handleStaffLogout}
              />
            ) : currentPage.tab === 'preorders' ? (
              <PreordersManagement
                activeTab={currentPage.tab}
                onNavigate={handleStaffNavigate}
                onLogout={handleStaffLogout}
              />
            ) : currentPage.tab === 'profile' ? (
              <RestaurantProfilePage
                activeTab={currentPage.tab}
                onNavigate={handleStaffNavigate}
                onLogout={handleStaffLogout}
              />
            ) : currentPage.tab === 'booking_rules' ? (
              <BookingRulesPage
                activeTab={currentPage.tab}
                onNavigate={handleStaffNavigate}
                onLogout={handleStaffLogout}
              />
            ) : currentPage.tab === 'analytics' ? (
              <AnalyticsPage
                activeTab={currentPage.tab}
                onNavigate={handleStaffNavigate}
                onLogout={handleStaffLogout}
              />
            ) : currentPage.tab === 'epos' ? (
              <EposIntegrationPage
                activeTab={currentPage.tab}
                onNavigate={handleStaffNavigate}
                onLogout={handleStaffLogout}
              />
            ) : currentPage.tab === 'website_integration' ? (
              <WebsiteIntegrationPage
                activeTab={currentPage.tab}
                onNavigate={handleStaffNavigate}
                onLogout={handleStaffLogout}
              />
            ) : (
              <WalkInPhoneBookingWrapper
                activeTab={currentPage.tab}
                onNavigate={handleStaffNavigate}
                onLogout={handleStaffLogout}
              />
            )}
          </ProtectedRoute>
        </PageTransition>
      );

    case 'service-view':
      return (
        <ProtectedRoute onLoginRequired={() => setCurrentPage({ type: 'login' })}>
          <ServiceViewPage />
        </ProtectedRoute>
      );

    case 'email-logs':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <ProtectedRoute onLoginRequired={() => setCurrentPage({ type: 'login' })}>
            <EmailLogsPage />
          </ProtectedRoute>
        </PageTransition>
      );

    case 'admin-restaurants':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <ProtectedRoute onLoginRequired={() => setCurrentPage({ type: 'login' })}>
            <RestaurantsAdminPage onLogout={handleStaffLogout} />
          </ProtectedRoute>
        </PageTransition>
      );

    case 'restaurants-info':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <RestaurantsInfoPage onBack={handleNewBooking} />
        </PageTransition>
      );

    case 'customer-chat':
      // No PageTransition wrapper — PageTransition applies CSS transform which
      // breaks position:fixed containment and collapses the chat layout.
      return (
        <CustomerChatPage
          token={currentPage.token}
          onBack={() => goTo({ type: 'manage', token: currentPage.token })}
        />
      );

    case 'booking-terms':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <BookingTermsPage
            onStaffLogin={handleGoToStaffLogin}
            source={currentPage.source}
            preserveHold={currentPage.preserveHold}
            preLaunchMode={false}
            onBack={() => {
              if (currentPage.returnToPage) {
                goTo(currentPage.returnToPage);
              } else {
                goTo({ type: 'landing' });
              }
            }}
          />
        </PageTransition>
      );

    case 'privacy-policy':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <PrivacyPolicyPage
            onStaffLogin={handleGoToStaffLogin}
            source={currentPage.source}
            preserveHold={currentPage.preserveHold}
            preLaunchMode={false}
            onBack={() => {
              if (currentPage.returnToPage) {
                goTo(currentPage.returnToPage);
              } else {
                goTo({ type: 'landing' });
              }
            }}
          />
        </PageTransition>
      );

    case 'cookie-policy':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <CookiePolicyPage
            onStaffLogin={handleGoToStaffLogin}
            source={currentPage.source}
            preserveHold={currentPage.preserveHold}
            preLaunchMode={false}
            onBack={() => {
              if (currentPage.returnToPage) {
                goTo(currentPage.returnToPage);
              } else {
                goTo({ type: 'landing' });
              }
            }}
          />
        </PageTransition>
      );

    case 'cancellation-policy':
      return (
        <PageTransition transitionKey={getTransitionKey()}>
          <CancellationPolicyPage
            onStaffLogin={handleGoToStaffLogin}
            source={currentPage.source}
            preserveHold={currentPage.preserveHold}
            preLaunchMode={false}
            onBack={() => {
              if (currentPage.returnToPage) {
                goTo(currentPage.returnToPage);
              } else {
                goTo({ type: 'landing' });
              }
            }}
          />
        </PageTransition>
      );

    case 'pre-launch-splash':
      return (
        <PreLaunchSplashPage
          onStaffLogin={handleGoToStaffLogin}
          onManageReservation={handleGoToManageReservation}
        />
      );

    case 'for-restaurants':
      return (
        <ForRestaurantsPage
          onSignIn={handleGoToStaffLogin}
          onRequestTrial={() => goTo({ type: 'request-trial' })}
          onBack={() => goTo({ type: 'splash' })}
        />
      );

    case 'request-trial':
      return (
        <RequestTrialPage
          onBack={() => goTo({ type: 'for-restaurants' })}
          onPrivacyPolicy={() => goTo({ type: 'privacy-policy', source: 'home', returnToPage: { type: 'request-trial' } })}
        />
      );

    case 'early-access':
      return <EarlyAccessPage onBack={() => goTo({ type: 'splash' })} />;

    case 'restaurant-partners':
      return <RestaurantPartnersPage onBack={() => goTo({ type: 'splash' })} />;

    default:
      return <SplashPage onDiner={handleGoToDinerSearch} onRestaurant={handleGoToStaffLogin} />;
  } };

  return (
    <>
      {renderPage()}
      <DevBanner />
    </>
  );
}

function AppRoot() {
  const embedMatch = window.location.pathname.match(/^\/embed\/([a-z0-9-]+)$/);
  if (embedMatch) {
    return <EmbedBookingWidget slug={embedMatch[1]} />;
  }
  return <App />;
}

export default AppRoot;
