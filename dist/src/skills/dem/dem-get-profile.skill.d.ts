import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { DEMElevationService } from '../../trips/dem/services/dem-elevation.service';
import { DEMEffortMetadataService } from '../../trips/dem/services/dem-effort-metadata.service';
export interface DemGetProfileInput extends SkillInput {
    polyline: Array<{
        lat: number;
        lng: number;
    }>;
    samples?: number;
}
export interface DemGetProfileOutput extends SkillOutput {
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
}
export declare class DemGetProfileSkill implements Skill<DemGetProfileInput, DemGetProfileOutput> {
    private readonly demElevationService;
    private readonly demEffortMetadataService;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "dem";
        toolGroup: "DOMAIN";
        inputSchema: {
            required: string[];
        };
    };
    constructor(demElevationService: DEMElevationService, demEffortMetadataService: DEMEffortMetadataService);
    execute(input: DemGetProfileInput): Promise<DemGetProfileOutput>;
}
