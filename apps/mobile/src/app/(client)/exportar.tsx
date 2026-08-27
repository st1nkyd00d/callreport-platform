import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { useClientDispositions, useReportsSummary } from '@/lib/client-queries';
import type { DateRangeKind, Disposition, ReportFilters } from '@/lib/client-types';
import { exportReportsAndShare, type ExportFormat } from '@/lib/export-download';

const RANGE_CHIPS: { key: DateRangeKind; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'custom', label: 'Personalizado' },
];

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

interface DispositionGroup {
  key: string;
  label: string;
  ids: string[];
}

function groupDispositionsByCode(dispositions: Disposition[] | undefined): DispositionGroup[] {
  if (!dispositions) return [];
  const groups = new Map<string, DispositionGroup>();
  for (const d of [...dispositions].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const key = d.code ?? d.id;
    const existing = groups.get(key);
    if (existing) existing.ids.push(d.id);
    else groups.set(key, { key, label: d.label, ids: [d.id] });
  }
  return Array.from(groups.values());
}

type Status = 'idle' | 'downloading' | 'error';

// Fase 7 (plan.md): pestaña "Exportar" -- D9 de plan-fase-7.md documenta
// el desvío deliberado del texto del plan maestro ("botón + hoja") a
// favor de una pestaña propia, siguiendo el prototipo de diseño
// (admin-web/src/pages/mobile/cliente/ExportarPage.tsx), que ya resolvía
// esto con más aire para los filtros que un bottom sheet.
export default function ExportarScreen() {
  const theme = useTheme();
  const { session, refreshAccessToken } = useAuth();
  const params = useLocalSearchParams<{ from?: string; to?: string; dispositionIds?: string }>();

  const initialDispositionIds = params.dispositionIds?.split(',').filter(Boolean);

  const [rangeKind, setRangeKind] = useState<DateRangeKind>(params.from || params.to ? 'custom' : 'month');
  const [customFrom, setCustomFrom] = useState(() =>
    params.from ? new Date(params.from) : daysAgo(30),
  );
  const [customTo, setCustomTo] = useState(() => (params.to ? new Date(params.to) : new Date()));
  const [pickerOpen, setPickerOpen] = useState<'from' | 'to' | null>(null);
  const [dispositionKey, setDispositionKey] = useState<string | null>(null);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: dispositions } = useClientDispositions();
  const dispositionGroups = useMemo(() => groupDispositionsByCode(dispositions), [dispositions]);

  // Selección inicial (D9: acceso directo desde el dashboard) resuelta
  // como estado derivado en el render, no con un useEffect + setState
  // (evita el cascading-render que marca el linter): mientras el usuario
  // no haya tocado ningún chip a propósito, la selección "efectiva" sale
  // de los params de navegación en cuanto dispositionGroups carga. Tocar
  // "Todas" cuenta como elección explícita -- userTouchedDisposition
  // asegura que ese null no se vuelva a pisar con el valor inicial. Estado
  // normal, no un ref: el linter de React Compiler prohíbe leer refs
  // durante el render (solo en handlers/efectos).
  const [userTouchedDisposition, setUserTouchedDisposition] = useState(false);
  const initialGroup = initialDispositionIds?.length
    ? dispositionGroups.find((g) => g.ids.some((id) => initialDispositionIds.includes(id)))
    : undefined;
  const effectiveDispositionKey =
    !userTouchedDisposition && initialGroup ? initialGroup.key : dispositionKey;
  const selectedGroup = dispositionGroups.find((g) => g.key === effectiveDispositionKey);

  function selectDisposition(key: string | null) {
    setUserTouchedDisposition(true);
    setDispositionKey(key);
  }

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

  const { data: summary, isLoading: summaryLoading } = useReportsSummary(filters);

  async function handleDownload() {
    if (!session) return;
    setStatus('downloading');
    setErrorMessage(null);
    try {
      await exportReportsAndShare({
        format,
        filters,
        accessToken: session.accessToken,
        refreshAccessToken,
      });
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      const message = err instanceof Error ? err.message : 'No se pudo exportar';
      setErrorMessage(message);
      // También como alerta -- la pantalla puede haber perdido el foco
      // (el share sheet del sistema tapa la UI mientras está abierto).
      Alert.alert('No se pudo exportar', message);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View>
            <ThemedText type="title" style={styles.titleText}>
              Exportar reportes
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Configurá y descargá tus datos
            </ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold">Rango de fechas</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
              {RANGE_CHIPS.map((c) => (
                <Chip
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
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold">Tipificación</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
              <Chip
                label="Todas"
                active={effectiveDispositionKey === null}
                onPress={() => selectDisposition(null)}
              />
              {dispositionGroups.map((g) => (
                <Chip
                  key={g.key}
                  label={g.label}
                  active={effectiveDispositionKey === g.key}
                  onPress={() => selectDisposition(g.key)}
                />
              ))}
            </ScrollView>
          </View>

          <View
            style={[styles.countBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
          >
            <ThemedText type="small" themeColor="textSecondary">
              Registros a exportar
            </ThemedText>
            <ThemedText type="subtitle" style={{ color: theme.primary }}>
              {summaryLoading ? '…' : (summary?.total ?? 0)}
            </ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold">Formato de archivo</ThemedText>
            <View style={styles.formatRow}>
              <FormatOption
                label="CSV / Excel"
                active={format === 'csv'}
                onPress={() => setFormat('csv')}
              />
              <FormatOption label="PDF" active={format === 'pdf'} onPress={() => setFormat('pdf')} />
            </View>
          </View>

          {status === 'error' && errorMessage && (
            <ThemedText type="small" style={{ color: theme.error }}>
              {errorMessage}
            </ThemedText>
          )}

          <Pressable
            onPress={handleDownload}
            disabled={status === 'downloading'}
            style={[
              styles.downloadButton,
              { backgroundColor: theme.primary, opacity: status === 'downloading' ? 0.6 : 1 },
            ]}
          >
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              {status === 'downloading' ? 'Generando…' : 'Descargar y compartir'}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
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

function FormatOption({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.formatOption,
        {
          borderColor: active ? theme.primary : theme.border,
          backgroundColor: active ? `${theme.primary}11` : theme.backgroundElement,
        },
      ]}
    >
      <ThemedText type="smallBold" style={active ? { color: theme.primary } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  titleText: { fontSize: 24, lineHeight: 30 },
  section: { gap: Spacing.two },
  chipsRow: { flexGrow: 0 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  customRow: { flexDirection: 'row', gap: 8, marginTop: Spacing.two },
  customButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  countBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  formatRow: { flexDirection: 'row', gap: Spacing.three },
  formatOption: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  downloadButton: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
});
