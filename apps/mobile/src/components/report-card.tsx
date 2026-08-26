import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import type { ClientReport } from '@/lib/client-types';
import { dispositionAccentColor } from './disposition-chip';
import { ThemedText } from './themed-text';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

// Fila del feed en tiempo real (plan.md Fase 5). `entering` anima la
// entrada de una fila la PRIMERA vez que monta -- cuando el refetch tras
// un `report.created` la trae por primera vez al tope del feed, React ya
// la trata como un ítem nuevo (key distinta), así que la animación de
// "llegó una llamada" sale gratis sin tener que inyectarla a mano en el
// caché de React Query.
export function ReportCard({ report, onPress }: { report: ClientReport; onPress: () => void }) {
  const theme = useTheme();
  const accent = dispositionAccentColor(theme, report.disposition.color);

  return (
    <Animated.View entering={FadeInDown.duration(250)}>
      <Pressable
        onPress={onPress}
        style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
      >
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <View style={styles.body}>
          <View style={styles.headerRow}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.name}>
              {report.contactName}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatTime(report.createdAt)}
            </ThemedText>
          </View>
          <ThemedText type="small" style={{ color: accent }} numberOfLines={1}>
            {report.disposition.label}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {report.campaign.name} · {report.agent.fullName}
          </ThemedText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flexShrink: 1,
  },
});
