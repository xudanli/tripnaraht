export interface TerrainProfile {
    avgElevation: number;
    elevationRange: {
        min: number;
        max: number;
    };
    typicalSlope: number;
    totalAscent?: number;
    totalDescent?: number;
    difficultyLevel?: 'EASY' | 'MODERATE' | 'CHALLENGING' | 'EXTREME';
}
export interface RiskProfileExplainer {
    altitude: {
        level: 'none' | 'low' | 'medium' | 'high';
        maxElevation: number;
        daysAbove3000m?: number;
        description?: string;
    };
    weather: {
        level: 'stable' | 'variable' | 'unpredictable' | 'extreme';
        weatherWindow?: boolean;
        weatherWindowMonths?: number[];
        description?: string;
    };
    isolation: {
        level: 'urban' | 'accessible' | 'remote' | 'very_remote';
        nearestHospitalKm?: number;
        cellCoverage?: 'good' | 'partial' | 'poor' | 'none';
        description?: string;
    };
    other?: {
        roadClosure?: boolean;
        ferryDependent?: boolean;
        permitRequired?: boolean;
        guideRequired?: boolean;
        [key: string]: any;
    };
}
export interface RouteDirectionExplainer {
    id: number;
    uuid: string;
    title: string;
    titleCN: string;
    tagline: string;
    description: string;
    suitableFor: string[];
    notSuitableFor: string[];
    bestMonths: number[];
    avoidMonths?: number[];
    terrainProfile: TerrainProfile;
    riskProfile: RiskProfileExplainer;
    keywords?: string[];
    culturalHighlights?: string[];
    signatureExperiences?: string[];
    typicalDuration?: {
        min: number;
        max: number;
        recommended: number;
    };
    entryPoints?: string[];
    exitPoints?: string[];
    metadata?: {
        version?: string;
        lastUpdated?: string;
        source?: string;
        [key: string]: any;
    };
}
