import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

// Tarjeta de resumen del dashboard del cliente (Fase 5). Mismo criterio
// visual que disposition-chip.tsx: un punto de color como acento en vez
// de un ícono (el móvil no tiene una librería de íconos instalada).
export function KpiCard({
  label,
  value,
  accentColor,
  style,
}: {
  label: string;
  value: number;
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const accent = accentColor ?? theme.primary;

  return (
    <View
      style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, style]}
    >
      <View style={styles.labelRow}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {label}
        </ThemedText>
      </View>
      <ThemedText type="subtitle" style={{ color: accent }}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 104,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
