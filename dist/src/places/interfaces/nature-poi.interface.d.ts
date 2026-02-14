export type DataSource = 'osm' | 'iceland_lmi' | 'iceland_nsi' | 'manual';
export type GeometryType = 'point' | 'polygon' | 'line';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type AccessType = 'drive' | 'hike' | '4x4' | 'guided_only' | 'boat' | 'unknown';
export type HazardLevel = 'low' | 'medium' | 'high' | 'extreme' | 'unknown';
export interface Coordinates {
    lat: number;
    lng: number;
}
export interface PoiName {
    primary: string;
    local?: string;
    en?: string;
    zh?: string;
}
export interface StayDurationSuggestion {
    minMinutes: number;
    maxMinutes: number;
    recommendedMinutes: number;
}
export interface BasePoi {
    id: string;
    externalId?: string;
    externalSource: DataSource;
    geometryType: GeometryType;
    coordinates: Coordinates;
    bbox?: [number, number, number, number];
    name: PoiName;
    countryCode: string;
    region?: string;
    mainCategory: 'nature' | 'culture' | 'city' | 'activity' | 'accommodation' | 'transport';
    subCategory: string;
    tags?: string[];
    rawProperties?: Record<string, any>;
}
export type IcelandNatureSubCategory = 'volcano' | 'lava_field' | 'geothermal_area' | 'hot_spring' | 'glacier' | 'glacier_lagoon' | 'waterfall' | 'canyon' | 'crater_lake' | 'black_sand_beach' | 'sea_cliff' | 'national_park' | 'nature_reserve' | 'viewpoint' | 'cave' | 'coastline' | 'other';
export interface IcelandNaturePoi extends BasePoi {
    mainCategory: 'nature';
    subCategory: IcelandNatureSubCategory;
    elevationMeters?: number;
    typicalStay?: StayDurationSuggestion;
    bestSeasons?: Season[];
    bestTimeOfDay?: ('sunrise' | 'morning' | 'noon' | 'afternoon' | 'sunset' | 'night')[];
    accessType?: AccessType;
    trailDifficulty?: ('easy' | 'moderate' | 'hard' | 'expert' | 'unknown');
    requiresGuide?: boolean;
    hazardLevel?: HazardLevel;
    safetyNotes?: string[];
    lastEruptionYear?: number;
    isActiveVolcano?: boolean;
    protectedAreaName?: string;
}
export interface NaraHint {
    narrativeSeed?: string;
    actionHint?: string;
    reflectionHint?: string;
    anchorHint?: string;
}
export interface IcelandNaturePoiWithNara extends IcelandNaturePoi {
    nara?: NaraHint;
}
export interface ActivityName {
    chinese?: string;
    english?: string;
    local?: string;
}
export interface ActivityPoiRef {
    source: DataSource;
    externalId?: string;
    subCategory?: string;
    confidence?: number;
}
export interface ActivityDetails {
    name?: ActivityName;
    address?: string;
    coordinates?: Coordinates;
    poiRef?: ActivityPoiRef;
    tags?: string[];
    naraHint?: NaraHint;
}
export interface TimeSlotActivity {
    time: string;
    title: string;
    activity: string;
    type: string;
    durationMinutes?: number;
    coordinates?: Coordinates;
    notes?: string;
    details?: ActivityDetails;
}
export interface MapOptions {
    time?: string;
    template?: 'photoStop' | 'shortWalk' | 'halfDayHike';
    language?: 'zh-CN' | 'en';
}
