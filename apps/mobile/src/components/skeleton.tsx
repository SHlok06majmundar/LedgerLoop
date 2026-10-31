import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';

/** Shared clock so every skeleton on screen shimmers in sync. */
const progress = new Animated.Value(0);
let running = false;
function startShimmer() {
  if (running) return;
  running = true;
  Animated.loop(
    Animated.timing(progress, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
  ).start();
}

/** A placeholder block with a light sweeping across it while content loads. */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 8,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const [boxWidth, setBoxWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    startShimmer();
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted.current && setReduceMotion(v));
    return () => {
      mounted.current = false;
    };
  }, []);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-boxWidth, boxWidth] });

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}
      style={[{ width, height, borderRadius: radius, backgroundColor: t.border, overflow: 'hidden' }, style]}
    >
      {!reduceMotion && boxWidth > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={['transparent', t.skeletonHighlight, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

/** Placeholder rows shaped like the list rows they stand in for. */
export function SkeletonList({ rows = 6 }: { rows?: number }) {
  const t = useTheme();
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar" style={{ paddingHorizontal: 16 }}>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }}
        >
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="70%" height={15} />
            <Skeleton width="45%" height={12} />
          </View>
          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            <Skeleton width={84} height={15} />
            <Skeleton width={56} height={18} radius={9} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Placeholder for a detail screen: title, a figure card and a block of lines. */
export function SkeletonDetail() {
  const t = useTheme();
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar" style={{ padding: 16, gap: 14, flex: 1, backgroundColor: t.background }}>
      <Skeleton width="55%" height={26} />
      <Skeleton width="80%" height={13} />
      <Skeleton height={110} radius={14} />
      <Skeleton height={180} radius={14} />
      <Skeleton height={48} radius={12} />
    </View>
  );
}
