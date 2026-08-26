import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import type { Disposition } from '@/lib/agent-types';
import { DispositionChip } from './disposition-chip';
import { ThemedText } from './themed-text';

export interface ReportFormValues {
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  notes?: string;
  dispositionId: string;
  scheduledAt?: string;
  detailText?: string;
}

export interface ReportFormInitialValues {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
  dispositionId: string;
  scheduledAt: string;
  detailText: string;
}

const EMPTY: ReportFormInitialValues = {
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  notes: '',
  dispositionId: '',
  scheduledAt: '',
  detailText: '',
};

const PHONE_RE = /^[0-9+\-\s]{7,}$/;
const SCHEDULE_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/;

function parseScheduledAt(value: string): Date | null {
  const match = SCHEDULE_RE.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  return Number.isNaN(date.getTime()) ? null : date;
}

// Formulario compartido entre "Nuevo reporte" y "Editar reporte" (Fase 4,
// plan.md): mismos campos, misma validación inline en español. El campo
// de cita (requiresSchedule) es texto libre "AAAA-MM-DD HH:mm" -- no hay
// datetimepicker nativo instalado (decisión tomada al planificar la
// fase).
export function ReportForm({
  dispositions,
  initialValues,
  submitLabel,
  submittingLabel,
  onSubmit,
  resetOnSuccess,
  disabled,
}: {
  dispositions: Disposition[];
  initialValues?: Partial<ReportFormInitialValues>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: ReportFormValues) => Promise<void>;
  resetOnSuccess?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const initial = { ...EMPTY, ...initialValues };

  const [contactName, setContactName] = useState(initial.contactName);
  const [contactPhone, setContactPhone] = useState(initial.contactPhone);
  const [contactEmail, setContactEmail] = useState(initial.contactEmail);
  const [notes, setNotes] = useState(initial.notes);
  const [dispositionId, setDispositionId] = useState(initial.dispositionId);
  const [scheduledAt, setScheduledAt] = useState(initial.scheduledAt);
  const [detailText, setDetailText] = useState(initial.detailText);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const selected = dispositions.find((d) => d.id === dispositionId);

  function selectDisposition(id: string) {
    setDispositionId(id);
    setScheduledAt('');
    setDetailText('');
    setErrors((e) => ({ ...e, dispositionId: '', scheduledAt: '', detailText: '' }));
  }

  function validate(): { ok: true; values: ReportFormValues } | { ok: false } {
    const next: Record<string, string> = {};

    if (!contactName.trim()) next.contactName = 'Ingresá el nombre del contacto';
    if (!PHONE_RE.test(contactPhone.trim())) next.contactPhone = 'Ingresá un teléfono válido';
    if (!dispositionId) next.dispositionId = 'Elegí una tipificación';

    let scheduledIso: string | undefined;
    if (selected?.requiresSchedule) {
      const parsed = parseScheduledAt(scheduledAt);
      if (!parsed) {
        next.scheduledAt = 'Usá el formato AAAA-MM-DD HH:mm';
      } else if (parsed.getTime() <= Date.now()) {
        next.scheduledAt = 'Elegí una fecha y hora futuras';
      } else {
        scheduledIso = parsed.toISOString();
      }
    }

    if (selected?.requiresDetail && !detailText.trim()) {
      next.detailText = 'Este campo es obligatorio';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return { ok: false };

    return {
      ok: true,
      values: {
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim() || undefined,
        notes: notes.trim() || undefined,
        dispositionId,
        scheduledAt: selected?.requiresSchedule ? scheduledIso : undefined,
        detailText: selected?.requiresDetail ? detailText.trim() : undefined,
      },
    };
  }

  async function handleSubmit() {
    if (submitting || disabled) return;
    const result = validate();
    if (!result.ok) return;

    setSubmitting(true);
    setSavedMessage(null);
    try {
      await onSubmit(result.values);
      setSavedMessage('Reporte guardado');
      if (resetOnSuccess) {
        setContactName('');
        setContactPhone('');
        setContactEmail('');
        setNotes('');
        setDispositionId('');
        setScheduledAt('');
        setDetailText('');
        setErrors({});
      }
      setTimeout(() => setSavedMessage(null), 2500);
    } catch (e) {
      setErrors({
        form: e instanceof Error ? e.message : 'No se pudo guardar el reporte',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.field}>
        <ThemedText type="small" themeColor="textSecondary">
          Nombre
        </ThemedText>
        <TextInput
          value={contactName}
          onChangeText={setContactName}
          editable={!disabled}
          placeholder="Nombre completo"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
        />
        {!!errors.contactName && <ThemedText type="small" themeColor="error">{errors.contactName}</ThemedText>}
      </View>

      <View style={styles.field}>
        <ThemedText type="small" themeColor="textSecondary">
          Teléfono
        </ThemedText>
        <TextInput
          value={contactPhone}
          onChangeText={setContactPhone}
          editable={!disabled}
          placeholder="Ej: 555-0123"
          placeholderTextColor={theme.textSecondary}
          keyboardType="phone-pad"
          style={[
            styles.input,
            { color: theme.text, borderColor: errors.contactPhone ? theme.error : theme.border },
          ]}
        />
        {!!errors.contactPhone && <ThemedText type="small" themeColor="error">{errors.contactPhone}</ThemedText>}
      </View>

      <View style={styles.field}>
        <ThemedText type="small" themeColor="textSecondary">
          Correo (opcional)
        </ThemedText>
        <TextInput
          value={contactEmail}
          onChangeText={setContactEmail}
          editable={!disabled}
          placeholder="ejemplo@correo.com"
          placeholderTextColor={theme.textSecondary}
          keyboardType="email-address"
          autoCapitalize="none"
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
        />
      </View>

      <View style={styles.field}>
        <ThemedText type="small" themeColor="textSecondary">
          Tipificación
        </ThemedText>
        <View style={styles.chipGrid}>
          {dispositions.map((d) => (
            <DispositionChip
              key={d.id}
              disposition={d}
              selected={dispositionId === d.id}
              onPress={() => selectDisposition(d.id)}
            />
          ))}
        </View>
        {!!errors.dispositionId && <ThemedText type="small" themeColor="error">{errors.dispositionId}</ThemedText>}
      </View>

      {selected?.requiresSchedule && (
        <View style={styles.field}>
          <ThemedText type="small" themeColor="textSecondary">
            Fecha y hora de la cita
          </ThemedText>
          <TextInput
            value={scheduledAt}
            onChangeText={setScheduledAt}
            editable={!disabled}
            placeholder="AAAA-MM-DD HH:mm"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              { color: theme.text, borderColor: errors.scheduledAt ? theme.error : theme.border },
            ]}
          />
          {!!errors.scheduledAt && <ThemedText type="small" themeColor="error">{errors.scheduledAt}</ThemedText>}
        </View>
      )}

      {selected?.requiresDetail && (
        <View style={styles.field}>
          <ThemedText type="small" themeColor="textSecondary">
            Especificar
          </ThemedText>
          <TextInput
            value={detailText}
            onChangeText={setDetailText}
            editable={!disabled}
            placeholder="¿De qué se trató la llamada?"
            placeholderTextColor={theme.textSecondary}
            maxLength={120}
            style={[
              styles.input,
              { color: theme.text, borderColor: errors.detailText ? theme.error : theme.border },
            ]}
          />
          {!!errors.detailText && <ThemedText type="small" themeColor="error">{errors.detailText}</ThemedText>}
        </View>
      )}

      <View style={styles.field}>
        <ThemedText type="small" themeColor="textSecondary">
          Notas de la llamada
        </ThemedText>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          editable={!disabled}
          placeholder="Detalles de la interacción..."
          placeholderTextColor={theme.textSecondary}
          multiline
          numberOfLines={4}
          style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.border }]}
        />
      </View>

      {!!errors.form && <ThemedText themeColor="error">{errors.form}</ThemedText>}
      {!!savedMessage && <ThemedText themeColor="success">{savedMessage}</ThemedText>}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting || disabled}
        style={[styles.submit, { backgroundColor: theme.primary, opacity: submitting || disabled ? 0.6 : 1 }]}
      >
        {submitting ? (
          <View style={styles.submitBusy}>
            <ActivityIndicator color={theme.onPrimary} />
            <ThemedText style={{ color: theme.onPrimary }}>{submittingLabel}</ThemedText>
          </View>
        ) : (
          <ThemedText style={{ color: theme.onPrimary }}>{submitLabel}</ThemedText>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  field: {
    gap: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  submit: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBusy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
