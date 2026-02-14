import { Logger } from '@nestjs/common';
import { AxiosInstance } from 'axios';
export declare abstract class BaseAdapter {
    protected readonly logger: Logger;
    protected httpClient: AxiosInstance;
    constructor(adapterName: string, httpConfig: {
        baseURL?: string;
        timeout?: number;
        headers?: Record<string, string>;
        params?: Record<string, any>;
    });
    protected safeRequest<T>(requestFn: () => Promise<T>, errorContext: string, defaultValue: T): Promise<T>;
    protected safeRequestOrNull<T>(requestFn: () => Promise<T>, errorContext: string): Promise<T | null>;
}
