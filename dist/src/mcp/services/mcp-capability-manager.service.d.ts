import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { McpCapabilityDto, McpCapabilityStatus } from '../dto/mcp-capability.dto';
export declare class McpCapabilityManagerService implements OnModuleInit {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    private readonly capabilityDefinitions;
    private capabilityStatusCache;
    onModuleInit(): Promise<void>;
    private loadCapabilitiesFromDatabase;
    getAllCapabilities(filters?: {
        serviceName?: string;
        status?: McpCapabilityStatus;
        category?: string;
    }): Promise<McpCapabilityDto[]>;
    private getAllCapabilitiesFromCache;
    getCapability(serviceName: string): Promise<McpCapabilityDto | null>;
    isCapabilityEnabled(serviceName: string): boolean;
    isCapabilityEnabledAsync(serviceName: string): Promise<boolean>;
    enableCapability(serviceName: string): Promise<boolean>;
    disableCapability(serviceName: string): Promise<boolean>;
    updateCapabilityStatus(serviceName: string, enabled: boolean): Promise<boolean>;
    batchUpdateCapabilityStatus(updates: Array<{
        serviceName: string;
        enabled: boolean;
    }>): Promise<{
        success: number;
        failed: number;
        results: Array<{
            serviceName: string;
            success: boolean;
            error?: string;
        }>;
    }>;
    getStatistics(): Promise<{
        total: number;
        enabled: number;
        disabled: number;
        byCategory: Record<string, {
            total: number;
            enabled: number;
            disabled: number;
        }>;
    }>;
    private getStatisticsFromCache;
    resetToDefaults(): Promise<void>;
}
