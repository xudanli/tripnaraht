import { BaseValidator } from './base.validator';
import { ValidationCode, ValidationSeverity, ValidationResult, ValidationContext } from '../interfaces/validation.interface';
import { SmartRoutesService } from '../../transport/services/smart-routes.service';
import { TravelTimeCacheService } from '../services/travel-time-cache.service';
export declare class TravelTimeValidator extends BaseValidator {
    private readonly smartRoutesService?;
    private readonly cacheService?;
    private readonly logger;
    private readonly MIN_BUFFER_MINUTES;
    constructor(smartRoutesService?: SmartRoutesService, cacheService?: TravelTimeCacheService);
    getCode(): ValidationCode;
    getSeverity(): ValidationSeverity;
    validate(context: ValidationContext): Promise<ValidationResult | null>;
    private getTransportSuggestion;
    private calculateTravelTime;
    private calculateHaversineDistance;
    private toRadians;
    private estimateTravelTime;
}
