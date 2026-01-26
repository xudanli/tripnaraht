// src/trips/readiness/types/packing-template.types.ts

/**
 * 打包清单模板类型定义
 * 基于 packing-checklist-template.json 和 packing-guide.json
 */

export type Season = 'summer' | 'transition' | 'winter';
export type RouteType = 'golden_circle' | 'south_coast' | 'snaefellsnes' | 'full_ring_road' | 'westfjords' | 'highlands' | 'custom';
export type UserType = 'first_timer' | 'photographer' | 'adventurer' | 'family_with_kids' | 'budget_backpacker' | 'cultural_explorer' | 'luxury_traveler';
export type Activity = 'hiking' | 'glacier_trekking' | 'ice_caving' | 'whale_watching' | 'photography' | 'hot_spring' | 'glacier_vehicle' | 'camping';
export type VehicleType = 'compact_car' | 'sedan' | 'suv_2wd' | 'suv_4wd' | 'campervan';
export type SpecialNeed = 'baby' | 'elderly' | 'pet' | 'disabilities' | 'vegetarian';

/**
 * 打包清单上下文参数
 */
export interface PackingListContext {
  season: Season;
  route?: RouteType;
  durationDays: number;
  userType?: UserType;
  activities?: Activity[];
  vehicleType?: VehicleType;
  specialNeeds?: SpecialNeed[];
}

/**
 * 打包清单项（增强版）
 */
export interface EnhancedPackingListItem {
  id: string;
  name: string;
  nameCN?: string;
  category: 'clothing' | 'gear' | 'documents' | 'electronics' | 'food' | 'medical' | 'other';
  quantity: number;
  unit?: string;
  priority: 'must' | 'should' | 'optional';
  reason?: string;
  checked: boolean;
  note?: string;
  
  // 新增字段
  layer?: 'base' | 'mid' | 'outer';
  material?: string;
  brands?: string[];
  priceRange?: string;
  criticalNote?: string;
  whenToWear?: string;
  packingTip?: string;
}

/**
 * 快速清单模板
 */
export interface QuickChecklistTemplate {
  description: string;
  bestFor: string;
  estimatedItems: string;
  items: string[];
  whatToSkip?: string[];
  whatMustNotSkip?: string[];
  criticalReminders?: string[];
}

/**
 * 季节性数量指南
 */
export interface SeasonalQuantityGuide {
  baseLayersNeeded: {
    [key in Season]: {
      [key: string]: string;
    };
  };
  outerLayers: {
    [key: string]: string;
  };
  accessories: {
    [key in Season]: string;
  };
}

/**
 * 打包顺序步骤
 */
export interface PackingOrderStep {
  name: string;
  items?: string[];
  categories?: string[];
  container?: string;
  order?: string[];
  packingTips?: string[];
  why?: string;
  checklist?: string[];
}

/**
 * 出发前检查清单
 */
export interface PreDepartureChecklist {
  oneDayBefore: string[];
  threeHoursBefore: string[];
  thirtyMinutesBefore: string[];
  criticalItemsAbsoluteMustHave: string[];
}

/**
 * 打包清单模板数据
 */
export interface PackingChecklistTemplate {
  metadata: any;
  overview: any;
  context_parameters: any;
  quick_checklist_summer: QuickChecklistTemplate;
  quick_checklist_transition: QuickChecklistTemplate;
  quick_checklist_winter: QuickChecklistTemplate;
  template_by_user_type: any;
  seasonal_quantity_guide: SeasonalQuantityGuide;
  packing_order_steps: any;
  pre_departure_final_checklist: any;
  data_provenance: any;
}

/**
 * 打包指南数据
 */
export interface PackingGuide {
  metadata: any;
  overview: any;
  layering_system: any;
  footwear: any;
  accessories: any;
  pants: any;
  bags: any;
  electronics_protection: any;
  other_essentials: any;
  photography_gear: any;
  swimming_gear: any;
  seasonal_packing_lists: any;
  packing_tips: any;
  what_not_to_bring: any;
  budget_options: any;
  pro_tips: any;
  red_flags: any;
  data_provenance: any;
}
