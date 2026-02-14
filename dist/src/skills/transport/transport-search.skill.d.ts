import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { TransportRoutingService } from '../../transport/transport-routing.service';
import { EntityResolutionService } from '../../places/services/entity-resolution.service';
export interface TransportSearchInput extends SkillInput {
    origin: string | {
        lat: number;
        lng: number;
    };
    destination: string | {
        lat: number;
        lng: number;
    };
    mode?: 'walk' | 'drive' | 'transit' | 'mixed';
}
export interface TransportSearchOutput extends SkillOutput {
    evidence_id: string;
    origin: string | {
        lat: number;
        lng: number;
    };
    destination: string | {
        lat: number;
        lng: number;
    };
    options: Array<{
        mode: string;
        duration_minutes: number;
        distance_meters?: number;
        steps?: any[];
    }>;
    best_option?: {
        mode: string;
        duration_minutes: number;
        distance_meters?: number;
    };
}
export declare class TransportSearchSkill implements Skill<TransportSearchInput, TransportSearchOutput> {
    private readonly transportRoutingService?;
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
    constructor(transportRoutingService?: TransportRoutingService, entityResolutionService?: EntityResolutionService);
    execute(input: TransportSearchInput): Promise<TransportSearchOutput>;
}
