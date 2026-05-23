import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light';

export interface ThemeColors {
  // Backgrounds
  bgBase: string;
  bgPanel: string;
  bgPanelSecondary: string;
  bgInput: string;
  bgHover: string;
  bgActive: string;
  // Borders
  border: string;
  borderStrong: string;
  // Text
  textPrimary: string;
  textMuted: string;
  textFaint: string;
  // Accent (purple — matches home page)
  accent: string;
  accentHover: string;
  accentFaint: string;
  // Status
  success: string;
  warning: string;
  danger: string;
  // Sidebar
  sidebarBg: string;
  sidebarBorder: string;
}

const DARK: ThemeColors = {
  bgBase: '#0d0b17',
  bgPanel: '#14101f',
  bgPanelSecondary: '#1c1828',
  bgInput: '#0d0b17',
  bgHover: 'rgba(255,255,255,0.05)',
  bgActive: 'rgba(168,85,247,0.12)',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.14)',
  textPrimary: '#f1f5f9',
  textMuted: '#94a3b8',
  textFaint: '#475569',
  accent: '#a855f7',
  accentHover: '#c084fc',
  accentFaint: 'rgba(168,85,247,0.15)',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
  sidebarBg: '#0d0b17',
  sidebarBorder: 'rgba(255,255,255,0.06)',
};

const LIGHT: ThemeColors = {
  bgBase: '#f5f3ff',
  bgPanel: '#ffffff',
  bgPanelSecondary: '#faf8ff',
  bgInput: '#f9f8ff',
  bgHover: 'rgba(0,0,0,0.04)',
  bgActive: 'rgba(124,58,237,0.08)',
  border: '#e9e4f5',
  borderStrong: '#d4cae8',
  textPrimary: '#0f0720',
  textMuted: '#5b4d7a',
  textFaint: '#9d89bb',
  accent: '#7c3aed',
  accentHover: '#6d28d9',
  accentFaint: 'rgba(124,58,237,0.1)',
  success: '#059669',
  warning: '#d97706',
  danger: '#dc2626',
  sidebarBg: '#0f0a1e',
  sidebarBorder: 'rgba(255,255,255,0.06)',
};

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  colors: DARK,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('theme') as ThemeMode) ?? 'dark';
  });

  const colors = mode === 'dark' ? DARK : LIGHT;

  useEffect(() => {
    localStorage.setItem('theme', mode);
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  const toggle = () => setMode(m => (m === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ mode, colors, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
