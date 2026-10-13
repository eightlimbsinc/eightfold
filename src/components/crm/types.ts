/** Serializable shapes passed from Server Components to client forms. */
export interface UserOption {
  id: string;
  name: string;
  email?: string;
}

export interface TagOption {
  id: string;
  name: string;
  color: string;
}

export interface FieldDefinitionOption {
  id: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SINGLE_SELECT" | "MULTI_SELECT";
  options: string[];
  required: boolean;
}

export interface FieldValueOption {
  fieldId: string;
  textValue: string | null;
  numberValue: number | null;
  dateValue: string | null;
  boolValue: boolean | null;
  optionValues: string[];
}
