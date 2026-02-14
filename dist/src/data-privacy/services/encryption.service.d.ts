import { ConfigService } from '@nestjs/config';
import { EncryptedData } from '../interfaces/data-privacy.interface';
export declare class EncryptionService {
    private readonly configService;
    private readonly logger;
    private readonly algorithm;
    private readonly keyLength;
    private readonly ivLength;
    private readonly saltLength;
    private readonly tagLength;
    constructor(configService: ConfigService);
    private getEncryptionKey;
    getKeyId(): string;
    encrypt(data: any, algorithm?: string): Promise<EncryptedData>;
    decrypt(encryptedData: EncryptedData): Promise<any>;
    hash(data: string): string;
}
