import { AxiosInstance } from 'axios';
import { Logger } from '@nestjs/common';
export declare function createOpenAIHttp(baseURL?: string, logger?: Logger, options?: {
    disableProxy?: boolean;
}): AxiosInstance;
