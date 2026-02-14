import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { ContextBlock } from '../../agent/context-engine/types/context-package.types';
import { PackStorageService } from '../../trips/readiness/storage/pack-storage.service';
export interface CountryPackGetBlocksInput extends SkillInput {
    packId: string;
    topics: Array<'VISA' | 'DRONE' | 'ROAD_RULES' | 'MONEY' | 'SAFETY' | 'WEATHER_WINDOWS' | 'LOCAL_TRANSPORT' | 'BOOKING_NORMS'>;
    phase?: string;
}
export interface CountryPackGetBlocksOutput extends SkillOutput {
    blocks: ContextBlock[];
    missingTopics: string[];
    packMetadata: {
        packId: string;
        countryCode: string;
        countryName: string;
        version?: string;
    };
}
export declare class CountryPackGetBlocksSkill implements Skill<CountryPackGetBlocksInput, CountryPackGetBlocksOutput> {
    private readonly prisma?;
    private readonly packStorage?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "countryPack";
    };
    constructor(prisma?: PrismaService, packStorage?: PackStorageService);
    execute(input: CountryPackGetBlocksInput): Promise<CountryPackGetBlocksOutput>;
    private addEvidenceToBlock;
    private extractTopicBlock;
    private extractVisaBlock;
    private extractDroneBlock;
    private extractRoadRulesBlock;
    private extractMoneyBlock;
    private extractSafetyBlock;
    private extractWeatherWindowsBlock;
    private extractLocalTransportBlock;
    private extractBookingNormsBlock;
}
