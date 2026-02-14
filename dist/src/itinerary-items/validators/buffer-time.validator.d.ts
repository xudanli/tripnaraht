import { BaseValidator } from './base.validator';
import { ValidationCode, ValidationSeverity, ValidationResult, ValidationContext } from '../interfaces/validation.interface';
export declare class BufferTimeValidator extends BaseValidator {
    private readonly MIN_BUFFER_MINUTES;
    private readonly RECOMMENDED_BUFFER_MINUTES;
    getCode(): ValidationCode;
    getSeverity(): ValidationSeverity;
    validate(context: ValidationContext): Promise<ValidationResult | null>;
}
