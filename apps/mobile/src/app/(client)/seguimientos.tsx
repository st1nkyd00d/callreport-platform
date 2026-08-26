import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dispositionAccentColor } from '@/components/disposition-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFollowups, useResolveFollowup } from '@/lib/client-queries';
import type { ClientReport, FollowupStatus } from '@/lib/client-types';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isOverdue(report: ClientReport): boolean {
  return !!report.scheduledAt && new Date(report.scheduledAt).getTime() < Date.now();
}

// Fase 6 (plan.md): tab "Seguimientos" con badge de pendientes (ver
// (client)/_layout.tsx) -- Pendientes/Resueltos, botón para marcar
// resuelto (no swipe: más accesible, sin sumar otro gesto al bundle) y
// resaltado de vencidos (scheduledAt en el pasado, aún pendiente). Mismo
// criterio de UI que el mock de referencia (admin-web/src/pages/mobile/
// cliente/SeguimientosPage.tsx).
export default function SeguimientosScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [status, setStatus] = useState<FollowupStatus>('pending');
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
    isRefetching,
  } = useFollowups(status);
  const resolveFollowup = useResolveFollowup();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  async function handleResolve(reportId: string) {
    setResolvingId(reportId);
    try {
      await resolveFollowup.mutateAsync(reportId);
    } catch {
      // Sin mensaje dedicado: si el servidor ya lo marcaba resuelto (dos
      // sesiones casi al mismo tiempo), el refetch por la invalidación
      // igual saca la fila de "pendientes".
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <ThemedText type="smallBold">Seguimientos</ThemedText>
        </View>

        <View style={styles.segmentRow}>
          <SegmentButton
            label="Pendientes"
            active={status === 'pending'}
            onPress={() => setStatus('pending')}
          />
          <SegmentButton
            label="Resueltos"
            active={status === 'resolved'}
            onPress={() => setStatus('resolved')}
          />
        </View>

        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
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
            isLoading ? (
              <ActivityIndicator style={styles.spinner} />
            ) : (
              <View style={[styles.emptyBox, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  {status === 'pending'
                    ? 'Sin seguimientos pendientes.'
                    : 'Aún no hay seguimientos resueltos.'}
                </ThemedText>
              </View>
            )
          }
          renderItem={({ item }) => (
            <FollowupCard
              report={item}
              status={status}
              overdue={status === 'pending' && isOverdue(item)}
              resolving={resolvingId === item.id}
              onPress={() =>
                router.push({ pathname: '/(client)/reporte/[id]', params: { id: item.id } })
              }
              onResolve={() => void handleResolve(item.id)}
            />
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.segmentButton,
        { backgroundColor: active ? theme.background : 'transparent' },
      ]}
    >
      <ThemedText
        type={active ? 'smallBold' : 'small'}
        themeColor={active ? 'text' : 'textSecondary'}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

function FollowupCard({
  report,
  status,
  overdue,
  resolving,
  onPress,
  onResolve,
}: {
  report: ClientReport;
  status: FollowupStatus;
  overdue: boolean;
  resolving: boolean;
  onPress: () => void;
  onResolve: () => void;
}) {
  const theme = useTheme();
  const accent = dispositionAccentColor(theme, report.disposition.color);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: overdue ? theme.error : theme.border },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.name}>
            {report.contactName}
          </ThemedText>
          {overdue && (
            <ThemedText type="small" themeColor="error">
              Vencido
            </ThemedText>
          )}
        </View>
        <ThemedText type="small" style={{ color: accent }} numberOfLines={1}>
          {report.disposition.label}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {report.campaign.name}
        </ThemedText>
        {!!report.scheduledAt && (
          <ThemedText type="small" themeColor="textSecondary">
            Cita: {formatDateTime(report.scheduledAt)}
          </ThemedText>
        )}
        {status === 'resolved' && !!report.followupResolvedAt && (
          <ThemedText type="small" themeColor="textSecondary">
            Resuelto {formatDateTime(report.followupResolvedAt)}
          </ThemedText>
        )}
        {status === 'pending' && (
          <Pressable
            onPress={onResolve}
            disabled={resolving}
            style={[styles.resolveButton, { borderColor: theme.primary }]}
          >
            <ThemedText type="small" themeColor="primary">
              {resolving ? 'Resolviendo…' : 'Marcar como resuelto'}
            </ThemedText>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segmentRow: {
    flexDirection: 'row',
    margin: Spacing.four,
    marginBottom: 0,
    padding: 4,
    borderRadius: 10,
    backgroundColor: '#00000010',
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  listContent: { padding: Spacing.four, gap: Spacing.two },
  card: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  body: { flex: 1, gap: 4 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  name: { flexShrink: 1 },
  resolveButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  spinner: { marginVertical: Spacing.three },
  emptyBox: {
    margin: Spacing.four,
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'center',
  },
});
