import { ThoughtInput, ThoughtEvaluator } from './tot-evaluator.interface';
import { ToTScoreResult } from './score-result';
export declare class ToTEvaluatorService implements ThoughtEvaluator {
    private readonly logger;
    evaluate(input: ThoughtInput): Promise<ToTScoreResult>;
    private computeDimensions;
    private computeWeights;
    private aggregateScore;
}
