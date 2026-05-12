/**
 * World Mutation Command — 用户直接编辑世界前提（非改 plan 文案）
 */

export type WorldCommand =
  | {
      readonly type: 'BLOCK_ROAD';
      readonly roadId: string;
      readonly affectedSlotIds?: readonly string[];
      readonly affectedPoiIds?: readonly string[];
    }
  | {
      readonly type: 'UNBLOCK_ROAD';
      readonly roadId: string;
      readonly affectedSlotIds?: readonly string[];
      readonly affectedPoiIds?: readonly string[];
    }
  | {
      readonly type: 'AVOID_WEATHER';
      /** MVP：与天气字段 id 对齐，通常为日历日 ISODate */
      readonly regionOrDateId: string;
    }
  | {
      readonly type: 'LOCK_POI';
      readonly poiId: string;
    }
  | {
      readonly type: 'ADD_DRIVING_CONSTRAINT';
      readonly constraint: {
        readonly maxMountainRoadRatio: number;
      };
    };
