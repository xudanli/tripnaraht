import type { HikingTrailDetail } from '../../route-directions/types/hiking-trail-detail.types';

export type HikingPermitSeed = NonNullable<HikingTrailDetail['permits']>[number];

/** 朗格迈维卢尔满配 — 与 prep / 运营 override 对齐 */
export const LAUGAVEGUR_PERMITS: HikingPermitSeed[] = [
  {
    id: 'fi-hut',
    nameCN: 'FÍ 山屋预订',
    name: 'FÍ hut booking',
    titleZh: 'FÍ 山屋预订',
    required: true,
    bookingUrl: 'https://www.fi.is',
    noteZh: '夏季山屋紧俏，建议提前数周预订',
  },
  {
    id: 'safe-is-register',
    nameCN: 'safe.is 行程登记',
    name: 'safe.is trip registration',
    titleZh: 'safe.is 行程登记',
    required: true,
    noteZh: '出发前在 safe.is 登记行程与紧急联系人',
  },
];

/** 冰岛其它高地/徒步线默认许可模板 */
export const IS_HIGHLAND_PERMITS: HikingPermitSeed[] = [
  ...LAUGAVEGUR_PERMITS,
  {
    id: 'highland-bus',
    nameCN: '高地巴士/接驳预订',
    name: 'Highland bus transfer',
    titleZh: '高地巴士/接驳预订',
    required: false,
    noteZh: 'Landmannalaugar / Þórsmörk 夏季班次有限，建议提前购票',
  },
];

/** 尼泊尔徒步线示例 */
export const NEPAL_TREK_PERMITS: HikingPermitSeed[] = [
  {
    id: 'sagarmatha-permit',
    nameCN: '萨加玛塔国家公园许可',
    name: 'Sagarmatha National Park permit',
    titleZh: '萨加玛塔国家公园许可',
    required: true,
    noteZh: '进入 EBC 区域需在检查站购买 TIMS/公园许可',
  },
  {
    id: 'tea-house-booking',
    nameCN: '茶屋/向导预订（建议）',
    name: 'Tea house / guide booking',
    titleZh: '茶屋/向导预订（建议）',
    required: false,
    noteZh: '旺季 Lukla–Namche 段住宿紧张',
  },
];
