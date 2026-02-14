import { PrismaService } from '../../prisma/prisma.service';
import { DataCollectionService } from './data-collection.service';
import { DataQualityAlertService } from './data-quality-alert.service';
import { UpdateFrequency } from '../config/geographic-data-update.config';
export interface UpdateTask {
    dataSource: string;
    dataType: string;
    countryCode?: string;
    frequency: UpdateFrequency;
    lastUpdated: Date;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
}
export interface UpdateResult {
    success: boolean;
    dataSource: string;
    dataType: string;
    error?: string;
    recordsUpdated?: number;
    duration?: number;
}
export declare class DataUpdateSchedulerService {
    private readonly prisma;
    private readonly dataCollection;
    private readonly alertService;
    private readonly logger;
    private readonly maxConcurrent;
    private readonly maxRetries;
    constructor(prisma: PrismaService, dataCollection: DataCollectionService, alertService: DataQualityAlertService);
    runUpdateTasks(): Promise<void>;
    getUpdateTasks(): Promise<UpdateTask[]>;
    private executeUpdateTasksInParallel;
    executeUpdateTask(task: UpdateTask): Promise<UpdateResult>;
    private determinePriority;
    private determineSource;
}
