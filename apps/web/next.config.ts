import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@ledgerloop/shared-types', '@ledgerloop/validation'],
};

export default config;
