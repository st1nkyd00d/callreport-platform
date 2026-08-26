import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReportForm, type ReportFormValues } from '@/components/report-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  useAgentCampaigns,
  useClockIn,
  useCreateReport,
  useCurrentShift,
  useDispositions,
} from '@/lib/agent-queries';
import { loadSelectedCampaignId } from '@/lib/selected-campaign';

// Fase 4 (plan.md): pantalla principal del agente. "un agente termina
// una llamada y registra el reporte en menos de 30 segundos, sin
// fricción" -- de ahí que la campaña quede persistida y el formulario se
// limpie solo después de guardar (resetOnSuccess).
export default function NuevoReporteScreen() {
  const router = useRouter();
  const theme = useTheme();

  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [queuedNotice, setQueuedNotice] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadSelectedCampaignId().then((id) => {
        if (active) setCampaignId(id);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const { data: campaigns } = useAgentCampaigns();
  const campaign = campaigns?.find((c) => c.id === campaignId) ?? null;
  const { data: dispositions, isLoading: dispositionsLoading } = useDispositions(campaignId);
  const { data: shift, isLoading: shiftLoading } = useCurrentShift();
  const clockIn = useClockIn();
  const createReport = useCreateReport();

  const shiftOpen = !!shift && !shift.endedAt;
  const formDisabled = !shiftOpen || !campaignId;

  async function handleSubmit(values: ReportFormValues) {
    if (!campaignId) return;
    const result = await createReport.mutateAsync({ ...values, campaignId });
    if (result.status === 'queued') {
      setQueuedNotice(true);
      setTimeout(() => setQueuedNotice(false), 4000);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <ThemedText type="smallBold">CallReport</ThemedText>
          <Pressable
            onPress={() => router.push('/(agent)/seleccionar-campana')}
            style={[styles.campaignChip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
          >
            <ThemedText type="small" numberOfLines={1} style={styles.campaignChipText}>
              {campaign ? `${campaign.tenant.name} — ${campaign.name}` : 'Elegir campaña'}
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!campaignId && (
            <View style={[styles.notice, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small">Seleccioná una campaña para comenzar a reportar.</ThemedText>
              <Pressable
                onPress={() => router.push('/(agent)/seleccionar-campana')}
                style={[styles.noticeButton, { backgroundColor: theme.primary }]}
              >
                <ThemedText style={{ color: theme.onPrimary }}>Elegir campaña</ThemedText>
              </Pressable>
            </View>
          )}

          {campaignId && !shiftLoading && !shiftOpen && (
            <View style={[styles.notice, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small">Iniciá tu turno para registrar llamadas.</ThemedText>
              <Pressable
                onPress={() => clockIn.mutate()}
                disabled={clockIn.isPending}
                style={[styles.noticeButton, { backgroundColor: theme.primary, opacity: clockIn.isPending ? 0.6 : 1 }]}
              >
                {clockIn.isPending ? (
                  <ActivityIndicator color={theme.onPrimary} />
                ) : (
                  <ThemedText style={{ color: theme.onPrimary }}>Iniciar turno</ThemedText>
                )}
              </Pressable>
            </View>
          )}

          {!!queuedNotice && (
            <ThemedText type="small" themeColor="warning">
              Sin conexión: el reporte quedó en la cola y se enviará automáticamente.
            </ThemedText>
          )}

          {campaignId && dispositionsLoading && <ActivityIndicator style={styles.spinner} />}

          {campaignId && dispositions && (
            <ReportForm
              key={campaignId}
              dispositions={dispositions}
              submitLabel="Guardar reporte"
              submittingLabel="Guardando..."
              resetOnSuccess
              disabled={formDisabled}
              onSubmit={handleSubmit}
            />
          )}
        </ScrollView>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  campaignChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: 200,
  },
  campaignChipText: {
    textAlign: 'right',
  },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  notice: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
    alignItems: 'center',
  },
  noticeButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  spinner: {
    marginTop: Spacing.four,
  },
});
