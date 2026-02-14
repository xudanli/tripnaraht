import { BaseValidator } from './base.validator';
import { ValidationCode, ValidationSeverity, ValidationResult, ValidationContext } from '../interfaces/validation.interface';
export declare class TimeOverlapValidator extends BaseValidator {
    getCode(): ValidationCode;
    getSeverity(): ValidationSeverity;
    validate(context: ValidationContext): Promise<ValidationResult | null>;
}
