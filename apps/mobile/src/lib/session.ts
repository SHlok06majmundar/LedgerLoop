import { secureStorage } from './storage';
import { create } from 'zustand';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  isSuperAdmin: boolean;
}

const REFRESH_KEY = 'll.refreshToken';
const ORG_KEY = 'll.organizationId';

interface SessionState {
  /** In memory only; the refresh token in secure storage restores it. */
  accessToken: string | null;
  user: SessionUser | null;
  organizationId: string | null;
  ready: boolean;
  setSession: (accessToken: string, user: SessionUser, refreshToken: string) => Promise<void>;
  setOrganization: (organizationId: string | null) => Promise<void>;
  clear: () => Promise<void>;
  markReady: () => void;
}

export const useSession = create<SessionState>((set) => ({
  accessToken: null,
  user: null,
  organizationId: null,
  ready: false,
  setSession: async (accessToken, user, refreshToken) => {
    await secureStorage.set(REFRESH_KEY, refreshToken);
    set({ accessToken, user });
  },
  setOrganization: async (organizationId) => {
    if (organizationId) await secureStorage.set(ORG_KEY, organizationId);
    else await secureStorage.remove(ORG_KEY);
    set({ organizationId });
  },
  clear: async () => {
    await secureStorage.remove(REFRESH_KEY);
    set({ accessToken: null, user: null });
  },
  markReady: () => set({ ready: true }),
}));

export const readRefreshToken = () => secureStorage.get(REFRESH_KEY);
export const readOrganizationId = () => secureStorage.get(ORG_KEY);
