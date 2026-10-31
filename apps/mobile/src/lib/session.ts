import * as SecureStore from 'expo-secure-store';
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
    await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
    set({ accessToken, user });
  },
  setOrganization: async (organizationId) => {
    if (organizationId) await SecureStore.setItemAsync(ORG_KEY, organizationId);
    else await SecureStore.deleteItemAsync(ORG_KEY);
    set({ organizationId });
  },
  clear: async () => {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    set({ accessToken: null, user: null });
  },
  markReady: () => set({ ready: true }),
}));

export const readRefreshToken = () => SecureStore.getItemAsync(REFRESH_KEY);
export const readOrganizationId = () => SecureStore.getItemAsync(ORG_KEY);
