import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PlacesService } from '../../places/places.service';
import { EntityResolutionService } from '../../places/services/entity-resolution.service';
export interface PoiSearchInput extends SkillInput {
    query: string;
    limit?: number;
    lat?: number;
    lng?: number;
}
export interface PoiSearchOutput extends SkillOutput {
    pois: Array<{
        poi_id: string;
        name: string;
        nameCN?: string;
        nameEN?: string;
        coordinates?: {
            lat: number;
            lng: number;
        };
        category?: string;
        address?: string;
        evidence_id: string;
    }>;
}
export declare class PoiSearchSkill implements Skill<PoiSearchInput, PoiSearchOutput> {
    private readonly placesService?;
    private readonly entityResolutionService?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
        inputSchema: {
            required: string[];
        };
    };
    constructor(placesService?: PlacesService, entityResolutionService?: EntityResolutionService);
    execute(input: PoiSearchInput): Promise<PoiSearchOutput>;
}
