import { TripNARAWorkflowDraft, DraftValidationResult } from '../interfaces/chain-of-work.interface';
export declare class DraftValidatorService {
    private readonly logger;
    validateDraft(draft: TripNARAWorkflowDraft): Promise<DraftValidationResult>;
}
