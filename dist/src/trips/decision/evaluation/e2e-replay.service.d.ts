import { TripDecisionEngineService } from '../trip-decision-engine.service';
import { DecisionLogStorageService } from '../services/decision-log-storage.service';
import { E2ECaseStorageService } from './e2e-case-storage.service';
import { E2ECase, E2EReplayResult } from './e2e-case.types';
export declare class E2EReplayService {
    private readonly decisionEngine;
    private readonly logStorage;
    private readonly caseStorage?;
    private readonly logger;
    constructor(decisionEngine: TripDecisionEngineService, logStorage: DecisionLogStorageService, caseStorage?: E2ECaseStorageService);
    loadCase(caseId: string): Promise<E2ECase | null>;
    replay(testCase: E2ECase): Promise<E2EReplayResult>;
    replayAll(cases: E2ECase[]): Promise<E2EReplayResult[]>;
    private buildWorldState;
    private getStartDateForSeason;
}
