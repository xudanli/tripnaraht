import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { DataSourceRouterService } from '../../data-contracts/services/data-source-router.service';
import { WeatherData, ExtendedWeatherData } from '../../data-contracts/interfaces/weather.interface';
import { IcelandComprehensiveService } from '../../data-contracts/services/iceland-comprehensive.service';
export interface WeatherSearchInput extends SkillInput {
    lat: number;
    lng: number;
    date?: string;
    timezone?: string;
    includeWindDetails?: boolean;
    includeAuroraInfo?: boolean;
    locationName?: string;
}
export interface WeatherSearchOutput extends SkillOutput {
    weather: WeatherData | ExtendedWeatherData;
    evidence_id: string;
    source: string;
    location: {
        lat: number;
        lng: number;
        name?: string;
    };
    query: {
        date?: string;
        timezone?: string;
    };
    impact_assessment?: {
        outdoor_activities?: 'suitable' | 'moderate' | 'unsuitable';
        transportation?: 'normal' | 'delayed' | 'disrupted';
        safety_risks?: Array<{
            type: string;
            severity: 'info' | 'warning' | 'critical';
            description: string;
        }>;
    };
    recommendations?: string[];
}
export declare class WeatherSearchSkill implements Skill<WeatherSearchInput, WeatherSearchOutput> {
    private readonly dataSourceRouter?;
    private readonly icelandComprehensiveService?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
        inputSchema: {
            required: string[];
            typeChecks: {
                lat: {
                    type: "number";
                    min: number;
                    max: number;
                };
                lng: {
                    type: "number";
                    min: number;
                    max: number;
                };
                date: {
                    type: "string";
                    format: "date";
                };
            };
        };
    };
    constructor(dataSourceRouter?: DataSourceRouterService, icelandComprehensiveService?: IcelandComprehensiveService);
    execute(input: WeatherSearchInput): Promise<WeatherSearchOutput>;
    private assessWeatherImpact;
    private generateRecommendations;
}
