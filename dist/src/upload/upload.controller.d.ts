import { UploadService } from './upload.service';
import { PrismaService } from '../prisma/prisma.service';
interface MulterFile {
    buffer: Buffer;
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
}
export declare class UploadController {
    private readonly uploadService;
    private readonly prisma;
    constructor(uploadService: UploadService, prisma: PrismaService);
    getStatus(): {
        available: boolean;
        message: string;
    };
    uploadImage(file: MulterFile, folder?: string): Promise<{
        success: boolean;
        data: import("./upload.service").UploadResult;
    }>;
    uploadImages(files: MulterFile[], folder?: string): Promise<{
        success: boolean;
        data: import("./upload.service").UploadResult[];
        count: number;
    }>;
    uploadPlaceImages(placeId: string, files: MulterFile[], captions?: string): Promise<{
        success: boolean;
        data: {
            placeId: number;
            placeName: string;
            newImages: {
                url: string;
                key: string;
                caption: string;
                source: string;
                isPrimary: boolean;
                uploadedAt: string;
            }[];
            totalImages: any;
        };
    }>;
    getPlaceImages(placeId: string): Promise<{
        success: boolean;
        data: {
            placeId: number;
            placeName: string;
            images: any;
            count: any;
        };
    }>;
    deleteImage(key: string): Promise<{
        success: boolean;
        data: {
            key: string;
            message: string;
        };
    }>;
    deletePlaceImage(placeId: string, key?: string, index?: string): Promise<{
        success: boolean;
        data: {
            placeId: number;
            placeName: string;
            deletedImage: {
                url: any;
                key: any;
                caption: any;
            };
            remainingImages: any;
            totalImages: any;
        };
    }>;
}
export {};
