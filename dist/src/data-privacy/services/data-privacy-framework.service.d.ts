import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import { DataUsage, Consent, EncryptedData, DataType, RetentionPolicy, DataRights, MinimalData } from '../interfaces/data-privacy.interface';
export declare class DataPrivacyFrameworkService {
    private readonly prisma;
    private readonly encryptionService;
    private readonly logger;
    constructor(prisma: PrismaService, encryptionService: EncryptionService);
    collectMinimalNecessaryData(userRequest: Record<string, any>, purpose: DataUsage['purpose']): Promise<MinimalData>;
    getUserInformedConsent(userId: string, dataUsage: DataUsage): Promise<Consent>;
    recordConsent(userId: string, dataUsage: DataUsage, consentText: string): Promise<string>;
    revokeConsent(userId: string, purpose: DataUsage['purpose']): Promise<void>;
    encryptSensitiveData(data: any): Promise<EncryptedData>;
    decryptSensitiveData(encryptedData: EncryptedData): Promise<any>;
    minimizeRetentionPeriod(dataType: DataType): Promise<RetentionPolicy>;
    getUserDataRights(userId: string): Promise<DataRights>;
    private exportUserData;
    private correctUserData;
    private deleteUserData;
    private determineRequiredFields;
    private generateConsentText;
}
