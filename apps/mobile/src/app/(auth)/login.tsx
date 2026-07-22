import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

// Placeholder de la Fase 1. La Fase 2 agrega el formulario real
// (POST /auth/login, tokens en expo-secure-store, redirección por rol).
export default function LoginScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Iniciar sesión</ThemedText>
        <ThemedText type="small">Pantalla placeholder — Fase 2 agrega el formulario real.</ThemedText>
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
