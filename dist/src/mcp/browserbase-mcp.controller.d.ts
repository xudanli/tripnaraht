import { BrowserbaseMcpService } from './browserbase-mcp.service';
import { CreateSessionDto, NavigateDto, ScreenshotDto, ClickDto, EvaluateDto } from './dto/browserbase.dto';
export declare class BrowserbaseMcpController {
    private readonly browserbaseMcpService;
    private readonly logger;
    constructor(browserbaseMcpService: BrowserbaseMcpService);
    createSession(dto: CreateSessionDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    navigate(dto: NavigateDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    screenshot(dto: ScreenshotDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    click(dto: ClickDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    evaluate(dto: EvaluateDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    listTools(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    health(): Promise<import("../common/dto/standard-response.dto").StandardResponse<{
        available: boolean;
        service: string;
    }>>;
    getAuthorizationUrl(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    verifyAuthorization(body: {
        connectionId: string;
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
