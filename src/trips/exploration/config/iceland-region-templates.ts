import type { RegionTemplate } from '../types/exploration.types';

/** 冰岛区域模板 DSL — 三策略候选共享同一套区域构件 */
export const ICELAND_REGION_TEMPLATE: RegionTemplate = {
  templateId: 'is-exploration-v1',
  destinationCode: 'IS',
  regions: [
    'SOUTH_COAST',
    'GOLDEN_CIRCLE',
    'HIGHLANDS',
    'NORTH_ICELAND',
    'WESTFJORDS',
    'RING_ROAD',
    'REYKJAVIK_BASE',
  ],
  routeSegments: [
    'seg_reykjavik_golden_circle',
    'seg_golden_circle_south_coast',
    'seg_south_coast_vik',
    'seg_vik_jokulsarlon',
    'seg_jokulsarlon_hofn',
    'seg_hofn_egilsstadir',
    'seg_egilsstadir_myvatn',
    'seg_myvatn_akureyri',
    'seg_akureyri_reykjavik',
    'seg_f208_highlands_spur',
  ],
  stayAnchors: [
    'reykjavik',
    'vik',
    'hofn',
    'egilsstadir',
    'myvatn',
    'akureyri',
  ],
};
