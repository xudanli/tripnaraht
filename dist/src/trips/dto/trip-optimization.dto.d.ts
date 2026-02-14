export declare class ApplyOptimizationOptionsDto {
    replaceExisting?: boolean;
    preserveManualEdits?: boolean;
    dryRun?: boolean;
}
export declare class ApplyOptimizationRequestDto {
    optimizationId?: string;
    result: any;
    options?: ApplyOptimizationOptionsDto;
}
export declare class ChangePreviewDto {
    dayId: string;
    date: string;
    added: number;
    removed: number;
    modified: number;
}
export declare class ApplyOptimizationResponseDto {
    success: boolean;
    appliedItems: number;
    modifiedDays: string[];
    preview?: ChangePreviewDto[];
}
