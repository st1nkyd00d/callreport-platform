import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReportForm, type ReportFormValues } from '@/components/report-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAgentReports, useDispositions, useUpdateReport } from '@/lib/agent-queries';

function toScheduledInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Fase 4 (plan.md): edición dentro de la ventana. El servidor sigue
// siendo la autoridad -- si la ventana ya venció (o cambió de autor), el
// PATCH devuelve 403 con un mensaje claro que el formulario muestra tal
// cual (ver ReportForm -- errors.form).
export default function EditarReporteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: todayReports } = useAgentReports('today');
  const { data: weekReports } = useAgentReports('week');
  const report =
    todayReports?.find((r) => r.id === id) ?? weekReports?.find((r) => r.id === id);

  const { data: dispositions } = useDispositions(report?.campaignId ?? null);
  const updateReport = useUpdateReport();

  async function handleSubmit(values: ReportFormValues) {
    if (!report) return;
    await updateReport.mutateAsync({
      id: report.id,
      input: {
        contactName: values.contactName,
        contactPhone: values.contactPhone,
        contactEmail: values.contactEmail,
        notes: values.notes,
        dispositionId: values.dispositionId,
        scheduledAt: values.scheduledAt,
        detailText: values.detailText,
      },
    });
    router.back();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">Editar reporte</ThemedText>

          {(!report || !dispositions) && <ActivityIndicator style={styles.spinner} />}

          {report && dispositions && (
            <ReportForm
              dispositions={dispositions}
              initialValues={{
                contactName: report.contactName,
                contactPhone: report.contactPhone,
                contactEmail: report.contactEmail ?? '',
                notes: report.notes ?? '',
                dispositionId: report.dispositionId,
                scheduledAt: toScheduledInput(report.scheduledAt),
                detailText: report.detailText ?? '',
              }}
              submitLabel="Guardar cambios"
              submittingLabel="Guardando..."
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
  scroll: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  spinner: {
    marginTop: Spacing.four,
  },
});
