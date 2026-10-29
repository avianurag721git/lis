/** Express 5 types `req.params.*` as `string | string[]` — normalize to a single string. */
export const routeParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
};
