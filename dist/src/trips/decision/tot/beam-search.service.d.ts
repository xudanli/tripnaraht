import { ToTEvaluatorService } from './tot-evaluator.service';
import { ThoughtNode } from './tot-evaluator.interface';
import { ToTScoreResult } from './score-result';
import { TripPlan } from '../plan-model';
export interface BeamSearchConfig {
    beamWidth?: number;
    maxDepth?: number;
    timeBudgetMs?: number;
}
export interface BeamSearchResult {
    best: ThoughtNode | null;
    bestScore: number;
    candidates: Array<{
        node: ThoughtNode;
        score: ToTScoreResult;
    }>;
    stats: {
        totalEvaluated: number;
        totalRejected: number;
        depth: number;
    };
}
export declare class BeamSearchService {
    private readonly evaluator;
    private readonly logger;
    constructor(evaluator: ToTEvaluatorService);
    search(root: ThoughtNode, expand: (nodes: ThoughtNode[]) => Promise<ThoughtNode[]>, config?: BeamSearchConfig): Promise<BeamSearchResult>;
    expandFromNeptuneCandidates(parent: ThoughtNode, candidates: Array<{
        plan: TripPlan;
        explanation: string;
    }>): Promise<ThoughtNode[]>;
}
