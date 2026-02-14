import { OnModuleInit } from '@nestjs/common';
export interface FileMetadata {
    source: string;
    filename: string;
    format: string;
    size: number;
    mimeType?: string;
    pages?: number;
    sheets?: string[];
    [key: string]: any;
}
export interface FileContent {
    content: string | any;
    page?: number;
    totalPages?: number;
    sheet?: string;
    [key: string]: any;
}
export declare class FileExtractorDirectService implements OnModuleInit {
    private readonly logger;
    private axiosInstance;
    private isAvailable;
    onModuleInit(): Promise<void>;
    isServiceAvailable(): boolean;
    private downloadFile;
    private getFileExtension;
    extractMetadata(url: string): Promise<FileMetadata>;
    extractFileContent(url: string, options?: {
        page?: number;
        limit?: number;
        search?: string;
        sheet?: string;
        caseSensitive?: boolean;
    }): Promise<FileContent>;
    private extractPdfContent;
    private extractDocxContent;
    private extractExcelContent;
    private extractCsvContent;
}
