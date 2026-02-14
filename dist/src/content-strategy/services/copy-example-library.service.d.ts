import { ErrorType, FirstTimeUserCopy, RouteComparisonCopy, LonelinessConcernCopy, WeatherRiskCopy, ErrorCopy, ExceptionCopy } from '../interfaces/copy-examples.interface';
import { RouteDirectionData } from '../../route-directions/interfaces/route-direction.interface';
export declare class CopyExampleLibraryService {
    private readonly logger;
    getFirstTimeUserCopy(): FirstTimeUserCopy;
    getRouteComparisonCopy(routes: RouteDirectionData[]): RouteComparisonCopy;
    getLonelinessConcernCopy(): LonelinessConcernCopy;
    getWeatherRiskCopy(weatherRisk: {
        type: string;
        level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        description: string;
        details?: Record<string, any>;
    }): WeatherRiskCopy;
    getPhysicalRiskCopy(physicalRisk: {
        level: string;
        requirements: string[];
        userCapability: string;
    }): string;
    getBudgetConcernCopy(budgetInfo: {
        estimatedCost: number;
        userBudget: number;
        difference: number;
    }): string;
    getTimeConstraintCopy(timeInfo: {
        routeDuration: number;
        availableDays: number;
        tight: boolean;
    }): string;
    getDecisionHesitationCopy(): string;
    getSuccessConfirmationCopy(): string;
    getRejectionResponseCopy(reason: string): string;
    getSystemErrorCopy(error: {
        code?: string;
        message?: string;
    }): ErrorCopy;
    getNetworkErrorCopy(): ErrorCopy;
    getDataNotFoundCopy(dataType: string): ErrorCopy;
    getValidationErrorCopy(field: string): ErrorCopy;
    getPermissionDeniedCopy(): ErrorCopy;
    getTimeoutErrorCopy(): ErrorCopy;
    getRateLimitCopy(): ErrorCopy;
    getMaintenanceCopy(): ErrorCopy;
    getErrorCopy(errorType: ErrorType, context?: Record<string, any>): ErrorCopy;
    getDataMissingException(dataType: string): ExceptionCopy;
    getValidationException(field: string, reason: string): ExceptionCopy;
    getBusinessLogicException(message: string): ExceptionCopy;
    private extractStrengths;
    private extractConsiderations;
    private generateComparisonSummary;
}
