import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useRetryQueue } from '@/lib/agent-queries';

// Reintenta la cola offline (report-queue.ts) al entrar a la sección del
// agente y cada vez que la app vuelve a primer plano -- plan.md Fase 4:
// "al recuperar conexión, el reintento lo envía y sale de la cola". Sin
// NetInfo instalado (decisión tomada al planificar la fase): AppState es
// la señal de "puede que haya vuelto la conexión" que ya tenemos gratis.
function useQueueAutoFlush() {
  const retryQueue = useRetryQueue();

  useEffect(() => {
    retryQueue.mutate();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') retryQueue.mutate();
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Fase 4 (plan.md): reemplaza el placeholder de la Fase 1 (home.tsx) por
// el flujo real del agente. seleccionar-campana y editar-reporte/[id]
// viven en este mismo grupo (comparten el AuthProvider/QueryClientProvider
// del layout raíz) pero no son tabs -- href: null las oculta de la barra
// sin sacarlas de la navegación (router.push sigue funcionando).
export default function AgentTabsLayout() {
  const theme = useTheme();
  useQueueAutoFlush();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
      }}
    >
      <Tabs.Screen name="nuevo-reporte" options={{ title: 'Reportar' }} />
      <Tabs.Screen name="mis-reportes" options={{ title: 'Mis reportes' }} />
      <Tabs.Screen name="turno" options={{ title: 'Turno' }} />
      <Tabs.Screen name="seleccionar-campana" options={{ href: null }} />
      <Tabs.Screen name="editar-reporte/[id]" options={{ href: null }} />
    </Tabs>
  );
}
