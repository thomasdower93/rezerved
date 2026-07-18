import { useState, useEffect, useCallback } from 'react';

export interface DashboardLayout {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** True on any touch-capable device */
  isTouchDevice: boolean;
  /** True when running as an installed PWA / Android TWA */
  isStandaloneApp: boolean;
  /** True when the device is in landscape orientation */
  isLandscape: boolean;
  /** Raw viewport width in px */
  width: number;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if ((navigator as any).standalone === true) return true;
  return false;
}

function detectTouch(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function computeBreakpoints(w: number): Pick<DashboardLayout, 'isMobile' | 'isTablet' | 'isDesktop'> {
  return {
    isMobile:  w < 768,
    isTablet:  w >= 768 && w < 1024,
    isDesktop: w >= 1024,
  };
}

export function useDashboardLayout(): DashboardLayout {
  const getWidth = () =>
    typeof window !== 'undefined' ? window.innerWidth : 1280;
  const getLandscape = () =>
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : true;

  const [width, setWidth] = useState(getWidth);
  const [isLandscape, setIsLandscape] = useState(getLandscape);
  const [isStandaloneApp, setIsStandaloneApp] = useState(false);
  const [isTouchDevice] = useState(detectTouch);

  // Debounced resize handler — only fires after 100 ms of silence
  const handleResize = useCallback(() => {
    setWidth(window.innerWidth);
    setIsLandscape(window.innerWidth > window.innerHeight);
  }, []);

  useEffect(() => {
    setIsStandaloneApp(detectStandalone());

    // Listen for standalone mode changes (e.g. user installs mid-session)
    const mq = window.matchMedia('(display-mode: standalone)');
    const onMqChange = (e: MediaQueryListEvent) => setIsStandaloneApp(e.matches);
    mq.addEventListener('change', onMqChange);

    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(handleResize, 80);
    };
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      mq.removeEventListener('change', onMqChange);
    };
  }, [handleResize]);

  return {
    width,
    isLandscape,
    isTouchDevice,
    isStandaloneApp,
    ...computeBreakpoints(width),
  };
}
