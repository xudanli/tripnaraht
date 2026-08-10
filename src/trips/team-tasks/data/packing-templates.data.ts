import type {
  PackingTemplateDetail,
  PackingTemplateSummary,
} from '../types/team-tasks.types';

type PackingTemplateSeed = PackingTemplateSummary & {
  items: PackingTemplateDetail['items'];
};

const ICELAND_SUMMER: PackingTemplateSeed = {
  id: 'iceland_summer_v1',
  titleZh: '冰岛自驾 · 夏季',
  subtitleZh: '雨衣、转换插头、身份证复印件等',
  destinationCodes: ['IS'],
  seasonTags: ['summer'],
  itemCount: 0,
  items: [
    { id: 'rain_jacket', titleZh: '防风防水外套', categoryZh: '衣物', recommended: true },
    { id: 'layers', titleZh: '抓绒 / 薄羽绒层', categoryZh: '衣物', recommended: true },
    { id: 'waterproof_pants', titleZh: '防水裤', categoryZh: '衣物', recommended: false },
    { id: 'hiking_shoes', titleZh: '徒步鞋', categoryZh: '鞋履', recommended: true },
    { id: 'eu_adapter', titleZh: '欧标转换插头', categoryZh: '电子', recommended: true },
    { id: 'power_bank', titleZh: '充电宝', categoryZh: '电子', recommended: true },
    { id: 'idp_copy', titleZh: '国际驾照 + 身份证复印件', categoryZh: '证件', recommended: true },
    { id: 'passport', titleZh: '护照 / 签证材料', categoryZh: '证件', recommended: true },
    { id: 'car_docs', titleZh: '租车订单与保险凭证', categoryZh: '证件', recommended: true },
    { id: 'sunglasses', titleZh: '墨镜', categoryZh: '配件', recommended: true },
    { id: 'sunscreen', titleZh: '防晒霜', categoryZh: '个护', recommended: true },
    { id: 'lip_balm', titleZh: '润唇膏', categoryZh: '个护', recommended: false },
    { id: 'thermos', titleZh: '保温杯', categoryZh: '出行', recommended: false },
    { id: 'snacks', titleZh: '路上零食 / 能量棒', categoryZh: '出行', recommended: false },
    { id: 'cash_card', titleZh: '备用现金 / 银行卡', categoryZh: '财务', recommended: true },
    { id: 'meds', titleZh: '常用药与创可贴', categoryZh: '健康', recommended: true },
    { id: 'swimwear', titleZh: '泳衣（温泉）', categoryZh: '活动', recommended: true },
    { id: 'quick_towel', titleZh: '速干毛巾', categoryZh: '活动', recommended: false },
  ],
};

const ICELAND_WINTER: PackingTemplateSeed = {
  id: 'iceland_winter_v1',
  titleZh: '冰岛自驾 · 冬季',
  subtitleZh: '防寒层、钉鞋套、车载铲雪工具提醒等',
  destinationCodes: ['IS'],
  seasonTags: ['winter'],
  itemCount: 0,
  items: [
    { id: 'winter_parka', titleZh: '防寒羽绒服', categoryZh: '衣物', recommended: true },
    { id: 'base_layers', titleZh: '保暖内衣套装', categoryZh: '衣物', recommended: true },
    { id: 'wool_socks', titleZh: '羊毛袜', categoryZh: '衣物', recommended: true },
    { id: 'winter_boots', titleZh: '防滑冬靴', categoryZh: '鞋履', recommended: true },
    { id: 'ice_grips', titleZh: '冰爪 / 鞋套', categoryZh: '鞋履', recommended: true },
    { id: 'gloves_hat', titleZh: '手套与帽子', categoryZh: '配件', recommended: true },
    { id: 'eu_adapter', titleZh: '欧标转换插头', categoryZh: '电子', recommended: true },
    { id: 'power_bank', titleZh: '充电宝（寒冷备用）', categoryZh: '电子', recommended: true },
    { id: 'idp_copy', titleZh: '国际驾照 + 身份证复印件', categoryZh: '证件', recommended: true },
    { id: 'passport', titleZh: '护照 / 签证材料', categoryZh: '证件', recommended: true },
    { id: 'car_docs', titleZh: '租车订单与保险凭证', categoryZh: '证件', recommended: true },
    { id: 'headlamp', titleZh: '头灯', categoryZh: '出行', recommended: true },
    { id: 'thermos', titleZh: '保温杯', categoryZh: '出行', recommended: true },
    { id: 'cash_card', titleZh: '备用现金 / 银行卡', categoryZh: '财务', recommended: true },
    { id: 'meds', titleZh: '常用药与创可贴', categoryZh: '健康', recommended: true },
    { id: 'swimwear', titleZh: '泳衣（温泉）', categoryZh: '活动', recommended: true },
  ],
};

const GENERIC_TRAVEL: PackingTemplateSeed = {
  id: 'generic_travel_v1',
  titleZh: '通用出行',
  subtitleZh: '证件、充电、常用药等基础清单',
  destinationCodes: [],
  seasonTags: [],
  itemCount: 0,
  items: [
    { id: 'passport', titleZh: '护照 / 身份证', categoryZh: '证件', recommended: true },
    { id: 'tickets', titleZh: '机票 / 车票确认单', categoryZh: '证件', recommended: true },
    { id: 'charger', titleZh: '充电器与数据线', categoryZh: '电子', recommended: true },
    { id: 'power_bank', titleZh: '充电宝', categoryZh: '电子', recommended: true },
    { id: 'adapter', titleZh: '转换插头', categoryZh: '电子', recommended: true },
    { id: 'toiletries', titleZh: '洗漱用品', categoryZh: '个护', recommended: true },
    { id: 'meds', titleZh: '常用药', categoryZh: '健康', recommended: true },
    { id: 'cash_card', titleZh: '银行卡 / 少量现金', categoryZh: '财务', recommended: true },
  ],
};

function withCount(seed: PackingTemplateSeed): PackingTemplateSeed {
  return { ...seed, itemCount: seed.items.length };
}

const ALL_TEMPLATES: PackingTemplateSeed[] = [
  withCount(ICELAND_SUMMER),
  withCount(ICELAND_WINTER),
  withCount(GENERIC_TRAVEL),
];

export function listPackingTemplates(
  destinationHint?: string | null,
): PackingTemplateSummary[] {
  const codes = inferDestinationCodes(destinationHint);
  const matched = ALL_TEMPLATES.filter((t) => {
    if (t.destinationCodes.length === 0) return true;
    return t.destinationCodes.some((c) => codes.includes(c));
  });
  const list = matched.length > 0 ? matched : [withCount(GENERIC_TRAVEL)];
  return list.map(({ items: _items, ...summary }) => summary);
}

export function getPackingTemplate(
  templateId: string,
): PackingTemplateDetail | null {
  const found = ALL_TEMPLATES.find((t) => t.id === templateId);
  if (!found) return null;
  return {
    id: found.id,
    titleZh: found.titleZh,
    items: found.items,
  };
}

function inferDestinationCodes(hint?: string | null): string[] {
  if (!hint) return [];
  const s = hint.trim().toLowerCase();
  if (
    s === 'is' ||
    s.includes('iceland') ||
    s.includes('冰岛') ||
    s.includes('reykjav')
  ) {
    return ['IS'];
  }
  return [];
}
