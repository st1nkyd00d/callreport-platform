import { Tabs } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { useFollowupsCount } from '@/lib/client-queries';
import { RealtimeProvider } from '@/lib/realtime';
import { usePushRegistration } from '@/lib/use-push-registration';

// Fase 6 (plan.md): Stack -> Tabs, ahora que existe la segunda pestaña
// "Seguimientos" (con badge de pendientes). RealtimeProvider sigue
// envolviendo todo -- mismo criterio que (agent)/_layout.tsx hostea el
// auto-flush de la cola offline.
export default function ClientLayout() {
  return (
    <RealtimeProvider>
      <ClientTabs />
    </RealtimeProvider>
  );
}

function ClientTabs() {
  const theme = useTheme();
  usePushRegistration();
  const { data: followupsCount } = useFollowupsCount();
  const pending = followupsCount?.pending ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Inicio' }} />
      <Tabs.Screen
        name="seguimientos"
        options={{
          title: 'Seguimientos',
          tabBarBadge: pending > 0 ? pending : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.warning },
        }}
      />
      <Tabs.Screen name="exportar" options={{ title: 'Exportar' }} />
      <Tabs.Screen name="reporte/[id]" options={{ href: null }} />
    </Tabs>
  );
}
