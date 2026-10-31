'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { API_URL } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { AppNotification } from '@/lib/types';

/** Live notifications and import progress over Socket.io; falls back silently to polling. */
export function useRealtime() {
  const accessToken = useSession((s) => s.accessToken);
  const organizationId = useSession((s) => s.organizationId);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accessToken) return;
    const socket = io(`${API_URL}/realtime`, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });
    socket.on('connect', () => {
      if (organizationId) socket.emit('join-organization', organizationId);
    });
    socket.on('notification', (n: AppNotification) => {
      toast(n.title, { description: n.body });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    socket.on('import.progress', () => {
      void queryClient.invalidateQueries({ queryKey: [organizationId, 'imports'] });
      void queryClient.invalidateQueries({ queryKey: [organizationId, 'bank-transactions'] });
    });
    return () => {
      socket.disconnect();
    };
  }, [accessToken, organizationId, queryClient]);
}
