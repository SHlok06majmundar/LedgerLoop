import { create } from 'zustand';

interface ConnectionState {
  /** True while any request has been waiting long enough to tell the user. */
  slow: boolean;
}

/**
 * Tracks slow requests app-wide. The hosted API sleeps after a quiet spell and
 * takes up to a minute to wake, so a long wait gets an explanation, not a spinner.
 */
export const useConnection = create<ConnectionState>(() => ({ slow: false }));

let slowRequests = 0;

export function markSlow(): void {
  slowRequests += 1;
  useConnection.setState({ slow: true });
}

export function unmarkSlow(): void {
  slowRequests = Math.max(0, slowRequests - 1);
  if (slowRequests === 0) useConnection.setState({ slow: false });
}
