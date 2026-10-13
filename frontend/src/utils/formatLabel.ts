/** Turn snake_case keys (e.g. TENANT_ADMIN, operations_console) into readable labels. */
export const formatLabelKey = (key: string): string =>
  key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
