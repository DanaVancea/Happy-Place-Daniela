import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ConfirmDelete,
  ErrorSummary,
  Field,
  FormActions,
  Modal,
  TextInput,
} from "@/components/manage/crud-ui";
import { createMetric, deleteMetric, updateMetricRow, type Metric } from "@/lib/dashboard";
import { metricSchema, validate, type FieldErrors } from "@/lib/manage-schemas";

/** Création / modification d'un indicateur (Admin), ouverte depuis l'accueil. */
export function MetricForm({ metric, onClose }: { metric: Metric | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    key: metric?.key ?? "",
    label: metric?.label ?? "",
    value: metric ? String(metric.value) : "",
    unit: metric?.unit ?? "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const save = useMutation({
    mutationFn: (input: Parameters<typeof createMetric>[0]) =>
      metric ? updateMetricRow(metric.key, input) : createMetric(input),
    onSuccess: async () => {
      toast.success(metric ? "Indicateur modifié" : "Indicateur créé");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["metrics"] }),
        qc.invalidateQueries({ queryKey: ["metrics-history-all"] }),
      ]);
      onClose();
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const raw = form.value.trim().replace(",", ".");
    const res = validate(metricSchema, {
      key: form.key,
      label: form.label,
      value: raw === "" || Number.isNaN(Number(raw)) ? Number.NaN : Number(raw),
      unit: form.unit.trim() === "" ? null : form.unit,
    });
    if (!res.ok) return setErrors(res.errors);
    setErrors({});
    save.mutate(res.data);
  }

  return (
    <Modal title={metric ? "Modifier l'indicateur" : "Nouvel indicateur"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-sm" noValidate>
        <ErrorSummary errors={errors} />
        <Field label="Clé technique" error={errors.key}>
          <TextInput
            value={form.key}
            disabled={!!metric}
            maxLength={40}
            placeholder="ex : taux_placement"
            onChange={(e) => setForm({ ...form, key: e.target.value })}
          />
        </Field>
        <Field label="Libellé" error={errors.label}>
          <TextInput
            value={form.label}
            maxLength={60}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </Field>
        <Field label="Valeur" error={errors.value}>
          <TextInput
            value={form.value}
            inputMode="decimal"
            onChange={(e) => setForm({ ...form, value: e.target.value })}
          />
        </Field>
        <Field label="Unité (optionnel)" error={errors.unit}>
          <TextInput
            value={form.unit}
            maxLength={8}
            placeholder="%"
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />
        </Field>
        <FormActions pending={save.isPending} onCancel={onClose} />
      </form>
    </Modal>
  );
}

export function MetricDelete({ metric, onClose }: { metric: Metric; onClose: () => void }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteMetric(metric.key),
    onSuccess: async () => {
      toast.success("Indicateur supprimé");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["metrics"] }),
        qc.invalidateQueries({ queryKey: ["metrics-history-all"] }),
      ]);
      onClose();
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  return (
    <ConfirmDelete
      label={metric.label}
      pending={remove.isPending}
      onCancel={onClose}
      onConfirm={() => remove.mutate()}
    />
  );
}
