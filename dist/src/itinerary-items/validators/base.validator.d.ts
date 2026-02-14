import { ValidationCode, ValidationSeverity, ValidationResult, ValidationContext, IValidator, ValidationSuggestion } from '../interfaces/validation.interface';
export declare abstract class BaseValidator implements IValidator {
    abstract getCode(): ValidationCode;
    abstract getSeverity(): ValidationSeverity;
    abstract validate(context: ValidationContext): Promise<ValidationResult | null>;
    protected createResult(valid: boolean, message: string, details?: Record<string, any>, suggestions?: ValidationSuggestion[]): ValidationResult;
    protected fail(message: string, details?: Record<string, any>, suggestions?: ValidationSuggestion[]): ValidationResult;
    protected pass(): null;
}
