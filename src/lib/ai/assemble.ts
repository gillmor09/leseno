/**
 * Fills `{{placeholder}}` tokens in prompt templates.
 * Unknown keys stay as-is so misconfigured templates are easier to spot.
 */

export function fillPromptTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, key: string) => {
    const value = values[key];
    if (value === undefined || value === null) {
      return match;
    }
    return String(value);
  });
}
