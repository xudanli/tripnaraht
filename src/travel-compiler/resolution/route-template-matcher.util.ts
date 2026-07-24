import type { RouteTemplateDef, RouteTemplateMatch } from '../contracts/route-resolution.types';
import { getRouteTemplatesForCountry } from '../catalog/is-route-templates.catalog';

export function matchRouteTemplate(
  rawText: string,
  countryCode: string,
): RouteTemplateMatch | undefined {
  const text = rawText.trim();
  if (!text) return undefined;

  for (const template of getRouteTemplatesForCountry(countryCode)) {
    for (const pattern of template.aliases) {
      if (pattern.test(text)) {
        return {
          template,
          matchedText: text,
          confidence: 0.92,
        };
      }
    }
  }

  return undefined;
}

export function inferSlotHintFromText(
  rawText: string,
  countryCode: string,
): 'route' | undefined {
  return matchRouteTemplate(rawText, countryCode) ? 'route' : undefined;
}

export function listRouteTemplates(countryCode: string): RouteTemplateDef[] {
  return getRouteTemplatesForCountry(countryCode);
}
