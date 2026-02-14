export interface StandardResponse<T = any> {
    success: boolean;
    data?: T;
    error?: ErrorResponse;
}
export interface ErrorResponse {
    code: string;
    message: string;
    details?: Record<string, any>;
}
export declare function successResponse<T>(data: T): StandardResponse<T>;
export declare function errorResponse(code: string, message: string, details?: Record<string, any>): StandardResponse;
export declare enum ErrorCode {
    VALIDATION_ERROR = "VALIDATION_ERROR",
    NOT_FOUND = "NOT_FOUND",
    PROVIDER_ERROR = "PROVIDER_ERROR",
    BUSINESS_ERROR = "BUSINESS_ERROR",
    INTERNAL_ERROR = "INTERNAL_ERROR",
    UNSUPPORTED_ACTION = "UNSUPPORTED_ACTION",
    UNAUTHORIZED = "UNAUTHORIZED",
    FORBIDDEN = "FORBIDDEN",
    BAD_REQUEST = "BAD_REQUEST"
}
