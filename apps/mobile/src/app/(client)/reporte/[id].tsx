import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dispositionAccentColor } from '@/components/disposition-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReportDetail } from '@/lib/client-queries';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="default">{value}</ThemedText>
    </View>
  );
}

// Fase 5 (plan.md): detalle de un reporte -- contacto completo, notas,
// tipificación, campaña, agente, hora, y scheduledAt/detailText cuando
// existen. Sin @Roles del lado del API: RLS ya decide qué reporte puede
// ver este cliente (ver ReportsService.findOne()).
export default function ReportDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: report, isLoading, isError } = useReportDetail(id ?? null);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link" themeColor="primary">
              Volver
            </ThemedText>
          </Pressable>
          <ThemedText type="smallBold">Detalle del reporte</ThemedText>
          <View style={{ width: 48 }} />
        </View>

        {isLoading && <ActivityIndicator style={styles.spinner} />}
        {isError && (
          <View style={styles.spinner}>
            <ThemedText type="small" themeColor="error">
              No se pudo cargar el reporte.
            </ThemedText>
          </View>
        )}

        {report && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.dispositionRow}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: dispositionAccentColor(theme, report.disposition.color) },
                ]}
              />
              <ThemedText
                type="smallBold"
                style={{ color: dispositionAccentColor(theme, report.disposition.color) }}
              >
                {report.disposition.label}
              </ThemedText>
            </View>

            <Field label="Contacto" value={report.contactName} />
            <Field label="Teléfono" value={report.contactPhone} />
            {!!report.contactEmail && <Field label="Correo" value={report.contactEmail} />}
            <Field label="Campaña" value={report.campaign.name} />
            <Field label="Agente" value={report.agent.fullName} />
            <Field label="Fecha" value={formatDateTime(report.createdAt)} />
            {!!report.scheduledAt && <Field label="Cita agendada" value={formatDateTime(report.scheduledAt)} />}
            {!!report.detailText && <Field label="Detalle" value={report.detailText} />}
            {!!report.notes && <Field label="Notas" value={report.notes} />}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  spinner: { marginTop: Spacing.five, alignItems: 'center' },
  scroll: { padding: Spacing.four, gap: Spacing.three },
  dispositionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.two },
  dot: { width: 10, height: 10, borderRadius: 5 },
  field: { gap: 2 },
});
