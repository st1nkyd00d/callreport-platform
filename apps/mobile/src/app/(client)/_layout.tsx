import { Stack } from 'expo-router/stack';

import { RealtimeProvider } from '@/lib/realtime';

// Fase 5 (plan.md): reemplaza el placeholder de la Fase 1. Stack (no
// Tabs todavía -- se convierte en Fase 6 cuando exista la segunda
// pestaña "Seguimientos") envolviendo RealtimeProvider, mismo criterio
// que (agent)/_layout.tsx hostea el auto-flush de la cola offline.
export default function ClientLayout() {
  return (
    <RealtimeProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </RealtimeProvider>
  );
}
