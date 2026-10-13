import { Field, Input, Select } from "@/components/ui/form";
import type { FieldDefinitionOption, FieldValueOption } from "./types";

/** Renders a typed input for one custom field. Inputs are named `cf:<fieldId>`. */
export function CustomFieldInput({ field, value, error }: { field: FieldDefinitionOption; value?: FieldValueOption; error?: string[] }) {
  const id = `cf-${field.id}`;
  const name = `cf:${field.id}`;
  const common = { label: field.label, htmlFor: id, error, required: field.required };
  switch (field.type) {
    case "TEXT":
      return (
        <Field {...common}>
          <Input id={id} name={name} defaultValue={value?.textValue ?? ""} maxLength={1000} />
        </Field>
      );
    case "NUMBER":
      return (
        <Field {...common}>
          <Input id={id} name={name} inputMode="decimal" defaultValue={value?.numberValue ?? ""} />
        </Field>
      );
    case "DATE":
      return (
        <Field {...common}>
          <Input id={id} name={name} type="date" defaultValue={value?.dateValue ? value.dateValue.slice(0, 10) : ""} />
        </Field>
      );
    case "BOOLEAN":
      return (
        <Field {...common}>
          <Select id={id} name={name} defaultValue={value?.boolValue === null || value?.boolValue === undefined ? "" : String(value.boolValue)}>
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </Select>
        </Field>
      );
    case "SINGLE_SELECT":
      return (
        <Field {...common}>
          <Select id={id} name={name} defaultValue={value?.optionValues[0] ?? ""}>
            <option value="">—</option>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {value?.optionValues[0] && !field.options.includes(value.optionValues[0]) && (
              <option value={value.optionValues[0]}>{value.optionValues[0]} (retired)</option>
            )}
          </Select>
        </Field>
      );
    case "MULTI_SELECT": {
      const selected = new Set(value?.optionValues ?? []);
      return (
        <Field {...common}>
          <input type="hidden" name={`cfmulti:${field.id}`} value="1" />
          <div id={id} className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border border-line-strong px-2.5 py-2">
            {field.options.map((o) => (
              <label key={o} className="flex items-center gap-1.5 text-[13px]">
                <input type="checkbox" name={name} value={o} defaultChecked={selected.has(o)} className="accent-navy-800" />
                {o}
              </label>
            ))}
          </div>
        </Field>
      );
    }
  }
}
