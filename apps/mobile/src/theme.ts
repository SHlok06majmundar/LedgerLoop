import { useColorScheme } from 'react-native';

const light = {
  background: '#f6f7f9',
  card: '#ffffff',
  text: '#1b1f27',
  muted: '#6b7280',
  border: '#e5e7eb',
  input: '#d7dbe1',
  primary: '#0f766e',
  primaryText: '#ffffff',
  primarySoft: '#e3f4f2',
  success: '#15803d',
  successSoft: '#e6f6ec',
  warning: '#b45309',
  warningSoft: '#fdf3e2',
  danger: '#c2410c',
  dangerSoft: '#fdece6',
  info: '#2563eb',
  infoSoft: '#e7effd',
  skeletonHighlight: 'rgba(255,255,255,0.75)',
};

const dark: typeof light = {
  background: '#111418',
  card: '#1b1f26',
  text: '#eef0f3',
  muted: '#9aa1ad',
  border: '#2b313b',
  input: '#363d48',
  primary: '#2dd4bf',
  primaryText: '#0b2422',
  primarySoft: '#16312f',
  success: '#4ade80',
  successSoft: '#14291c',
  warning: '#fbbf24',
  warningSoft: '#2d2412',
  danger: '#fb923c',
  dangerSoft: '#30180f',
  info: '#60a5fa',
  infoSoft: '#132036',
  skeletonHighlight: 'rgba(255,255,255,0.08)',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

const TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'muted'> = {
  PAID: 'success',
  POSTED: 'success',
  MATCHED: 'success',
  SENT: 'success',
  PARTIALLY_PAID: 'warning',
  PARTIALLY_MATCHED: 'warning',
  UNMATCHED: 'warning',
  OVERDUE: 'danger',
  DISCREPANCY: 'danger',
  FAILED: 'danger',
  ISSUED: 'info',
  SUGGESTED: 'info',
  SCHEDULED: 'info',
};

export function statusColors(theme: Theme, status: string) {
  const tone = TONES[status] ?? 'muted';
  if (tone === 'muted') return { fg: theme.muted, bg: theme.border };
  return { fg: theme[tone], bg: theme[`${tone}Soft`] };
}
