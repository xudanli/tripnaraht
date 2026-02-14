import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PlacesService } from '../../places/places.service';
export interface OpeningHoursGetInput extends SkillInput {
    poi_ids: string[];
}
export interface OpeningHoursGetOutput extends SkillOutput {
    opening_hours: Array<{
        poi_id: string;
        opening_hours?: any;
        is_open_now?: boolean;
        evidence_id: string;
    }>;
}
export declare class OpeningHoursGetSkill implements Skill<OpeningHoursGetInput, OpeningHoursGetOutput> {
    private readonly placesService?;
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
    constructor(placesService?: PlacesService);
    execute(input: OpeningHoursGetInput): Promise<OpeningHoursGetOutput>;
}
