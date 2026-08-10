/**
 * 从已绑定 ExperienceDefinition / ProductOffering 装载体验事实。
 * 未绑定不臆造产品（保持 FETCHABLE）。
 */

export type RorExperienceDefinitionLike = {
  id?: string;
  code?: string | null;
  displayNameZh?: string | null;
  displayNameEn?: string | null;
  productType?: string | null;
  categoryCode?: string | null;
  subtypeCode?: string | null;
  typicalDurationMin?: number | null;
  fitnessLevel?: string | null;
  riskLevel?: string | null;
  weatherDependency?: string | null;
  requiresGuide?: boolean | null;
  requiresLicense?: boolean | null;
};

export type RorExperienceProduct = {
  id?: string;
  code?: string | null;
  title: string;
  productType?: string | null;
  categoryCode?: string | null;
  subtypeCode?: string | null;
  typicalDurationMin?: number | null;
  fitnessLevel?: string | null;
  riskLevel?: string | null;
  weatherDependency?: string | null;
  requiresGuide?: boolean;
  requiresLicense?: boolean;
  source: 'EXPERIENCE_DEFINITION';
  itineraryItemId?: string;
};

export function mapExperienceDefinitionToProduct(
  def: RorExperienceDefinitionLike,
  opts?: { itineraryItemId?: string },
): RorExperienceProduct {
  const title =
    def.displayNameZh?.trim() ||
    def.displayNameEn?.trim() ||
    def.code?.trim() ||
    def.id ||
    '体验';
  return {
    id: def.id,
    code: def.code ?? null,
    title: String(title).slice(0, 120),
    productType: def.productType ?? null,
    categoryCode: def.categoryCode ?? null,
    subtypeCode: def.subtypeCode ?? null,
    typicalDurationMin: def.typicalDurationMin ?? null,
    fitnessLevel: def.fitnessLevel ?? null,
    riskLevel: def.riskLevel ?? null,
    weatherDependency: def.weatherDependency ?? null,
    requiresGuide: def.requiresGuide === true,
    requiresLicense: def.requiresLicense === true,
    source: 'EXPERIENCE_DEFINITION',
    itineraryItemId: opts?.itineraryItemId,
  };
}

export function extractExperienceFactsFromDayItems(
  items: Array<{
    id?: string;
    ExperienceDefinition?: RorExperienceDefinitionLike | null;
    experienceDefinition?: RorExperienceDefinitionLike | null;
  }>,
): {
  'experience.product'?: RorExperienceProduct | RorExperienceProduct[];
  'experience.physicalIntensity'?: string | null;
} {
  const products: RorExperienceProduct[] = [];
  for (const item of items) {
    const def = item.ExperienceDefinition ?? item.experienceDefinition;
    if (!def) continue;
    products.push(mapExperienceDefinitionToProduct(def, { itineraryItemId: item.id }));
  }
  if (!products.length) return {};

  const intensities = products
    .map((p) => p.fitnessLevel)
    .filter((x): x is string => !!x && x.trim().length > 0);
  const primary = products.length === 1 ? products[0] : products;

  return {
    'experience.product': primary,
    ...(intensities.length
      ? { 'experience.physicalIntensity': intensities[intensities.length - 1] }
      : {}),
  };
}
