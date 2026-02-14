import { PrismaService } from '../../prisma/prisma.service';
import { FileStorageService } from './file-storage.service';
import { RateLimitService } from './rate-limit.service';
import { ContactNotificationService } from './contact-notification.service';
export interface MulterFile {
    buffer: Buffer;
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
}
export declare class ContactService {
    private prisma;
    private fileStorage;
    private rateLimit;
    private notification;
    private readonly logger;
    constructor(prisma: PrismaService, fileStorage: FileStorageService, rateLimit: RateLimitService, notification: ContactNotificationService);
    private validateFile;
    createContactMessage(message: string | undefined, files: MulterFile[] | undefined, userId?: string, ipAddress?: string): Promise<{
        id: string;
        success: boolean;
        message: string;
    }>;
    getContactMessages(query: {
        page?: number;
        limit?: number;
        status?: string;
        userId?: string;
        search?: string;
    }): Promise<{
        messages: {
            images: any[];
            status: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            message: string | null;
            userId: string | null;
        }[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    getContactMessageById(messageId: string): Promise<{
        images: any[];
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        message: string | null;
        userId: string | null;
    }>;
    updateContactMessageStatus(messageId: string, status: string): Promise<{
        images: any[];
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        message: string | null;
        userId: string | null;
    }>;
}
