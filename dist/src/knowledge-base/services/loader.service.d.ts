import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { KBFileData } from '../interfaces/knowledge-base.interface';
export declare class LoaderService {
    private configService;
    private prisma;
    private readonly logger;
    private kbPath;
    constructor(configService: ConfigService, prisma: PrismaService);
    loadAllFiles(): Promise<KBFileData[]>;
    saveFile(fileData: KBFileData): Promise<string>;
    private detectCategory;
}
