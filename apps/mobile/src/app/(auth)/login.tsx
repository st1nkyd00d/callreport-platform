import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { homeRouteForRole } from '@/lib/session';

export default function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const session = await login(email.trim(), password);
      router.replace(homeRouteForRole(session.user.role));
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : 'No se pudo conectar con el servidor. Intentá de nuevo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="title">Iniciar sesión</ThemedText>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Correo electrónico"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Contraseña"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            textContentType="password"
            style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
            onSubmitEditing={handleSubmit}
          />

          {error && (
            <ThemedText type="small" themeColor="text" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[styles.button, { opacity: canSubmit ? 1 : 0.5 }]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText type="smallBold" style={styles.buttonText}>
                Entrar
              </ThemedText>
            )}
          </Pressable>
        </SafeAreaView>
      </KeyboardAvoidingView>
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
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
    fontSize: 16,
  },
  error: {
    color: '#E5484D',
  },
  button: {
    backgroundColor: '#3c87f7',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
  },
});
