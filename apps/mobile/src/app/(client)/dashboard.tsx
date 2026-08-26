import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

// Placeholder de la Fase 1. La Fase 5 agrega el dashboard real en
// tiempo real (tarjetas de resumen, lista con socket, filtros). El botón
// de cerrar sesión es de la Fase 2 -- sin él no hay forma manual de
// volver a /login para probar otro rol sin reinstalar la app.
export default function ClientDashboardScreen() {
  const router = useRouter();
  const { session, logout } = useAuth();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Cliente</ThemedText>
        <ThemedText type="small">{session?.user.fullName}</ThemedText>
        <ThemedText type="small">Pantalla placeholder — Fase 5 agrega el dashboard real.</ThemedText>
        <Pressable
          onPress={async () => {
            await logout();
            router.replace('/login');
          }}
        >
          <ThemedText type="link" themeColor="textSecondary">
            Cerrar sesión
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
});
