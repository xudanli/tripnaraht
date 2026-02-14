import { TripNARAWorkflowDraft, Version } from '../interfaces/chain-of-work.interface';
export declare class VersionService {
    private readonly logger;
    private readonly versions;
    saveVersion(workflowId: string, draft: TripNARAWorkflowDraft, metadata?: {
        creator: string;
        description?: string;
    }): Promise<Version>;
    getVersionList(workflowId: string): Promise<Version[]>;
    getVersion(workflowId: string, versionId: string): Promise<Version | null>;
    rollbackToVersion(workflowId: string, versionId: string): Promise<Version>;
    private generateUuid;
}
