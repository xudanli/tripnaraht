import { TripNARAWorkflowDraft, TripNARAStepDraft } from '../interfaces/chain-of-work.interface';
export declare class DraftEditorService {
    private readonly logger;
    updateStep(draft: TripNARAWorkflowDraft, stepId: string, updates: Partial<TripNARAStepDraft>): Promise<TripNARAWorkflowDraft>;
    addStep(draft: TripNARAWorkflowDraft, step: TripNARAStepDraft, position?: number): Promise<TripNARAWorkflowDraft>;
    deleteStep(draft: TripNARAWorkflowDraft, stepId: string): Promise<TripNARAWorkflowDraft>;
}
