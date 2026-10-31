import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json. Release Android builds block plain-http requests, so
 * cleartext traffic is allowed only when the API address is plain http
 * (a local or LAN server used for testing). Production builds use https.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  const plainHttp = apiUrl.startsWith('http://');
  return {
    ...(config as ExpoConfig),
    plugins: [
      ...(config.plugins ?? []),
      ['expo-build-properties', { android: { usesCleartextTraffic: plainHttp } }],
    ],
  };
};
