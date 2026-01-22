import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ChiroFlow brand colors
export const BRAND_COLORS = {
  primary: '#053e67',
  accent: '#c90000',
  primaryLight: '#0a5a94',
  primaryDark: '#032a47',
  accentLight: '#ff1a1a',
  accentDark: '#990000',
} as const;

// Theme types
type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeColors {
  // Brand
  primary: string;
  accent: string;

  // Backgrounds
  background: string;
  surface: string;
  card: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;

  // Borders
  border: string;
  borderLight: string;

  // Status
  success: string;
  warning: string;
  error: string;
  info: string;

  // Overlays
  overlay: string;
  shadow: string;
}

interface Theme {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
}

interface ThemeContextValue extends Theme {
  setMode: (mode: ThemeMode) => Promise<void>;
}

// Light theme colors
const lightColors: ThemeColors = {
  primary: BRAND_COLORS.primary,
  accent: BRAND_COLORS.accent,

  background: '#f8fafc',
  surface: '#ffffff',
  card: '#ffffff',

  text: '#1e293b',
  textSecondary: '#475569',
  textMuted: '#94a3b8',

  border: '#e2e8f0',
  borderLight: '#f1f5f9',

  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  overlay: 'rgba(0, 0, 0, 0.5)',
  shadow: 'rgba(0, 0, 0, 0.1)',
};

// Dark theme colors
const darkColors: ThemeColors = {
  primary: BRAND_COLORS.primaryLight,
  accent: BRAND_COLORS.accentLight,

  background: '#0f172a',
  surface: '#1e293b',
  card: '#1e293b',

  text: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#64748b',

  border: '#334155',
  borderLight: '#1e293b',

  success: '#4ade80',
  warning: '#fbbf24',
  error: '#f87171',
  info: '#60a5fa',

  overlay: 'rgba(0, 0, 0, 0.7)',
  shadow: 'rgba(0, 0, 0, 0.3)',
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_KEY = 'chiroflow_theme_mode';

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Load saved theme preference
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedMode = await AsyncStorage.getItem(THEME_KEY);
        if (savedMode && ['light', 'dark', 'system'].includes(savedMode)) {
          setModeState(savedMode as ThemeMode);
        }
      } catch (error) {
        console.error('Failed to load theme preference:', error);
      }
    };

    loadTheme();
  }, []);

  // Determine if dark mode
  const isDark =
    mode === 'dark' ||
    (mode === 'system' && systemColorScheme === 'dark');

  // Get current colors
  const colors = isDark ? darkColors : lightColors;

  // Set theme mode
  const setMode = useCallback(async (newMode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_KEY, newMode);
      setModeState(newMode);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  }, []);

  const theme: Theme = {
    colors,
    isDark,
    mode,
  };

  const value: ThemeContextValue = {
    ...theme,
    setMode,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Hook for styled components
export function useThemeStyles<T>(
  stylesFactory: (theme: Theme) => T
): T {
  const theme = useTheme();
  return stylesFactory(theme);
}
