import { FineTuneService, FineTuneConfig, TrainingTask } from '../services/fine-tune.service';
import { VllmClientService } from '../services/vllm-client.service';
import { LlmJudgeClientService } from '../services/llm-judge-client.service';
declare class StartTrainingDto {
    model_name?: string;
    lora_rank?: number;
    lora_alpha?: number;
    learning_rate?: number;
    num_epochs?: number;
    batch_size?: number;
    dataset_name?: string;
    resume_from_checkpoint?: string;
}
declare class GenerateDto {
    user_request: string;
    system_prompt?: string;
    lora_adapter?: string;
    temperature?: number;
    max_tokens?: number;
}
declare class ScorePlanDto {
    request_id: string;
    plan: {
        day: number;
        activities: any[];
        summary?: string;
    }[];
    user_request: string;
    evidence?: any[];
    decision_log?: any[];
    context?: any;
}
declare class ComparePlansDto {
    request_id: string;
    plan_a: {
        day: number;
        activities: any[];
        summary?: string;
    }[];
    plan_b: {
        day: number;
        activities: any[];
        summary?: string;
    }[];
    user_request: string;
}
declare class EvaluateLoraDto {
    request_id: string;
    prompt: string;
    baseline_response: string;
    lora_response: string;
    task_type?: string;
    ground_truth?: string;
}
export declare class TrainingController {
    private readonly fineTuneService;
    private readonly vllmClientService;
    private readonly llmJudgeClientService;
    private readonly logger;
    constructor(fineTuneService: FineTuneService, vllmClientService: VllmClientService, llmJudgeClientService: LlmJudgeClientService);
    healthCheck(): Promise<{
        status: string;
        timestamp: string;
        services: {
            train_service: boolean;
            vllm_service: boolean;
            llm_judge_service: boolean;
        };
    }>;
    getGpuInfo(): Promise<any>;
    startTraining(dto: StartTrainingDto): Promise<{
        task_id: string;
        status: string;
        message: string;
        success: boolean;
    }>;
    listTasks(): Promise<TrainingTask[]>;
    getTaskStatus(taskId: string): Promise<TrainingTask>;
    cancelTask(taskId: string): Promise<{
        task_id: string;
        status: string;
        success: boolean;
    }>;
    prepareTrainingData(minValidationScore?: number, minTotalReward?: number, maxUsageCount?: number, limit?: number): Promise<{
        dataset_name: string;
        train_samples: number;
        eval_samples: number;
        success: boolean;
    }>;
    listModels(): Promise<any[]>;
    listExperiments(): Promise<any[]>;
    listRuns(experimentId: string): Promise<any[]>;
    listVllmModels(): Promise<import("../services/vllm-client.service").VllmModelInfo[]>;
    listLoraAdapters(): Promise<import("../services/vllm-client.service").LoraAdapter[]>;
    generate(dto: GenerateDto): Promise<{
        content: string;
        usage: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
        };
        latency_ms: number;
        success: boolean;
    }>;
    runPipeline(config?: Partial<FineTuneConfig>, minValidationScore?: number, minTotalReward?: number): Promise<{
        task_id: string;
        data_preparation: {
            train_samples: number;
            eval_samples: number;
        };
        status: string;
        success: boolean;
    }>;
    judgeHealthCheck(): Promise<import("../services/llm-judge-client.service").JudgeHealthStatus>;
    scorePlan(dto: ScorePlanDto): Promise<{
        request_id: string;
        overall_score: number;
        dimension_scores: import("../services/llm-judge-client.service").DimensionScore[];
        diagnostic_labels: import("../services/llm-judge-client.service").DiagnosticLabel[];
        reasoning: string;
        suggestions: string[];
        latency_ms: number;
        timestamp: string;
        llm_provider: string;
        success: boolean;
    }>;
    batchScore(requests: ScorePlanDto[]): Promise<{
        responses: import("../services/llm-judge-client.service").ScoreResponse[];
        total_latency_ms: number;
        success: boolean;
    }>;
    comparePlans(dto: ComparePlansDto): Promise<{
        request_id: string;
        winner: "A" | "B" | "TIE";
        score_a: number;
        score_b: number;
        reasoning: string;
        latency_ms: number;
        timestamp: string;
        success: boolean;
    }>;
    evaluateLora(dto: EvaluateLoraDto): Promise<{
        request_id: string;
        baseline_score: number;
        lora_score: number;
        winner: "baseline" | "lora" | "tie";
        dimension_comparison: Record<string, {
            baseline: number;
            lora: number;
        }>;
        reasoning: string;
        recommendations: string[];
        latency_ms: number;
        timestamp: string;
        success: boolean;
    }>;
    batchEvaluateLora(requests: EvaluateLoraDto[]): Promise<{
        success: boolean;
        results: import("../services/llm-judge-client.service").LoraEvalResponse[];
        report: {
            total_evaluations: number;
            lora_wins: number;
            baseline_wins: number;
            ties: number;
            average_lora_score: number;
            average_baseline_score: number;
            win_rate: number;
            dimension_comparison: Record<string, {
                avg_baseline: number;
                avg_lora: number;
            }>;
            recommendations: string[];
        };
    }>;
}
export {};
