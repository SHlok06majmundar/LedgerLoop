'use client';

import type { UseFormSetError, FieldValues, Path } from 'react-hook-form';
import { toast } from 'sonner';
import { api, ApiError } from './api';
import { useSession, type SessionUser } from './session';

export interface AuthResponse {
  user: SessionUser;
  accessToken: string;
  expiresIn: number;
}

export interface Membership {
  id: string;
  role: string;
  organization: { id: string; name: string; slug: string; currency: string; timezone: string };
}

/** Stores the session and picks the organization to open; returns where to go next. */
export async function completeSignIn(auth: AuthResponse, next?: string | null): Promise<string> {
  useSession.getState().setAuth(auth.accessToken, auth.user);
  const memberships = await api<Membership[]>('/organizations', { noOrg: true });
  const { organizationId, setOrganization } = useSession.getState();
  if (memberships.length === 0) {
    setOrganization(null);
    return next ?? '/onboarding';
  }
  if (!memberships.some((m) => m.organization.id === organizationId)) {
    setOrganization(memberships[0]!.organization.id);
  }
  return next && next.startsWith('/') ? next : '/dashboard';
}

export async function signOut() {
  try {
    await api('/auth/logout', { method: 'POST', noOrg: true });
  } catch {
    // The session may already be gone; clearing locally is what matters.
  }
  useSession.getState().clear();
}

/** Shows API errors on the matching form fields, or as a toast. */
export function applyApiError<T extends FieldValues>(error: unknown, setError?: UseFormSetError<T>) {
  if (error instanceof ApiError) {
    const fields = Object.entries(error.fieldErrors);
    if (setError && fields.length > 0) {
      for (const [field, message] of fields) setError(field as Path<T>, { message });
      return;
    }
    toast.error(error.message);
    return;
  }
  toast.error('Something went wrong. Please try again.');
}
