import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { IconName } from '@/components/ui';
import { useTheme } from '@/theme';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home-outline' },
  { name: 'invoices', title: 'Invoices', icon: 'document-text-outline' },
  { name: 'customers', title: 'Customers', icon: 'people-outline' },
  { name: 'reconcile', title: 'Reconcile', icon: 'git-compare-outline' },
  { name: 'more', title: 'More', icon: 'ellipsis-horizontal-circle-outline' },
];

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.text,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} color={String(color)} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
