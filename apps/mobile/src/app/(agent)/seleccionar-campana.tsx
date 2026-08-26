import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAgentCampaigns } from '@/lib/agent-queries';
import { saveSelectedCampaignId } from '@/lib/selected-campaign';

// Fase 4 (plan.md): "Selector de campaña: lista de campañas asignadas
// con nombre del cliente; la selección persiste (AsyncStorage) para no
// re-seleccionar en cada reporte."
export default function SeleccionarCampanaScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { data: campaigns, isLoading, isError } = useAgentCampaigns();

  async function select(campaignId: string) {
    await saveSelectedCampaignId(campaignId);
    router.back();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Elegí tu campaña</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Los reportes que crees se asignarán a esta campaña
        </ThemedText>

        {isLoading && <ActivityIndicator style={styles.spinner} />}
        {isError && (
          <ThemedText themeColor="error">No se pudieron cargar tus campañas</ThemedText>
        )}
        {!isLoading && !isError && campaigns?.length === 0 && (
          <ThemedText themeColor="textSecondary">No tenés campañas asignadas.</ThemedText>
        )}

        {campaigns?.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => void select(c.id)}
            style={[styles.card, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
          >
            <ThemedText type="smallBold">{c.tenant.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {c.name}
            </ThemedText>
          </Pressable>
        ))}
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
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  spinner: {
    marginTop: Spacing.four,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
  },
});
