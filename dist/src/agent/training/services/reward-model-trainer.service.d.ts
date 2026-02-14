import { ConfigService } from '@nestjs/config';
export declare class RewardModelTrainerService {
    private readonly configService;
    private readonly logger;
    private readonly trainingServiceUrl;
    constructor(configService: ConfigService);
    trainWithPreferenceComparison(preferenceData: Array<{
        chosen: any;
        rejected: any;
        context: any;
    }>, config?: {
        model_type?: string;
        learning_rate?: number;
        batch_size?: number;
        num_epochs?: number;
    }): Promise<{
        model_version: string;
        training_metrics: any;
    }>;
    trainWithScoreRegression(scoreData: Array<{
        input: any;
        score: number;
        context: any;
    }>, config?: {
        model_type?: string;
        learning_rate?: number;
        batch_size?: number;
        num_epochs?: number;
    }): Promise<{
        model_version: string;
        training_metrics: any;
    }>;
}
