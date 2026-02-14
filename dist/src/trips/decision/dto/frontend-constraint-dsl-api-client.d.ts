import type { ApiResponse, ConstraintDSL, DetectConflictsResponse, CheckConstraintsResponse, GenerateMultiplePlansResponse } from './frontend-constraint-dsl-api.types';
export declare function detectConflicts(constraints: ConstraintDSL, plan?: any, state?: any): Promise<ApiResponse<DetectConflictsResponse>>;
export declare function checkConstraintsWithExplanation(state: any, plan: any): Promise<ApiResponse<CheckConstraintsResponse>>;
export declare function generateMultiplePlans(state: any, constraints: ConstraintDSL): Promise<ApiResponse<GenerateMultiplePlansResponse>>;
