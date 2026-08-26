import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import type { Disposition, DispositionColor } from '@/lib/agent-types';

export function dispositionAccentColor(
  theme: ReturnType<typeof useTheme>,
  color: DispositionColor | null,
) {
  switch (color) {
    case 'success':
      return theme.success;
    case 'warning':
      return theme.warning;
    case 'error':
      return theme.error;
    case 'primary':
      return theme.primary;
    case 'teal':
      return theme.teal;
    case 'purple':
      return theme.purple;
    default:
      return theme.textSecondary;
  }
}

export function DispositionChip({
  disposition,
  selected,
  onPress,
}: {
  disposition: Disposition;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const accent = dispositionAccentColor(theme, disposition.color);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? accent : theme.border,
          backgroundColor: selected ? `${accent}22` : theme.backgroundElement,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <ThemedText type="small" style={styles.label} numberOfLines={2}>
        {disposition.label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    flexShrink: 1,
  },
});
