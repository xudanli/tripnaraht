import { ExaService } from './exa.service';
import { ExaMonitoringService } from './exa-monitoring.service';
import { ExaWebSearchDto, ExaCodeContextDto, ExaCompanyResearchDto, ExaCrawlUrlDto, ExaDeepResearcherStartDto, ExaDeepResearcherCheckDto } from './dto/exa-search.dto';
export declare class ExaController {
    private readonly exaService;
    private readonly monitoring;
    private readonly logger;
    constructor(exaService: ExaService, monitoring: ExaMonitoringService);
    webSearch(dto: ExaWebSearchDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getCodeContext(dto: ExaCodeContextDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    companyResearch(dto: ExaCompanyResearchDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    crawlUrl(dto: ExaCrawlUrlDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    deepResearcherStart(dto: ExaDeepResearcherStartDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    deepResearcherCheck(dto: ExaDeepResearcherCheckDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    listTools(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    checkStatus(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getStats(days?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    checkCostLimit(dailyLimit?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
