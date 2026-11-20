export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "datetime-local" | "textarea" | "checkbox";
  value?: string;
  optional?: boolean;
  max?: number;
  options?: { value: string; label: string }[];
};
