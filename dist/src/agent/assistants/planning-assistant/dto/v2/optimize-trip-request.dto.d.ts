import { OptimizationRequirementsDto } from './optimize-plan-request.dto';
export declare class OptimizeTripRequestDto {
    sessionId?: string;
    tripId: string;
    optimizationType?: 'pace' | 'budget' | 'route' | 'activities';
    requirements?: OptimizationRequirementsDto;
    language?: 'en' | 'zh';
}
