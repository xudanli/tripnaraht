export type GearChecklistItem = {
  id: string;
  category: 'safety' | 'clothing' | 'camping' | 'navigation' | 'food';
  labelZh: string;
  labelEn: string;
  required: boolean;
};

/** 冰岛 Laugavegur 样板间装备核对清单 */
export const LAUGAVEGUR_GEAR_CHECKLIST: GearChecklistItem[] = [
  { id: 'boots', category: 'clothing', labelZh: '防水高帮徒步靴', labelEn: 'Waterproof hiking boots', required: true },
  { id: 'rain', category: 'clothing', labelZh: '硬壳冲锋衣裤', labelEn: 'Hard shell jacket & pants', required: true },
  { id: 'warm', category: 'clothing', labelZh: '保暖中层 + 羽绒', labelEn: 'Insulation mid-layer & down', required: true },
  { id: 'plb', category: 'safety', labelZh: '卫星通讯 / PLB', labelEn: 'Satellite messenger or PLB', required: true },
  { id: 'map', category: 'navigation', labelZh: '离线地图 + GPS', labelEn: 'Offline map & GPS', required: true },
  { id: 'sleep', category: 'camping', labelZh: '睡袋（0°C 舒适温标）', labelEn: 'Sleeping bag (0°C comfort)', required: true },
  { id: 'tent', category: 'camping', labelZh: '帐篷（若无山屋预订）', labelEn: 'Tent (if no hut booking)', required: false },
  { id: 'food', category: 'food', labelZh: '4 日高热量口粮', labelEn: '4-day high-calorie trail food', required: true },
  { id: 'water', category: 'safety', labelZh: '净水片 / 滤水器', labelEn: 'Water purification', required: true },
];
