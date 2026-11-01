import { Alert, Platform } from 'react-native';

/** Alert.alert is a no-op in React Native Web, so the browser build uses window.alert. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') globalThis.alert?.(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

/** Asks before a destructive action; resolves true when the user agrees. */
export function confirm(title: string, message: string, action: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: action, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}
