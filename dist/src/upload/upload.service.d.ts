interface MulterFile {
    buffer: Buffer;
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
}
export interface UploadResult {
    url: string;
    key: string;
    size: number;
    mimeType: string;
}
export declare class UploadService {
    private readonly logger;
    private ossClient;
    private httpClient;
    constructor();
    private initHttpClient;
    private initOssClient;
    uploadImage(file: MulterFile, folder?: string): Promise<UploadResult>;
    uploadImages(files: MulterFile[], folder?: string): Promise<UploadResult[]>;
    deleteImage(key: string): Promise<void>;
    uploadImageFromUrl(imageUrl: string, folder?: string, filename?: string): Promise<UploadResult>;
    private delay;
    isAvailable(): boolean;
}
export {};
