import { DecisionLogEntry } from '../interfaces/trip-plan.interface';
export interface LegacyDecisionLogEntry {
    step: string;
    decision: string;
    reasoning: string;
    timestamp: string;
}
export declare class DecisionLogMigrator {
    static toLegacyFormat(entry: DecisionLogEntry): LegacyDecisionLogEntry;
    static fromLegacyFormat(entry: LegacyDecisionLogEntry, requestId: string): DecisionLogEntry;
    static batchToLegacyFormat(entries: DecisionLogEntry[]): LegacyDecisionLogEntry[];
    static batchFromLegacyFormat(entries: LegacyDecisionLogEntry[], requestId: string): DecisionLogEntry[];
    private static normalizeStepToLegacy;
    private static normalizeStepFromLegacy;
    private static inferActorFromStep;
    static detectFormat(entry: any): 'new' | 'legacy';
    static normalizeToNewFormat(entry: DecisionLogEntry | LegacyDecisionLogEntry, requestId: string): DecisionLogEntry;
    static normalizeToLegacyFormat(entry: DecisionLogEntry | LegacyDecisionLogEntry): LegacyDecisionLogEntry;
}
