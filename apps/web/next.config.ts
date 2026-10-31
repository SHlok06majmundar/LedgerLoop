import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

export default function config(phase: string): NextConfig {
  return {
    reactStrictMode: true,
    poweredByHeader: false,
    transpilePackages: ['@ledgerloop/shared-types', '@ledgerloop/validation'],
    // The dev server gets its own folder so `next build` can run while `next dev` is open.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  };
}
