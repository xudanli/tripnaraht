import { DecisionDraftGeneratorService } from '../services/decision-draft-generator.service';
import { DecisionExplanationService } from '../services/decision-explanation.service';
import { DecisionDraftVersionService } from '../services/decision-draft-version.service';
import { DecisionDraftStorageService } from '../storage/decision-draft-storage.service';
import { DecisionDraftEditorService } from '../services/decision-draft-editor.service';
import { GetExplanationQueryDto, EditDecisionStepDto, GenerateDecisionDraftDto, BatchEditDecisionStepsDto, PartialRegenerateDto, ReorderDecisionStepsDto, SaveVersionDto, ForkVersionDto } from '../dto/decision-draft.dto';
export declare class DecisionDraftController {
    private readonly decisionDraftGenerator;
    private readonly explanationService;
    private readonly versionService;
    private readonly storageService;
    private readonly editorService;
    private readonly logger;
    constructor(decisionDraftGenerator: DecisionDraftGeneratorService, explanationService: DecisionExplanationService, versionService: DecisionDraftVersionService, storageService: DecisionDraftStorageService, editorService: DecisionDraftEditorService);
    getDecisionDraftByTripId(tripId: string): Promise<{
        draft_id: string;
        decision_steps: any[];
        step_draft?: any;
        user_mode: 'toc' | 'expert';
        metadata: any;
    }>;
    getStats(workflowId?: string): Promise<{
        total_drafts: number;
        avg_decision_count: number;
        avg_generation_time_ms: number;
    }>;
    adminListDecisionDrafts(page?: number, pageSize?: number, status?: string, destination?: string, startDate?: string, endDate?: string, sortBy?: string, sortOrder?: string): Promise<{
        items: Array<{
            draft_id: string;
            trip_id?: string;
            plan_id?: string;
            destination?: string;
            status: string;
            step_count: number;
            user_mode: string;
            created_at: string;
            updated_at?: string;
        }>;
        pagination: {
            page: number;
            pageSize: number;
            total: number;
            totalPages: number;
        };
        filters: {
            status?: string;
            destination?: string;
            dateRange?: {
                start: string;
                end: string;
            };
        };
    }>;
    adminGetQualityStats(timeRange?: string, destination?: string): Promise<{
        overview: {
            total_decisions: number;
            success_rate: number;
            avg_decision_time_ms: number;
            avg_steps_per_draft: number;
        };
        quality_metrics: {
            user_acceptance_rate: number;
            user_modification_rate: number;
            user_rejection_rate: number;
            avg_user_rating: number;
        };
        decision_types: Array<{
            type: string;
            count: number;
            success_rate: number;
        }>;
        trends: {
            period: string;
            data: Array<{
                date: string;
                total: number;
                success: number;
                failed: number;
            }>;
        };
        top_issues: Array<{
            issue: string;
            count: number;
            percentage: number;
        }>;
    }>;
    adminGetUserStyles(page?: number, pageSize?: number, styleType?: string): Promise<{
        summary: {
            total_users_analyzed: number;
            style_distribution: Array<{
                style: string;
                count: number;
                percentage: number;
            }>;
            avg_decision_confidence: number;
        };
        users: Array<{
            user_id: string;
            style_type: string;
            decision_count: number;
            acceptance_rate: number;
            avg_modification_count: number;
            top_preferences: string[];
            last_active: string;
        }>;
        pagination: {
            page: number;
            pageSize: number;
            total: number;
            totalPages: number;
        };
        behavior_patterns: Array<{
            pattern: string;
            description: string;
            user_count: number;
            examples: string[];
        }>;
    }>;
    adminGetAnomalies(severity?: string, timeRange?: string, limit?: number): Promise<{
        summary: {
            total_anomalies: number;
            errors: number;
            warnings: number;
            infos: number;
        };
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
    getDecisionDraft(draftId: string): Promise<{
        draft_id: string;
        decision_steps: any[];
        step_draft?: any;
        user_mode: 'toc' | 'expert';
        metadata: any;
    }>;
    getExplanation(draftId: string, query: GetExplanationQueryDto, user?: any): Promise<any>;
    getStepExplanation(draftId: string, stepId: string): Promise<any>;
    getVersions(draftId: string): Promise<{
        versions: Array<{
            version_id: string;
            version: string;
            created_by: string;
            description?: string;
            created_at: string;
        }>;
    }>;
    getVersion(draftId: string, versionId: string): Promise<any>;
    compareVersions(draftId: string, versionId1: string, versionId2: string): Promise<any>;
    editDecisionStep(draftId: string, stepId: string, dto: EditDecisionStepDto): Promise<{
        draft: any;
    }>;
    applyDecisionDraft(draftId: string): Promise<{
        draft: any;
        applied: boolean;
        applied_steps: string[];
        skipped_steps: string[];
        applied_at: string;
    }>;
    generateDecisionDraft(dto: GenerateDecisionDraftDto): Promise<{
        draft: any;
        generation_time_ms: number;
    }>;
    batchEditDecisionSteps(draftId: string, dto: BatchEditDecisionStepsDto): Promise<{
        draft: any;
    }>;
    partialRegenerate(draftId: string, dto: PartialRegenerateDto): Promise<{
        draft: any;
        regeneration_time_ms: number;
    }>;
    reorderDecisionSteps(draftId: string, dto: ReorderDecisionStepsDto): Promise<{
        draft: any;
    }>;
    saveVersion(draftId: string, dto: SaveVersionDto): Promise<{
        version_id: string;
        version: string;
        saved_at: string;
    }>;
    rollbackVersion(draftId: string, versionId: string): Promise<{
        version: any;
    }>;
    forkVersion(draftId: string, versionId: string, dto: ForkVersionDto): Promise<{
        version: any;
        new_draft_id: string;
    }>;
    getDebugInfo(draftId: string): Promise<{
        draft_id: string;
        debug_info: any;
    }>;
    previewImpact(draftId: string, body: {
        step_id: string;
        proposed_changes: {
            action?: 'accept' | 'reject' | 'modify';
            modifications?: Record<string, any>;
        };
    }): Promise<{
        draft_id: string;
        step_id: string;
        impact: {
            affected_steps: string[];
            estimated_changes: Array<{
                step_id: string;
                change_type: 'modified' | 'regenerated' | 'removed';
                description: string;
            }>;
            risk_level: 'low' | 'medium' | 'high';
            warnings: string[];
        };
    }>;
    getReplayData(draftId: string): Promise<{
        draft_id: string;
        timeline: Array<{
            step_id: string;
            timestamp: string;
            decision_type: string;
            summary: string;
            status: string;
        }>;
        snapshots: Array<{
            snapshot_id: string;
            step_id: string;
            state: any;
            created_at: string;
        }>;
        visualization: {
            nodes: Array<{
                id: string;
                type: string;
                label: string;
                data: any;
            }>;
            edges: Array<{
                source: string;
                target: string;
                label?: string;
            }>;
        };
    }>;
}
