import { ConfigService } from '@nestjs/config';
export declare class ContactNotificationService {
    private configService?;
    private readonly logger;
    private readonly transporter;
    private readonly notificationEmail;
    constructor(configService?: ConfigService);
    sendNotificationEmail(messageId: string, message: string | null, userId: string | null, imageCount: number, imageUrls?: string[]): Promise<void>;
}
