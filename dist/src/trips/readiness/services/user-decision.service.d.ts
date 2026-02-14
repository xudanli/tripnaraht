import { Rule, Action, DecisionBranch, UserQuestion, LocalizedString } from '../types/readiness-pack.types';
export interface ProcessUserDecisionResult {
    updatedAction: Action;
    blockTrip: boolean;
    nextQuestions?: UserQuestion[];
    matchedBranch?: DecisionBranch;
}
export declare class UserDecisionService {
    private readonly logger;
    processUserDecision(rule: Rule, userAnswers: Record<string, any>): Promise<ProcessUserDecisionResult>;
    private validateAnswers;
    private validateAnswerType;
    private evaluateBranchCondition;
    private evaluateCondition;
    getQuestionsForRule(rule: Rule): UserQuestion[];
    requiresUserDecision(rule: Rule): boolean;
    getQuestionGroups(rule: Rule, answeredQuestionIds?: string[]): {
        groups: Array<{
            id: string;
            title: LocalizedString;
            description?: LocalizedString;
            questions: UserQuestion[];
            answeredCount: number;
            totalCount: number;
            progress: number;
            isComplete: boolean;
        }>;
        totalQuestions: number;
        answeredQuestions: number;
        overallProgress: number;
        currentGroupIndex: number;
    };
    getNextQuestion(rule: Rule, answeredQuestionIds?: string[]): UserQuestion | null;
}
