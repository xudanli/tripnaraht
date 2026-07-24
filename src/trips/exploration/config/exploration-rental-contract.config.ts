/** 冰岛探索 — 租车合同默认（供应商模板基线，非具体订单） */

export const ICELAND_KEF_COUNTER_HOURS = {
  open: '08:00',
  close: '18:00',
  timezone: 'Atlantic/Reykjavik',
} as const;

export const ICELAND_DEFAULT_PICKUP_LOCATION = 'KEF';

/** 2WD 常见合同条款：禁止 F 路（高地） */
export const ICELAND_2WD_DEFAULT_PROHIBITED_ROAD_CLASSES = ['F_ROAD'] as const;
