"use client";
import Link from "next/link";
import { useActionState } from "react";
import type { ActionResult } from "@/server/action-result";
import { Field, FormAlert, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { LIFECYCLE_LABELS, LIFECYCLE_STATUSES } from "@/lib/validation/crm";
import { cn } from "@/lib/utils";
import type { FieldDefinitionOption, FieldValueOption, TagOption, UserOption } from "./types";
import { CustomFieldInput } from "./custom-field-input";

export interface ContactFormValues {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  source?: string | null;
  lifecycleStatus?: string;
  assignedToId?: string | null;
  tagIds?: string[];
}

export function ContactForm({
  action,
  workspaceId,
  initial = {},
  values = [],
  users,
  tags,
  fields,
  sources,
  submitLabel,
  cancelHref,
}: {
  action: (prev: ActionResult<unknown>, formData: FormData) => Promise<ActionResult<unknown>>;
  workspaceId: string;
  initial?: ContactFormValues;
  values?: FieldValueOption[];
  users: UserOption[];
  tags: TagOption[];
  fields: FieldDefinitionOption[];
  sources: string[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, { ok: true });
  const errors = !state.ok ? state.fieldErrors : undefined;
  const valueByField = new Map(values.map((v) => [v.fieldId, v]));
  const selectedTags = new Set(initial.tagIds ?? []);

  return (
    <form action={formAction} className="space-y-6">
      {!state.ok && (
        <FormAlert>
          {state.error}
          {state.duplicateId && (
            <>
              {" "}
              <Link href={`/w/${workspaceId}/contacts/${state.duplicateId}`} className="font-medium underline">
                Open the existing contact
              </Link>
              . Duplicates are never merged automatically.
            </>
          )}
        </FormAlert>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Contact details</legend>
        <Field label="First name" htmlFor="firstName" error={errors?.firstName}>
          <Input id="firstName" name="firstName" defaultValue={initial.firstName ?? ""} maxLength={80} autoComplete="off" />
        </Field>
        <Field label="Last name" htmlFor="lastName" error={errors?.lastName}>
          <Input id="lastName" name="lastName" defaultValue={initial.lastName ?? ""} maxLength={80} autoComplete="off" />
        </Field>
        <Field label="Email" htmlFor="email" error={errors?.email}>
          <Input id="email" name="email" type="email" defaultValue={initial.email ?? ""} maxLength={254} autoComplete="off" />
        </Field>
        <Field label="Phone" htmlFor="phone" error={errors?.phone}>
          <Input id="phone" name="phone" type="tel" defaultValue={initial.phone ?? ""} maxLength={40} autoComplete="off" />
        </Field>
        <Field label="Company" htmlFor="company" error={errors?.company}>
          <Input id="company" name="company" defaultValue={initial.company ?? ""} maxLength={120} />
        </Field>
        <Field label="Source" htmlFor="source" error={errors?.source} hint="Where this lead came from, e.g. Website, Referral.">
          <Input id="source" name="source" list="contact-sources" defaultValue={initial.source ?? ""} maxLength={80} />
          <datalist id="contact-sources">
            {sources.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Lifecycle status" htmlFor="lifecycleStatus" error={errors?.lifecycleStatus}>
          <Select id="lifecycleStatus" name="lifecycleStatus" defaultValue={initial.lifecycleStatus ?? "LEAD"}>
            {LIFECYCLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LIFECYCLE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Owner" htmlFor="assignedToId" error={errors?.assignedToId}>
          <Select id="assignedToId" name="assignedToId" defaultValue={initial.assignedToId ?? ""}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[12.5px] font-medium text-ink-muted">Tags</legend>
        {tags.length === 0 ? (
          <p className="text-[12.5px] text-ink-faint">No tags in this workspace yet. Admins can create tags in workspace settings.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <label key={t.id} className="cursor-pointer">
                <input type="checkbox" name="tagIds" value={t.id} defaultChecked={selectedTags.has(t.id)} className="peer sr-only" />
                <span
                  className={cn(
                    "inline-flex h-7 items-center rounded-md border border-line-strong px-2.5 text-[12.5px] text-ink-muted transition-colors",
                    "peer-checked:border-navy-800 peer-checked:bg-navy-900 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-gold-400",
                  )}
                >
                  {t.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {fields.length > 0 && (
        <fieldset className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <legend className="sr-only">Custom fields</legend>
          <p className="text-[12px] font-semibold tracking-[0.06em] text-ink-faint uppercase sm:col-span-2">Custom fields</p>
          {fields.map((f) => (
            <CustomFieldInput key={f.id} field={f} value={valueByField.get(f.id)} error={errors?.[`cf_${f.id}`]} />
          ))}
        </fieldset>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button asChild variant="secondary">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
