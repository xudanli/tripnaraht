/**
 * Minimal, safe template renderer for Narrator hints.
 *
 * Supported syntax:
 * - `{{var}}` where var is [a-zA-Z0-9_]+
 * - `{{a.b.c}}` dot-path lookup into nested objects
 * - Unknown variables are left as-is.
 * - Values are stringified.
 */

export type TemplateVars =
  | Record<string, string | number | boolean | null | undefined>
  | Record<string, any>;

export function renderTemplate(template: string, vars: TemplateVars): string {
  const src = String(template ?? '');
  if (!src.includes('{{')) return src;
  return src.replace(/\{\{\s*([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)\s*\}\}/g, (m, key) => {
    const path = String(key).split('.').filter(Boolean);
    let cur: any = vars as any;
    for (const p of path) {
      if (cur == null) return m;
      cur = cur[p];
    }
    if (cur === undefined || cur === null) return m;
    return String(cur);
  });
}

