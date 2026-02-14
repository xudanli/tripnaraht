export type Season = 'summer' | 'transition' | 'winter';
export type RouteType = 'golden_circle' | 'south_coast' | 'snaefellsnes' | 'full_ring_road' | 'westfjords' | 'highlands' | 'custom';
export type UserType = 'first_timer' | 'photographer' | 'adventurer' | 'family_with_kids' | 'budget_backpacker' | 'cultural_explorer' | 'luxury_traveler';
export type Activity = 'hiking' | 'glacier_trekking' | 'ice_caving' | 'whale_watching' | 'photography' | 'hot_spring' | 'glacier_vehicle' | 'camping';
export type VehicleType = 'compact_car' | 'sedan' | 'suv_2wd' | 'suv_4wd' | 'campervan';
export type SpecialNeed = 'baby' | 'elderly' | 'pet' | 'disabilities' | 'vegetarian';
export interface PackingListContext {
    season: Season;
    route?: RouteType;
    durationDays: number;
    userType?: UserType;
    activities?: Activity[];
    vehicleType?: VehicleType;
    specialNeeds?: SpecialNeed[];
}
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
    layer?: 'base' | 'mid' | 'outer';
    material?: string;
    brands?: string[];
    priceRange?: string;
    criticalNote?: string;
    whenToWear?: string;
    packingTip?: string;
}
export interface QuickChecklistTemplate {
    description: string;
    bestFor: string;
    estimatedItems: string;
    items: string[];
    whatToSkip?: string[];
    whatMustNotSkip?: string[];
    criticalReminders?: string[];
}
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
export interface PreDepartureChecklist {
    oneDayBefore: string[];
    threeHoursBefore: string[];
    thirtyMinutesBefore: string[];
    criticalItemsAbsoluteMustHave: string[];
}
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
