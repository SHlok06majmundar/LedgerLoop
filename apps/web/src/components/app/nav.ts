import { Permission } from '@ledgerloop/shared-types';
import {
  BarChart3,
  BellRing,
  FileText,
  GitCompareArrows,
  LayoutDashboard,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';

export const APP_NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: Permission.ANALYTICS_READ },
  { href: '/customers', label: 'Customers', icon: Users, permission: Permission.CUSTOMERS_READ },
  { href: '/invoices', label: 'Invoices', icon: FileText, permission: Permission.INVOICES_READ },
  { href: '/payments', label: 'Payments', icon: Wallet, permission: Permission.PAYMENTS_READ },
  {
    href: '/reconciliation',
    label: 'Reconciliation',
    icon: GitCompareArrows,
    permission: Permission.RECONCILIATION_READ,
  },
  { href: '/collections', label: 'Collections', icon: BellRing, permission: Permission.INVOICES_READ },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, permission: Permission.ANALYTICS_READ },
  { href: '/settings', label: 'Settings', icon: Settings, permission: null },
] as const;
