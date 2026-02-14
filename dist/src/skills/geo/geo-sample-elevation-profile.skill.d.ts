import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { DemGetProfileSkill } from '../dem/dem-get-profile.skill';
export interface GeoSampleElevationProfileInput extends BaseSkillInput {
    polyline: Array<{
        lat: number;
        lng: number;
    }>;
    samplingInterval?: number;
    maxSamples?: number;
}
export interface GeoSampleElevationProfileOutput extends SkillOutput {
    elevationProfile: Array<{
        distance: number;
        lat: number;
        lng: number;
        elevation: number;
        slope: number;
        cumulativeAscent: number;
    }>;
    cumulativeAscent: number;
    maxSlope: number;
    fatigueIndex: number;
    summary: {
        totalSamples: number;
        samplingInterval: number;
        totalDistance: number;
        queryTime: number;
    };
}
export declare class GeoSampleElevationProfileSkill implements Skill<GeoSampleElevationProfileInput, GeoSampleElevationProfileOutput> {
    private readonly demGetProfileSkill?;
    private readonly logger;
    private readonly MAX_SAMPLING_INTERVAL;
    private readonly MAX_SAMPLES;
    private readonly DEFAULT_SAMPLING_INTERVAL;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "dem";
    };
    constructor(demGetProfileSkill?: DemGetProfileSkill);
    execute(input: GeoSampleElevationProfileInput): Promise<GeoSampleElevationProfileOutput>;
    private estimateRouteLength;
    private haversineDistance;
    private toRadians;
}
