import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dispositionAccentColor } from '@/components/disposition-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  useAgentReports,
  useDiscardQueuedReport,
  useReportQueue,
  useRetryQueue,
} from '@/lib/agent-queries';
import { DEFAULT_EDIT_WINDOW_MINUTES, type AgentReport } from '@/lib/agent-types';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function minutesRemaining(createdAt: string, now: number): number {
  const elapsedMs = now - new Date(createdAt).getTime();
  return Math.ceil(DEFAULT_EDIT_WINDOW_MINUTES - elapsedMs / 60_000);
}

// Fase 4 (plan.md): "Mis reportes de hoy: lista con hora y tipificación;
// los editables (dentro de ventana) muestran botón de editar con cuenta
// regresiva del tiempo restante." Suma la sección de cola pendiente
// (plan.md: "el reporte queda en cola local con reintento manual
// visible").
export default function MisReportesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [range, setRange] = useState<'today' | 'week'>('today');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { data: reports, isLoading } = useAgentReports(range);
  const { data: queue } = useReportQueue();
  const retryQueue = useRetryQueue();
  const discardQueued = useDiscardQueuedReport();

  const followupsCount =
    reports?.filter((r) => r.disposition.requiresFollowup).length ?? 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="title">Mis reportes</ThemedText>

          {!!queue && queue.length > 0 && (
            <View style={[styles.queueBox, { backgroundColor: theme.backgroundElement, borderColor: theme.warning }]}>
              <ThemedText type="smallBold">
                {queue.length} reporte{queue.length === 1 ? '' : 's'} en cola (sin conexión)
              </ThemedText>
              <View style={styles.queueActions}>
                <Pressable
                  onPress={() => retryQueue.mutate()}
                  disabled={retryQueue.isPending}
                  style={[styles.queueButton, { backgroundColor: theme.primary }]}
                >
                  {retryQueue.isPending ? (
                    <ActivityIndicator color={theme.onPrimary} size="small" />
                  ) : (
                    <ThemedText style={{ color: theme.onPrimary }} type="small">
                      Reintentar
                    </ThemedText>
                  )}
                </Pressable>
              </View>
              {queue.map((item) => (
                <View key={item.localId} style={styles.queueItem}>
                  <ThemedText type="small" style={styles.queueItemText} numberOfLines={1}>
                    {item.input.contactName} · {item.input.contactPhone}
                  </ThemedText>
                  <Pressable onPress={() => discardQueued.mutate(item.localId)}>
                    <ThemedText type="small" themeColor="error">
                      Descartar
                    </ThemedText>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <View style={[styles.toggle, { backgroundColor: theme.backgroundElement }]}>
            {(['today', 'week'] as const).map((r) => (
              <Pressable
                key={r}
                onPress={() => setRange(r)}
                style={[
                  styles.toggleOption,
                  range === r && { backgroundColor: theme.background },
                ]}
              >
                <ThemedText type="small" themeColor={range === r ? 'text' : 'textSecondary'}>
                  {r === 'today' ? 'Hoy' : 'Esta semana'}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <View style={styles.summaryRow}>
            <View style={[styles.summaryChip, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small">{reports?.length ?? 0} reportes</ThemedText>
            </View>
            <View style={[styles.summaryChip, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small">{followupsCount} seguimientos</ThemedText>
            </View>
          </View>

          {isLoading && <ActivityIndicator style={styles.spinner} />}

          {reports?.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              now={now}
              onEdit={() => router.push(`/(agent)/editar-reporte/${report.id}`)}
            />
          ))}

          {!isLoading && reports?.length === 0 && (
            <ThemedText themeColor="textSecondary">Aún no hay reportes en este rango.</ThemedText>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ReportCard({
  report,
  now,
  onEdit,
}: {
  report: AgentReport;
  now: number;
  onEdit: () => void;
}) {
  const theme = useTheme();
  const minsLeft = minutesRemaining(report.createdAt, now);
  const editable = minsLeft > 0;
  const accent = dispositionAccentColor(theme, report.disposition.color);

  return (
    <View style={[styles.card, { borderColor: theme.border }]}>
      <View style={[styles.cardBar, { backgroundColor: accent }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <ThemedText type="small" themeColor="textSecondary">
              {formatTime(report.createdAt)} · {report.campaign.name}
            </ThemedText>
            <ThemedText type="smallBold">{report.contactName}</ThemedText>
            {!!report.scheduledAt && (
              <ThemedText type="small" themeColor="teal">
                Cita: {new Date(report.scheduledAt).toLocaleString('es')}
              </ThemedText>
            )}
          </View>
          <View style={[styles.pill, { borderColor: accent, backgroundColor: `${accent}22` }]}>
            <ThemedText type="small" style={{ color: accent }}>
              {report.disposition.label}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
          {editable ? (
            <>
              <ThemedText type="small" themeColor="warning">
                {minsLeft} min restantes
              </ThemedText>
              <Pressable onPress={onEdit} style={[styles.editButton, { borderColor: theme.primary }]}>
                <ThemedText type="small" themeColor="primary">
                  Editar
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Ventana vencida · solo supervisor
            </ThemedText>
          )}
        </View>
      </View>
    </View>
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
  queueBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  queueActions: {
    flexDirection: 'row',
  },
  queueButton: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: Spacing.three,
  },
  queueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  queueItemText: {
    flex: 1,
  },
  toggle: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 4,
  },
  toggleOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  summaryChip: {
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
  },
  spinner: {
    marginTop: Spacing.four,
  },
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardBar: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  editButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
  },
});
