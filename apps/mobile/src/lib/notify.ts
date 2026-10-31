import { Alert, Platform } from 'react-native';

/** Alert.alert is a no-op in React Native Web, so the browser build uses window.alert. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') globalThis.alert?.(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}
