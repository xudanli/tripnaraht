import { McpCapabilityManagerService } from './services/mcp-capability-manager.service';
import { McpCapabilityDto, UpdateCapabilityStatusDto, BatchUpdateCapabilityStatusDto, QueryCapabilitiesDto } from './dto/mcp-capability.dto';
import { StandardResponse } from '../common/dto/standard-response.dto';
export declare class McpCapabilityController {
    private readonly capabilityManager;
    constructor(capabilityManager: McpCapabilityManagerService);
    getAllCapabilities(query: QueryCapabilitiesDto): Promise<StandardResponse<McpCapabilityDto[]>>;
    getStatistics(): Promise<StandardResponse<any>>;
    getCapability(serviceName: string): Promise<StandardResponse<McpCapabilityDto>>;
    updateCapabilityStatus(serviceName: string, body: UpdateCapabilityStatusDto): Promise<StandardResponse<{
        serviceName: string;
        enabled: boolean;
    }>>;
    batchUpdateCapabilityStatus(body: BatchUpdateCapabilityStatusDto): Promise<StandardResponse<{
        success: number;
        failed: number;
        results: Array<{
            serviceName: string;
            success: boolean;
            error?: string;
        }>;
    }>>;
    resetToDefaults(): Promise<StandardResponse<{
        message: string;
    }>>;
    checkCapabilityEnabled(serviceName: string): Promise<StandardResponse<{
        serviceName: string;
        enabled: boolean;
    }>>;
}
