import { ChainOfWorkService } from '../services/chain-of-work.service';
import { VersionService } from '../version/version.service';
import { GenerateDraftDto, SaveDraftDto, ExecuteDraftDto, RollbackVersionDto } from '../dto/chain-of-work.dto';
import { TripNARAWorkflowDraft, ExecutionResult, Version } from '../interfaces/chain-of-work.interface';
export declare class ChainOfWorkController {
    private readonly chainOfWorkService;
    private readonly versionService;
    private readonly logger;
    constructor(chainOfWorkService: ChainOfWorkService, versionService: VersionService);
    generateDraft(dto: GenerateDraftDto): Promise<{
        draft: TripNARAWorkflowDraft;
        generation_time_ms: number;
    }>;
    saveDraft(dto: SaveDraftDto): Promise<{
        draft_id: string;
        version: string;
        saved_at: string;
    }>;
    getDraft(draftId: string): Promise<{
        draft: TripNARAWorkflowDraft;
    }>;
    executeDraft(draftId: string, dto: ExecuteDraftDto): Promise<{
        execution_id: string;
        result: ExecutionResult;
    }>;
    getVersionList(workflowId: string, page?: number, pageSize?: number): Promise<{
        versions: Version[];
        total: number;
        page: number;
        page_size: number;
    }>;
    rollbackVersion(workflowId: string, dto: RollbackVersionDto): Promise<{
        success: boolean;
        new_version: string;
        rolled_back_at: string;
    }>;
}
