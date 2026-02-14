import { VersionService } from '../../chain-of-work/version/version.service';
import { DecisionDraftStorageService } from '../storage/decision-draft-storage.service';
import { DecisionDraft, DecisionDraftVersion } from '../interfaces/decision-draft.interface';
export interface VersionCreateOptions {
    creator: string;
    description?: string;
    tags?: string[];
}
export declare class DecisionDraftVersionService {
    private readonly versionService;
    private readonly storageService;
    private readonly logger;
    constructor(versionService: VersionService, storageService: DecisionDraftStorageService);
    saveVersion(decisionDraft: DecisionDraft, options: VersionCreateOptions): Promise<DecisionDraftVersion>;
    getVersions(workflowId: string): Promise<DecisionDraftVersion[]>;
    getVersion(workflowId: string, versionId: string): Promise<DecisionDraftVersion | null>;
    compareVersions(workflowId: string, versionId1: string, versionId2: string): Promise<{
        version1: DecisionDraftVersion;
        version2: DecisionDraftVersion;
        diff: DecisionDraftVersion['diff'];
    }>;
    private calculateDiff;
    rollbackToVersion(workflowId: string, versionId: string): Promise<DecisionDraftVersion>;
    forkVersion(workflowId: string, versionId: string, newWorkflowId: string, options: VersionCreateOptions): Promise<DecisionDraftVersion>;
}
