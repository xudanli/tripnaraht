export declare enum ErrorType {
    CRITICAL_DEPENDENCY_MISSING = "CRITICAL_DEPENDENCY_MISSING",
    MISSING_REQUIRED_PARAM = "MISSING_REQUIRED_PARAM",
    INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
    VALIDATION_ERROR = "VALIDATION_ERROR",
    TIMEOUT_ERROR = "TIMEOUT_ERROR",
    UNKNOWN_ERROR = "UNKNOWN_ERROR"
}
export interface ErrorHandlingStrategy {
    shouldReject: boolean;
    shouldShowClarification: boolean;
    allowRetry: boolean;
    requiresUserConfirmation: boolean;
    messageTemplate: string;
    suggestedSolutions: string[];
}
export declare const ERROR_HANDLING_STRATEGIES: Record<ErrorType, ErrorHandlingStrategy>;
export declare function getErrorHandlingStrategy(errorType: ErrorType): ErrorHandlingStrategy;
export declare function inferErrorType(error: any): ErrorType;
