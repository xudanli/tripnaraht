/**
 * POI 体验分类与感官能量层级（curator + align 共用）
 */

export type ExperiencePoiCategory =
  | 'waterfall'
  | 'beach_coast'
  | 'glacier_ice'
  | 'museum_indoor'
  | 'hotspring_spa'
  | 'town_stroll'
  | 'hike_outdoor'
  | 'food_cafe'
  | 'scenic_drive'
  | 'other';

export type SensoryEnergyLevel = 'high' | 'medium' | 'low';

const CATEGORY_PATTERNS: Array<{ cat: ExperiencePoiCategory; re: RegExp }> = [
  { cat: 'waterfall', re: /瀑布|foss|fall/i },
  { cat: 'beach_coast', re: /沙滩|海滩|黑沙|vik|海岸|coast|beach|雅丹/i },
  { cat: 'glacier_ice', re: /冰川|冰洞|冰河湖|jökull|glacier/i },
  { cat: 'museum_indoor', re: /博物馆|展馆|室内|museum/i },
  { cat: 'hotspring_spa', re: /温泉|spa|蓝湖|blue lagoon/i },
  { cat: 'town_stroll', re: /小镇|村镇|街区|手作|咖啡馆|咖啡|café/i },
  { cat: 'hike_outdoor', re: /徒步|登山|trail|峡谷/i },
  { cat: 'food_cafe', re: /餐厅|美食|meal|午餐/i },
  { cat: 'scenic_drive', re: /观景|景观路|scenic|一号公路|ring road/i },
];

const ENERGY_MAP: Record<ExperiencePoiCategory, SensoryEnergyLevel> = {
  glacier_ice: 'high',
  beach_coast: 'high',
  hike_outdoor: 'high',
  waterfall: 'medium',
  scenic_drive: 'medium',
  other: 'medium',
  museum_indoor: 'low',
  hotspring_spa: 'low',
  town_stroll: 'low',
  food_cafe: 'low',
};

export function classifyPoiExperienceCategory(name: string, notes?: string): ExperiencePoiCategory {
  const text = `${name} ${notes ?? ''}`;
  for (const { cat, re } of CATEGORY_PATTERNS) {
    if (re.test(text)) return cat;
  }
  return 'other';
}

export function poiSensoryEnergy(name: string, notes?: string): SensoryEnergyLevel {
  return ENERGY_MAP[classifyPoiExperienceCategory(name, notes)];
}

export function isGoldenHourViewpoint(name: string, notes?: string): boolean {
  const cat = classifyPoiExperienceCategory(name, notes);
  return cat === 'beach_coast' || cat === 'scenic_drive' || /日落|日出|落日|晚霞|极光|aurora/i.test(`${name} ${notes ?? ''}`);
}
