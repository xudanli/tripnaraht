export declare enum PipelineStageStatus {
    COMPLETED = "completed",
    IN_PROGRESS = "in-progress",
    PENDING = "pending",
    RISK = "risk"
}
export declare class PipelineStageDto {
    id: string;
    name: string;
    status: PipelineStageStatus;
    completedAt?: string;
    summary?: string;
}
export declare class PipelineStatusResponseDto {
    stages: PipelineStageDto[];
}
