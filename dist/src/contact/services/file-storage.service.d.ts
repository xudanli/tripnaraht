import { ConfigService } from '@nestjs/config';
export interface UploadedFileInfo {
    filePath: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    url?: string;
}
export declare class FileStorageService {
    private configService?;
    private readonly logger;
    private readonly uploadDir;
    private ossClient;
    private readonly ossFolder;
    private readonly ossBucket;
    constructor(configService?: ConfigService);
    private initOssClient;
    private ensureUploadDir;
    saveFile(buffer: Buffer, originalName: string, mimeType: string): Promise<UploadedFileInfo>;
    private saveToOss;
    private saveToLocal;
    getFileUrl(filePath: string): string;
    deleteFile(filePath: string): Promise<boolean>;
    isOssAvailable(): boolean;
}
