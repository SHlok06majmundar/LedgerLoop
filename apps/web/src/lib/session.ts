'use client';

import { create } from 'zustand';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  isSuperAdmin: boolean;
}

interface SessionState {
  /** Kept in memory only; the refresh cookie restores it after a reload. */
  accessToken: string | null;
  user: SessionUser | null;
  organizationId: string | null;
  setAuth: (accessToken: string, user: SessionUser) => void;
  setUser: (user: SessionUser) => void;
  setOrganization: (organizationId: string | null) => void;
  clear: () => void;
}

const ORG_KEY = 'll.organizationId';

const storedOrg = () => {
  try {
    return typeof window === 'undefined' ? null : localStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
};

export const useSession = create<SessionState>((set) => ({
  accessToken: null,
  user: null,
  organizationId: storedOrg(),
  setAuth: (accessToken, user) => set({ accessToken, user }),
  setUser: (user) => set({ user }),
  setOrganization: (organizationId) => {
    try {
      if (organizationId) localStorage.setItem(ORG_KEY, organizationId);
      else localStorage.removeItem(ORG_KEY);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this tab only.
    }
    set({ organizationId });
  },
  clear: () => set({ accessToken: null, user: null }),
}));
