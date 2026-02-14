import { ModuleRef } from '@nestjs/core';
import { AbuStrategy } from '../strategies/abu-strategy.service';
import { DrDreStrategy } from '../strategies/dr-dre-strategy.service';
import { NeptuneStrategy } from '../strategies/neptune-strategy.service';
import { WorldModelContext, RoutePlanDraft } from '../shared/world-model.types';
import { DecisionLogEntry } from '../shared/decision-result.types';
import { DecisionLogStorageService } from './decision-log-storage.service';
export interface StrategyOrchestrationResult {
    plan: RoutePlanDraft | null;
    logs: DecisionLogEntry[];
    allowed: boolean;
    finalAction: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
}
export declare class StrategyOrchestratorService {
    private readonly abu;
    private readonly dre;
    private readonly nep;
    private readonly logStorage;
    private readonly moduleRef;
    private readonly logger;
    private contextEngineer?;
    private skillsRegistry?;
    constructor(abu: AbuStrategy, dre: DrDreStrategy, nep: NeptuneStrategy, logStorage: DecisionLogStorageService, moduleRef: ModuleRef);
    run(world: WorldModelContext, plan: RoutePlanDraft): Promise<StrategyOrchestrationResult>;
    private saveLogs;
    private determineFinalAction;
    private getContextEngineer;
    private getSkillsRegistry;
}
