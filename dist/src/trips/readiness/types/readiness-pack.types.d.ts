export type SupportedLanguage = 'en' | 'zh';
export type LocalizedString = string | {
    en: string;
    zh?: string;
};
export type SeasonType = 'polar_night' | 'polar_day' | 'shoulder' | 'winter' | 'summer' | 'rainy' | 'dry' | 'hurricane' | 'monsoon' | 'all';
export type ReadinessCategory = 'entry_transit' | 'safety_hazards' | 'health_insurance' | 'gear_packing' | 'activities_bookings' | 'logistics';
export type RuleSeverity = 'low' | 'medium' | 'high';
export type HazardLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type ChecklistCategory = 'documents' | 'clothing' | 'gear' | 'electronics' | 'toiletries' | 'medicine' | 'food' | 'emergency' | 'booking' | 'other';
export type ActionLevel = 'must' | 'should' | 'optional' | 'blocker' | 'could' | 'info';
export type HazardType = 'wildlife' | 'weather_extreme' | 'terrain' | 'crime' | 'healthcare_gap' | 'regulatory' | 'logistics_remote' | 'water_safety' | 'AVALANCHE' | 'WEATHER' | 'TERRAIN' | 'WILDLIFE' | 'VOLCANIC' | 'FLOOD' | 'EARTHQUAKE' | 'TSUNAMI' | 'ROAD' | 'ALTITUDE' | 'COLD' | 'HEAT' | 'UV' | 'WATER' | 'OTHER';
export interface GeoInfo {
    countryCode: string;
    region: string | LocalizedString;
    city: string | LocalizedString;
    lat?: number;
    lng?: number;
}
export interface Source {
    sourceId: string;
    authority: string;
    type: 'pdf' | 'html' | 'api' | 'regulation' | 'manual';
    title?: LocalizedString;
    canonicalUrl?: string;
}
export interface Evidence {
    sourceId: string;
    sectionId?: string;
    quote?: string;
    retrievedAt?: string;
}
export interface Condition {
    all?: Condition[];
    any?: Condition[];
    not?: Condition;
    exists?: string;
    eq?: {
        path: string;
        value: any;
    };
    ne?: {
        path: string;
        value: any;
    };
    gt?: {
        path: string;
        value: number;
    };
    gte?: {
        path: string;
        value: number;
    };
    lt?: {
        path: string;
        value: number;
    };
    lte?: {
        path: string;
        value: number;
    };
    in?: {
        path: string;
        values: any[];
    };
    containsAny?: {
        path: string;
        values: string[];
    };
    geo?: {
        rivers?: {
            nearRiver?: boolean;
            nearestRiverDistanceM?: {
                gt?: number;
                gte?: number;
                lt?: number;
                lte?: number;
            };
            riverCrossingCount?: {
                gt?: number;
                gte?: number;
                lt?: number;
                lte?: number;
            };
            riverDensityScore?: {
                gt?: number;
                gte?: number;
                lt?: number;
                lte?: number;
            };
        };
        mountains?: {
            inMountain?: boolean;
            mountainElevationAvg?: {
                gt?: number;
                gte?: number;
                lt?: number;
                lte?: number;
            };
            terrainComplexity?: {
                gt?: number;
                gte?: number;
                lt?: number;
                lte?: number;
            };
            hasMountainPass?: boolean;
        };
        roads?: {
            nearRoad?: boolean;
            roadDensityScore?: {
                gt?: number;
                gte?: number;
                lt?: number;
                lte?: number;
            };
            hasMountainPass?: boolean;
        };
        coastlines?: {
            nearCoastline?: boolean;
            isCoastalArea?: boolean;
        };
        pois?: {
            hasHarbour?: boolean;
            hasEVCharger?: boolean;
            hasFerryTerminal?: boolean;
            supplyDensity?: {
                gt?: number;
                gte?: number;
                lt?: number;
                lte?: number;
            };
            hasCheckpoint?: boolean;
            safety?: {
                hasHospital?: boolean;
                hasPolice?: boolean;
            };
            supply?: {
                hasFuel?: boolean;
                hasSupermarket?: boolean;
            };
        };
        altitude_m?: {
            gt?: number;
            gte?: number;
            lt?: number;
            lte?: number;
        };
        fuelDensity?: {
            gt?: number;
            gte?: number;
            lt?: number;
            lte?: number;
        };
        checkpointCount?: {
            gt?: number;
            gte?: number;
            lt?: number;
            lte?: number;
        };
        mountainPassCount?: {
            gt?: number;
            gte?: number;
            lt?: number;
            lte?: number;
        };
        oxygenStationCount?: {
            gt?: number;
            gte?: number;
            lt?: number;
            lte?: number;
        };
        latitude?: {
            gt?: number;
            gte?: number;
            lt?: number;
            lte?: number;
        };
        longitude?: {
            gt?: number;
            gte?: number;
            lt?: number;
            lte?: number;
        };
    };
}
export interface Task {
    title: LocalizedString;
    dueOffsetDays?: number;
    tags?: string[];
}
export type QuestionType = 'yes_no' | 'multiple_choice' | 'single_choice' | 'text' | 'number' | 'date' | 'rating';
export interface QuestionOption {
    value: string;
    label: LocalizedString;
    description?: LocalizedString;
}
export interface UserQuestion {
    id: string;
    type: QuestionType;
    question: LocalizedString;
    description?: LocalizedString;
    required?: boolean;
    options?: QuestionOption[];
    placeholder?: LocalizedString;
    validation?: {
        min?: number;
        max?: number;
        pattern?: string;
        message?: LocalizedString;
    };
}
export interface DecisionBranch {
    condition: {
        questionId: string;
        operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
        value: any;
    };
    then: {
        level?: ActionLevel;
        message?: LocalizedString;
        tasks?: Task[];
        blockTrip?: boolean;
        additionalQuestions?: UserQuestion[];
    };
}
export interface QuestionGroup {
    id: string;
    title: LocalizedString;
    description?: LocalizedString;
    questionIds: string[];
    order?: number;
}
export interface UserDecision {
    questions: UserQuestion[];
    groups?: QuestionGroup[];
    branches?: DecisionBranch[];
    defaultBranch?: {
        level?: ActionLevel;
        message?: LocalizedString;
        tasks?: Task[];
        blockTrip?: boolean;
    };
    askUser?: LocalizedString[];
}
export interface Action {
    level: ActionLevel;
    message: LocalizedString;
    tasks?: Task[];
    askUser?: LocalizedString[];
    userDecision?: UserDecision;
}
export interface Rule {
    id: string;
    category: ReadinessCategory;
    severity: RuleSeverity;
    title?: LocalizedString;
    description?: LocalizedString;
    message?: string | LocalizedString;
    seasons?: SeasonType[];
    required?: boolean;
    tasks?: Task[];
    appliesTo?: {
        seasons?: SeasonType[];
        activities?: string[];
        travelerTags?: string[];
    };
    when?: Condition;
    then: Action;
    evidence?: Evidence[];
    notes?: LocalizedString;
    userDecision?: UserDecision;
}
export interface Checklist {
    id: string;
    category: ReadinessCategory;
    title?: LocalizedString;
    description?: LocalizedString;
    required?: boolean;
    priority?: number;
    checklistCategory?: ChecklistCategory;
    appliesToSeasons?: SeasonType[];
    items: LocalizedString[];
}
export interface Hazard {
    type: HazardType;
    severity: RuleSeverity;
    summary: LocalizedString;
    mitigations: LocalizedString[];
    zoneId?: string;
    level?: HazardLevel;
    seasons?: SeasonType[];
    metadata?: {
        description?: LocalizedString;
        schedule?: string;
        affectedAreas?: string[];
        precautions?: LocalizedString[];
        [key: string]: unknown;
    };
}
export interface PackingTemplateData {
    packingTemplate?: {
        version?: string;
        lastUpdated?: string;
        data: any;
    };
    packingGuide?: {
        version?: string;
        lastUpdated?: string;
        data: any;
    };
}
export interface ReadinessPack {
    packId: string;
    destinationId: string;
    displayName: LocalizedString;
    version: string;
    lastReviewedAt: string;
    geo: GeoInfo;
    supportedSeasons: SeasonType[];
    sources?: Source[];
    rules: Rule[];
    checklists: Checklist[];
    hazards?: Hazard[];
    packing?: PackingTemplateData;
}
