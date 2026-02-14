import { PrismaService } from '../../prisma/prisma.service';
import { DecisionDraft, DecisionDraftVersion } from '../interfaces/decision-draft.interface';
export declare class DecisionDraftStorageService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    saveDecisionDraft(decisionDraft: DecisionDraft): Promise<DecisionDraft>;
    private saveDecisionSteps;
    loadDecisionDraft(draftId: string): Promise<DecisionDraft | null>;
    loadDecisionDraftByWorkflowId(workflowId: string): Promise<DecisionDraft | null>;
    loadDecisionDraftByTripId(tripId: string): Promise<DecisionDraft | null>;
    deleteDecisionDraft(draftId: string): Promise<void>;
    private mapToDecisionDraft;
    saveVersion(version: DecisionDraftVersion): Promise<void>;
    loadVersion(versionId: string): Promise<DecisionDraftVersion | null>;
    loadVersions(workflowId: string): Promise<DecisionDraftVersion[]>;
    listDecisionDrafts(options: {
        page: number;
        pageSize: number;
        status?: string;
        destination?: string;
        startDate?: string;
        endDate?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
    }): Promise<{
        items: Array<DecisionDraft & {
            trip_id?: string;
        }>;
        total: number;
    }>;
    getQualityStats(options: {
        timeRange: string;
        destination?: string;
    }): Promise<{
        total_decisions: number;
        success_rate: number;
        avg_decision_time_ms: number;
        avg_steps_per_draft: number;
        user_acceptance_rate: number;
        user_modification_rate: number;
        user_rejection_rate: number;
        avg_user_rating: number;
        decision_types: Array<{
            type: string;
            count: number;
            success_rate: number;
        }>;
        trends: Array<{
            date: string;
            total: number;
            success: number;
            failed: number;
        }>;
        top_issues: Array<{
            issue: string;
            count: number;
            percentage: number;
        }>;
    }>;
    getUserStylesSummary(options: {
        page: number;
        pageSize: number;
        styleType?: string;
    }): Promise<{
        total_users: number;
        style_distribution: Array<{
            style: string;
            count: number;
            percentage: number;
        }>;
        avg_confidence: number;
        users: Array<{
            user_id: string;
            style_type: string;
            decision_count: number;
            acceptance_rate: number;
            avg_modification_count: number;
            top_preferences: string[];
            last_active: string;
        }>;
        behavior_patterns: Array<{
            pattern: string;
            description: string;
            user_count: number;
            examples: string[];
        }>;
    }>;
    getAnomalies(options: {
        severity?: string;
        timeRange: string;
        limit: number;
    }): Promise<{
        total: number;
        errors: number;
        warnings: number;
        infos: number;
        anomalies: Array<{
            id: string;
            severity: 'error' | 'warning' | 'info';
            type: string;
            message: string;
            draft_id?: string;
            trip_id?: string;
            user_id?: string;
            timestamp: string;
            context?: Record<string, any>;
            resolved: boolean;
        }>;
        trending_issues: Array<{
            type: string;
            count: number;
            trend: 'increasing' | 'stable' | 'decreasing';
        }>;
    }>;
}
