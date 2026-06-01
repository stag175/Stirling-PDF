/**
 * Shared field type metadata: icons and color mappings.
 * Used by FormFill, FormFieldSidebar, and any future form tools.
 *
 * Icons are bare material-symbols name strings, rendered via the shared
 * LocalIcon component at the call site.
 */
import type { FormFieldType } from "@app/tools/formFill/types";

export const FIELD_TYPE_ICON: Record<FormFieldType, string> = {
  text: "text-fields-rounded",
  checkbox: "check-box-rounded",
  combobox: "arrow-drop-down-circle-rounded",
  listbox: "list-rounded",
  radio: "radio-button-checked",
  button: "draw-rounded",
  signature: "draw-rounded",
};

export const FIELD_TYPE_COLOR: Record<FormFieldType, string> = {
  text: "blue",
  checkbox: "green",
  combobox: "violet",
  listbox: "cyan",
  radio: "orange",
  button: "gray",
  signature: "pink",
};
