import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { E2EReplayService } from '../../trips/decision/evaluation/e2e-replay.service';
import { E2ECaseInput, UserProfile } from '../../trips/decision/evaluation/e2e-case.types';
import { DecisionLogEntry } from '../../trips/decision/shared/decision-result.types';
export interface DecisionReplayInput extends BaseSkillInput {
    caseId?: string;
    testCase?: {
        id: string;
        name: string;
        description: string;
        input: E2ECaseInput;
        expected?: {
            routeDirectionId?: string;
            routeDirectionTags?: string[];
            abuExpected?: {
                action: 'ALLOW' | 'REJECT';
                reasonCodes?: string[];
                violations?: string[];
            };
            drdreExpected?: {
                mustAdjust: boolean;
                adjustmentTypes?: ('SPLIT_DAY' | 'BUFFER_DAY' | 'ADJUST_PACE')[];
            };
            neptuneExpected?: {
                mustRepair: boolean;
                replacementTypes?: ('ENTRY' | 'POI' | 'SEGMENT')[];
            };
            finalState: {
                allowed: boolean;
                planDays?: number;
            };
        };
    };
    inputs?: {
        tripId?: string;
        countryCode: string;
        userProfile: UserProfile;
        season?: number;
        userQuery?: string;
    };
    expectedLogs?: DecisionLogEntry[];
}
export interface DecisionReplayOutput extends SkillOutput {
    actual: {
        logs: DecisionLogEntry[];
        finalPlan?: {
            days: number;
            allowed: boolean;
        };
        routeDirectionId?: string;
    };
    diff?: {
        hasDiff: boolean;
        logDiffs?: Array<{
            expected: DecisionLogEntry;
            actual: DecisionLogEntry;
            diff: string;
        }>;
        finalStateDiff?: string;
        abuDiff?: string[];
        drdreDiff?: string[];
        neptuneDiff?: string[];
        routeDirectionDiff?: string;
    };
    passed: boolean;
    executionTime: number;
    case?: {
        id: string;
        name: string;
        description: string;
    };
}
export declare class DecisionReplaySkill implements Skill<DecisionReplayInput, DecisionReplayOutput> {
    private readonly e2eReplayService?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "decision";
    };
    constructor(e2eReplayService?: E2EReplayService);
    execute(input: DecisionReplayInput): Promise<DecisionReplayOutput>;
}
