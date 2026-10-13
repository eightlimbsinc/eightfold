import { describe, expect, it } from "vitest";
import { fieldKeyFromLabel, formatCustomFieldValue, parseCustomFieldValue, type FieldDefinitionLike } from "@/lib/custom-fields";

const def = (type: FieldDefinitionLike["type"], extra: Partial<FieldDefinitionLike> = {}): FieldDefinitionLike => ({
  id: "f1",
  label: "Field",
  type,
  options: [],
  required: false,
  ...extra,
});

describe("parseCustomFieldValue", () => {
  it("treats blank optional values as clearing the field", () => {
    expect(parseCustomFieldValue(def("TEXT"), "  ")).toEqual({ ok: true, value: null });
    expect(parseCustomFieldValue(def("MULTI_SELECT", { options: ["a"] }), [])).toEqual({ ok: true, value: null });
  });

  it("rejects blank required values", () => {
    const r = parseCustomFieldValue(def("TEXT", { required: true, label: "Budget" }), "");
    expect(r).toEqual({ ok: false, error: "Budget is required" });
  });

  it("parses text and enforces length", () => {
    expect(parseCustomFieldValue(def("TEXT"), " hi ")).toMatchObject({ ok: true, value: { textValue: "hi" } });
    expect(parseCustomFieldValue(def("TEXT"), "x".repeat(1001)).ok).toBe(false);
  });

  it("parses numbers including thousands separators", () => {
    expect(parseCustomFieldValue(def("NUMBER"), "1,250.5")).toMatchObject({ ok: true, value: { numberValue: 1250.5 } });
    expect(parseCustomFieldValue(def("NUMBER"), 42)).toMatchObject({ ok: true, value: { numberValue: 42 } });
    expect(parseCustomFieldValue(def("NUMBER"), "abc").ok).toBe(false);
  });

  it("parses strict calendar dates", () => {
    const r = parseCustomFieldValue(def("DATE"), "2026-02-28");
    expect(r.ok && r.value?.dateValue?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(parseCustomFieldValue(def("DATE"), "2026-02-30").ok).toBe(false);
    expect(parseCustomFieldValue(def("DATE"), "02/28/2026").ok).toBe(false);
  });

  it("parses booleans from form values", () => {
    expect(parseCustomFieldValue(def("BOOLEAN"), "on")).toMatchObject({ value: { boolValue: true } });
    expect(parseCustomFieldValue(def("BOOLEAN"), "false")).toMatchObject({ value: { boolValue: false } });
    expect(parseCustomFieldValue(def("BOOLEAN"), "maybe").ok).toBe(false);
  });

  it("validates select options", () => {
    const single = def("SINGLE_SELECT", { options: ["Gold", "Silver"] });
    expect(parseCustomFieldValue(single, "Gold")).toMatchObject({ value: { optionValues: ["Gold"] } });
    expect(parseCustomFieldValue(single, "Bronze").ok).toBe(false);

    const multi = def("MULTI_SELECT", { options: ["SEO", "PPC", "Social"] });
    expect(parseCustomFieldValue(multi, ["SEO", "PPC", "SEO"])).toMatchObject({ value: { optionValues: ["SEO", "PPC"] } });
    expect(parseCustomFieldValue(multi, ["SEO", "TV"]).ok).toBe(false);
  });
});

describe("formatCustomFieldValue", () => {
  it("formats stored values for display", () => {
    expect(formatCustomFieldValue("BOOLEAN", { boolValue: false })).toBe("No");
    expect(formatCustomFieldValue("MULTI_SELECT", { optionValues: ["a", "b"] })).toBe("a, b");
    expect(formatCustomFieldValue("NUMBER", { numberValue: 1234.5 })).toBe("1,234.5");
    expect(formatCustomFieldValue("TEXT", null)).toBe("—");
  });
});

describe("fieldKeyFromLabel", () => {
  it("derives stable keys", () => {
    expect(fieldKeyFromLabel("Annual Budget ($)")).toBe("annual_budget");
    expect(fieldKeyFromLabel("2026 Goals")).toBe("field_2026_goals");
    expect(fieldKeyFromLabel("Café Owner")).toBe("cafe_owner");
  });
});
