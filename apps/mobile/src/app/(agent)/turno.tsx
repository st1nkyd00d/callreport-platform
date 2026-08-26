import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { useClockIn, useClockOut, useCurrentShift, useShiftHistory } from '@/lib/agent-queries';
import type { Shift } from '@/lib/agent-types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Fase 4: los turnos no estaban en el alcance original de plan.md para
// esta fase, pero son obligatorios por RLS para poder crear un reporte
// (ver call_reports_agent_insert) -- ver PROGRESS.md. Pantalla calcada
// del prototipo TurnoPage (admin-web/src/pages/mobile/agente).
export default function TurnoScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { logout } = useAuth();
  const [now, setNow] = useState(() => Date.now());

  const { data: shift, isLoading: shiftLoading } = useCurrentShift();
  const { data: history, isLoading: historyLoading } = useShiftHistory(7);
  const clockIn = useClockIn();
  const clockOut = useClockOut();

  const shiftOpen = !!shift && !shift.endedAt;

  useEffect(() => {
    if (!shiftOpen) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [shiftOpen]);

  const elapsedMs = shiftOpen ? now - new Date(shift.startedAt).getTime() : 0;

  const weekTotalMs = (history ?? []).reduce((sum, s) => {
    const end = s.endedAt ? new Date(s.endedAt).getTime() : now;
    return sum + Math.max(0, end - new Date(s.startedAt).getTime());
  }, 0);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="title">Turno</ThemedText>

          {shiftLoading ? (
            <ActivityIndicator style={styles.spinner} />
          ) : (
            <View
              style={[
                styles.shiftBox,
                { borderColor: shiftOpen ? theme.success : theme.border, backgroundColor: theme.backgroundElement },
              ]}
            >
              {shiftOpen ? (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    En turno desde {formatTime(shift.startedAt)}
                  </ThemedText>
                  <ThemedText type="title" style={styles.stopwatch}>
                    {formatDuration(elapsedMs)}
                  </ThemedText>
                  {typeof shift.reportsCount === 'number' && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {shift.reportsCount} reporte{shift.reportsCount === 1 ? '' : 's'} en este turno
                    </ThemedText>
                  )}
                  <Pressable
                    onPress={() => clockOut.mutate()}
                    disabled={clockOut.isPending}
                    style={[styles.actionButton, { backgroundColor: theme.error, opacity: clockOut.isPending ? 0.6 : 1 }]}
                  >
                    {clockOut.isPending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <ThemedText style={styles.actionButtonText}>Finalizar turno</ThemedText>
                    )}
                  </Pressable>
                </>
              ) : (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    No iniciaste turno. Iniciá tu turno para poder registrar llamadas.
                  </ThemedText>
                  <Pressable
                    onPress={() => clockIn.mutate()}
                    disabled={clockIn.isPending}
                    style={[styles.actionButton, { backgroundColor: theme.primary, opacity: clockIn.isPending ? 0.6 : 1 }]}
                  >
                    {clockIn.isPending ? (
                      <ActivityIndicator color={theme.onPrimary} />
                    ) : (
                      <ThemedText style={{ color: theme.onPrimary }}>Iniciar turno</ThemedText>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          )}

          <ThemedText type="smallBold">Esta semana</ThemedText>
          {historyLoading && <ActivityIndicator style={styles.spinner} />}
          <View style={[styles.historyBox, { borderColor: theme.border }]}>
            {history?.map((s: Shift) => {
              const end = s.endedAt ? new Date(s.endedAt).getTime() : now;
              const durationMs = Math.max(0, end - new Date(s.startedAt).getTime());
              return (
                <View key={s.id} style={[styles.historyRow, { borderColor: theme.border }]}>
                  <View>
                    <ThemedText type="small">{formatDateLong(s.startedAt)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatTime(s.startedAt)} – {s.endedAt ? formatTime(s.endedAt) : 'en curso'}
                      {s.closedBy ? ' · cerrado por supervisor' : ''}
                    </ThemedText>
                  </View>
                  <ThemedText type="small">{formatDuration(durationMs)}</ThemedText>
                </View>
              );
            })}
            {!historyLoading && history?.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.historyEmpty}>
                Sin turnos esta semana.
              </ThemedText>
            )}
          </View>

          <View style={styles.totalRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Total semana
            </ThemedText>
            <ThemedText type="smallBold" themeColor="primary">
              {formatDuration(weekTotalMs)}
            </ThemedText>
          </View>

          <Pressable onPress={() => void handleLogout()} style={styles.logout}>
            <ThemedText type="link" themeColor="textSecondary">
              Cerrar sesión
            </ThemedText>
          </Pressable>
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
    marginVertical: Spacing.three,
  },
  shiftBox: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  stopwatch: {
    fontVariant: ['tabular-nums'],
  },
  actionButton: {
    alignSelf: 'stretch',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  actionButtonText: {
    color: '#fff',
  },
  historyBox: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyEmpty: {
    padding: Spacing.three,
    textAlign: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  logout: {
    alignItems: 'center',
    marginTop: Spacing.three,
  },
});
