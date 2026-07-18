import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // IMPORTANT: Customer-facing pages always use dark theme
  // Only staff dashboard pages should have light mode capability
  const [theme, setTheme] = useState<Theme>(() => {
    // Always default to dark for customer pages
    return 'dark';
  });

  useEffect(() => {
    // Customer pages always have dark mode
    document.documentElement.classList.add('dark');
  }, [theme]);

  const toggleTheme = () => {
    // Theme toggle disabled for customers - they always see dark mode
    // Staff pages can override this if needed
    return;
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
