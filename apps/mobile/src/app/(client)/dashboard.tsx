import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KpiCard } from '@/components/kpi-card';
import { ReportCard } from '@/components/report-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import {
  useClientCampaigns,
  useClientDispositions,
  useClientReports,
  useReportsSummary,
  useUpcomingAppointments,
} from '@/lib/client-queries';
import type { ClientReport, DateRangeKind, Disposition, ReportFilters } from '@/lib/client-types';
import { useRealtime } from '@/lib/realtime';

const RANGE_CHIPS: { key: DateRangeKind; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'custom', label: 'Personalizado' },
];

// Grupos de KPI del mock de Stitch (admin-web/src/pages/mobile/cliente/
// DashboardPage.tsx) -- mismos codes que default-dispositions.ts.
const SEGUIMIENTO_CODES = new Set(['seguimiento', 'mensaje', 'reclamo']);

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
function formatShortDate(d: Date): string {
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
}
function formatAppointment(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (isSameDay(date, now)) return `Hoy, ${time}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(date, tomorrow)) return `Mañana, ${time}`;
  return `${date.toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: 'short' })}, ${time}`;
}

interface DispositionGroup {
  key: string;
  label: string;
  color: Disposition['color'];
  ids: string[];
}

function groupDispositionsByCode(dispositions: Disposition[] | undefined): DispositionGroup[] {
  if (!dispositions) return [];
  const groups = new Map<string, DispositionGroup>();
  for (const d of [...dispositions].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const key = d.code ?? d.id;
    const existing = groups.get(key);
    if (existing) existing.ids.push(d.id);
    else groups.set(key, { key, label: d.label, color: d.color, ids: [d.id] });
  }
  return Array.from(groups.values());
}

// Fase 5 (plan.md): dashboard real del cliente, reemplaza el placeholder
// de la Fase 1. RealtimeProvider (montado en el _layout de este grupo)
// invalida las queries de acá cuando llega report.created/updated.
export default function ClientDashboardScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session, logout } = useAuth();
  const { isConnected } = useRealtime();

  const [rangeKind, setRangeKind] = useState<DateRangeKind>('today');
  const [customFrom, setCustomFrom] = useState(() => daysAgo(7));
  const [customTo, setCustomTo] = useState(() => new Date());
  const [pickerOpen, setPickerOpen] = useState<'from' | 'to' | null>(null);
  const [dispositionKey, setDispositionKey] = useState<string | null>(null);

  const { data: campaigns } = useClientCampaigns();
  const { data: dispositions } = useClientDispositions();
  const dispositionGroups = useMemo(() => groupDispositionsByCode(dispositions), [dispositions]);
  const selectedGroup = dispositionGroups.find((g) => g.key === dispositionKey);

  const filters: ReportFilters = useMemo(() => {
    const now = new Date();
    let from: Date;
    let to: Date = now;
    if (rangeKind === 'today') from = startOfDay(now);
    else if (rangeKind === 'week') from = daysAgo(7);
    else if (rangeKind === 'month') from = daysAgo(30);
    else {
      from = startOfDay(customFrom);
      to = endOfDay(customTo);
    }
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      dispositionIds: selectedGroup?.ids,
    };
  }, [rangeKind, customFrom, customTo, selectedGroup]);

  const { data: summary } = useReportsSummary(filters);
  const { data: upcoming } = useUpcomingAppointments();
  const {
    data: reportsPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: reportsLoading,
    refetch,
    isRefetching,
  } = useClientReports(filters);

  const reports = useMemo(
    () => reportsPages?.pages.flatMap((p) => p.items) ?? [],
    [reportsPages],
  );

  const kpis = useMemo(() => {
    const byCode = new Map<string, number>();
    for (const d of summary?.byDisposition ?? []) {
      const key = d.code ?? d.dispositionId;
      byCode.set(key, (byCode.get(key) ?? 0) + d.count);
    }
    const ventas = byCode.get('venta') ?? 0;
    const citas = byCode.get('cita') ?? 0;
    let seguimientos = 0;
    for (const [code, count] of byCode) if (SEGUIMIENTO_CODES.has(code)) seguimientos += count;
    const total = summary?.total ?? 0;
    const otros = Math.max(0, total - ventas - citas - seguimientos);
    return { total, ventas, citas, seguimientos, otros };
  }, [summary]);

  const tenantName = campaigns?.[0]?.tenant.name ?? session?.user.fullName ?? 'Cliente';

  function openDetail(report: ClientReport) {
    router.push({ pathname: '/(client)/reporte/[id]', params: { id: report.id } });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={styles.headerLeft}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {tenantName}
            </ThemedText>
            <View style={styles.liveBadge}>
              <View
                style={[
                  styles.liveDot,
                  { backgroundColor: isConnected ? theme.success : theme.textSecondary },
                ]}
              />
              <ThemedText type="small" themeColor="textSecondary">
                {isConnected ? 'En vivo' : 'Sin conexión'}
              </ThemedText>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/(client)/exportar',
                  params: {
                    from: filters.from,
                    to: filters.to,
                    dispositionIds: filters.dispositionIds?.join(','),
                  },
                })
              }
            >
              <ThemedText type="link" themeColor="textSecondary">
                Exportar
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={async () => {
                await logout();
                router.replace('/login');
              }}
            >
              <ThemedText type="link" themeColor="textSecondary">
                Salir
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <FlatList
          data={reports}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <ReportCard report={item} onPress={() => openDetail(item)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
          contentContainerStyle={styles.listContent}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator style={styles.spinner} /> : null
          }
          ListEmptyComponent={
            reportsLoading ? (
              <ActivityIndicator style={styles.spinner} />
            ) : (
              <View style={[styles.emptyBox, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  Aún no hay reportes en este rango.
                </ThemedText>
              </View>
            )
          }
          ListHeaderComponent={
            <View style={styles.headerContent}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                {RANGE_CHIPS.map((c) => (
                  <RangeChip
                    key={c.key}
                    label={c.label}
                    active={rangeKind === c.key}
                    onPress={() => setRangeKind(c.key)}
                  />
                ))}
              </ScrollView>

              {rangeKind === 'custom' && (
                <View style={styles.customRow}>
                  <Pressable
                    onPress={() => setPickerOpen('from')}
                    style={[styles.customButton, { borderColor: theme.border }]}
                  >
                    <ThemedText type="small">Desde: {formatShortDate(customFrom)}</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => setPickerOpen('to')}
                    style={[styles.customButton, { borderColor: theme.border }]}
                  >
                    <ThemedText type="small">Hasta: {formatShortDate(customTo)}</ThemedText>
                  </Pressable>
                  {pickerOpen === 'from' && (
                    <DateTimePicker
                      mode="date"
                      value={customFrom}
                      maximumDate={customTo}
                      onValueChange={(_, date) => {
                        setCustomFrom(date);
                        setPickerOpen(null);
                      }}
                      onDismiss={() => setPickerOpen(null)}
                    />
                  )}
                  {pickerOpen === 'to' && (
                    <DateTimePicker
                      mode="date"
                      value={customTo}
                      minimumDate={customFrom}
                      onValueChange={(_, date) => {
                        setCustomTo(date);
                        setPickerOpen(null);
                      }}
                      onDismiss={() => setPickerOpen(null)}
                    />
                  )}
                </View>
              )}

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                <RangeChip label="Todas" active={dispositionKey === null} onPress={() => setDispositionKey(null)} />
                {dispositionGroups.map((g) => (
                  <RangeChip
                    key={g.key}
                    label={g.label}
                    active={dispositionKey === g.key}
                    onPress={() => setDispositionKey(g.key)}
                  />
                ))}
              </ScrollView>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kpiRow}>
                <KpiCard label="Total" value={kpis.total} style={styles.kpiCardSpacing} />
                <KpiCard
                  label="Ventas"
                  value={kpis.ventas}
                  accentColor={theme.success}
                  style={styles.kpiCardSpacing}
                />
                <KpiCard
                  label="Citas"
                  value={kpis.citas}
                  accentColor={theme.teal}
                  style={styles.kpiCardSpacing}
                />
                <KpiCard
                  label="Seguimientos"
                  value={kpis.seguimientos}
                  accentColor={theme.warning}
                  style={styles.kpiCardSpacing}
                />
                <KpiCard label="Otros" value={kpis.otros} accentColor={theme.textSecondary} />
              </ScrollView>

              {!!upcoming?.length && (
                <View style={styles.appointmentsSection}>
                  <ThemedText type="smallBold">Próximas citas</ThemedText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.appointmentsRow}>
                    {upcoming.map((r) => (
                      <Pressable
                        key={r.id}
                        onPress={() => openDetail(r)}
                        style={[
                          styles.appointmentCard,
                          { backgroundColor: theme.backgroundElement, borderColor: theme.teal },
                        ]}
                      >
                        <ThemedText type="small" style={{ color: theme.teal }}>
                          {formatAppointment(r.scheduledAt!)}
                        </ThemedText>
                        <ThemedText type="smallBold" numberOfLines={1}>
                          {r.contactName}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {r.campaign.name}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              <ThemedText type="smallBold">Reportes recientes</ThemedText>
            </View>
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function RangeChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.rangeChip,
        {
          borderColor: active ? theme.primary : theme.border,
          backgroundColor: active ? `${theme.primary}22` : theme.backgroundElement,
        },
      ]}
    >
      <ThemedText type="small" style={active ? { color: theme.primary } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
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
  headerLeft: { gap: 4, flexShrink: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  listContent: { padding: Spacing.four, gap: Spacing.two },
  headerContent: { gap: Spacing.three, marginBottom: Spacing.three },
  chipsRow: { flexGrow: 0 },
  rangeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  customRow: { flexDirection: 'row', gap: 8 },
  customButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  kpiRow: { flexGrow: 0 },
  kpiCardSpacing: { marginRight: 8 },
  appointmentsSection: { gap: 8 },
  appointmentsRow: { flexGrow: 0 },
  appointmentCard: {
    minWidth: 160,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginRight: 8,
    gap: 2,
  },
  spinner: { marginVertical: Spacing.three },
  emptyBox: {
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'center',
  },
});
