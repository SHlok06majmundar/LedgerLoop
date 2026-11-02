import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ComponentRef, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { humanize } from '@/lib/format';
import { statusColors, useTheme } from '@/theme';
import { SkeletonDetail } from './skeleton';

export type IconName = ComponentProps<typeof Ionicons>['name'];
/** What a ref to one of the text fields below points at (for moving focus). */
export type TextField = ComponentRef<typeof TextInput>;

export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
}) {
  const t = useTheme();
  if (!scroll) {
    return <View style={{ flex: 1, backgroundColor: t.background, padding: 16 }}>{children}</View>;
  }
  // Forms live inside every screen, so every screen scrolls the focused input above the keyboard.
  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: t.background }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      bottomOffset={24}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.primary} /> : undefined}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

export function SafeScreen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>{children}</SafeAreaView>;
}

/** Full-screen centred form (sign in, sign up) that keeps the focused field above the keyboard. */
export function FormScreen({ children }: { children: ReactNode }) {
  return (
    <SafeScreen>
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 }}
        bottomOffset={32}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {children}
      </KeyboardAwareScrollView>
    </SafeScreen>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 14, padding: 16 }, style]}>
      {children}
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.text, fontSize: 22, fontWeight: '700' }}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.muted, fontSize: 13 }}>{children}</Text>;
}

export function Body({ children, bold, color }: { children: ReactNode; bold?: boolean; color?: string }) {
  const t = useTheme();
  return <Text style={{ color: color ?? t.text, fontSize: 15, fontWeight: bold ? '600' : '400' }}>{children}</Text>;
}

export function Amount({ children, size = 15, color }: { children: ReactNode; size?: number; color?: string }) {
  const t = useTheme();
  return (
    <Text style={{ color: color ?? t.text, fontSize: size, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{children}</Text>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.primary : variant === 'danger' ? t.danger : 'transparent';
  const fg = variant === 'outline' ? t.text : t.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: variant === 'outline' ? t.input : bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={{ color: fg, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Input({ label, error, ref, ...props }: TextInputProps & { label: string; error?: string; ref?: Ref<TextField> }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <TextInput
        ref={ref}
        placeholderTextColor={t.muted}
        accessibilityLabel={label}
        style={[styles.input, { color: t.text, borderColor: error ? t.danger : t.input, backgroundColor: t.card }]}
        {...props}
      />
      {error ? <Text style={{ color: t.danger, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}

/** Password field with a button to show or hide what has been typed. */
export function PasswordInput({
  label,
  error,
  ref,
  ...props
}: Omit<TextInputProps, 'secureTextEntry'> & { label: string; error?: string; ref?: Ref<TextField> }) {
  const t = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <View style={[styles.input, styles.passwordBox, { borderColor: error ? t.danger : t.input, backgroundColor: t.card }]}>
        <TextInput
          ref={ref}
          placeholderTextColor={t.muted}
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 12 }}
          {...props}
          secureTextEntry={!visible}
        />
        <Pressable
          onPress={() => setVisible((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          hitSlop={12}
          style={{ paddingLeft: 10 }}
        >
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={22} color={t.muted} />
        </Pressable>
      </View>
      {error ? <Text style={{ color: t.danger, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}

export function StatusPill({ status }: { status: string }) {
  const t = useTheme();
  const c = statusColors(t, status);
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: '600' }}>{humanize(status)}</Text>
    </View>
  );
}

export function Row({
  title,
  subtitle,
  right,
  onPress,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, { borderBottomColor: t.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={18} color={t.muted} />}
    </Pressable>
  );
}

export function Empty({ icon = 'file-tray-outline', title, hint }: { icon?: IconName; title: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
      <Ionicons name={icon} size={32} color={t.primary} />
      <Body bold>{title}</Body>
      {hint ? <Text style={{ color: t.muted, textAlign: 'center' }}>{hint}</Text> : null}
    </View>
  );
}

/** Detail-screen placeholder with a shimmer while data loads. */
export function Loading() {
  return <SkeletonDetail />;
}

export function LogoBadge({ size = 56 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/logo.png')}
      style={{ width: size, height: size, borderRadius: size * 0.23 }}
      accessibilityLabel="LedgerLoop logo"
    />
  );
}

export function Chips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 999,
              backgroundColor: active ? t.primary : t.card,
              borderWidth: 1,
              borderColor: active ? t.primary : t.border,
            }}
          >
            <Text style={{ color: active ? t.primaryText : t.text, fontWeight: '600', fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  passwordBox: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
