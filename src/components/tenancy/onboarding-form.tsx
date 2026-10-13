"use client";
import { useActionState, useEffect, useState } from "react";
import { onboardAction } from "@/actions/tenancy";
import { Field, FormAlert, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { COMMON_TIMEZONES } from "./timezones";

export function OnboardingForm() {
  const [state, action] = useActionState(onboardAction, { ok: true });
  const [timezone, setTimezone] = useState("UTC");
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) setTimezone(tz);
  }, []);
  const errors = !state.ok ? state.fieldErrors : undefined;
  const zones = COMMON_TIMEZONES.includes(timezone) ? COMMON_TIMEZONES : [timezone, ...COMMON_TIMEZONES];
  return (
    <form action={action} className="space-y-4">
      {!state.ok && <FormAlert>{state.error}</FormAlert>}
      <Field label="Agency name" htmlFor="agencyName" error={errors?.agencyName} required>
        <Input id="agencyName" name="agencyName" placeholder="e.g. 8limbs Marketing" maxLength={80} required autoFocus />
      </Field>
      <Field label="First client workspace" htmlFor="workspaceName" error={errors?.workspaceName} hint="Usually the name of a client business." required>
        <Input id="workspaceName" name="workspaceName" placeholder="e.g. Riverside Dental" maxLength={80} required />
      </Field>
      <Field label="Workspace time zone" htmlFor="timezone" error={errors?.timezone}>
        <Select id="timezone" name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton size="lg" className="w-full" pendingLabel="Creating…">
        Create agency
      </SubmitButton>
    </form>
  );
}
