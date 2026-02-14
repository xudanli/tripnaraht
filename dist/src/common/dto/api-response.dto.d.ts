export declare class ApiErrorDto {
    code: string;
    message: string;
    details?: Record<string, any>;
}
export declare class ApiSuccessResponseDto<T> {
    success: true;
    data: T;
}
export declare class ApiErrorResponseDto {
    success: false;
    error: ApiErrorDto;
}
