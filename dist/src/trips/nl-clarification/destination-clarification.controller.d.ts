import { DestinationClarificationConfigService } from './services/destination-clarification-config.service';
import { GatePrecheckService } from './services/gate-precheck.service';
import { CreateOrUpdateDestinationClarificationConfigDto, TestConfigDto } from './dto/create-or-update-config.dto';
export declare class DestinationClarificationController {
    private readonly configService;
    private readonly gatePrecheckService;
    constructor(configService: DestinationClarificationConfigService, gatePrecheckService: GatePrecheckService);
    getAllConfigs(): Promise<import("../../common/dto/standard-response.dto").StandardResponse<{
        destinationCode: string;
        destinationName: string;
        enabled: boolean;
        metadata?: any;
        userPersonas?: {
            user_personas?: Array<{
                persona_id: string;
                persona_name: string;
            }>;
        };
    }[]>>;
    getConfig(destinationCode: string): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    createOrUpdateConfig(destinationCode: string, dto: CreateOrUpdateDestinationClarificationConfigDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<{
        message: string;
    }>>;
    enableConfig(destinationCode: string): Promise<import("../../common/dto/standard-response.dto").StandardResponse<{
        message: string;
    }>>;
    disableConfig(destinationCode: string): Promise<import("../../common/dto/standard-response.dto").StandardResponse<{
        message: string;
    }>>;
    testConfig(destinationCode: string, testScenario: TestConfigDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<{
        error: string;
        shouldUseGenericFlow: boolean;
    }> | import("../../common/dto/standard-response.dto").StandardResponse<{
        message: string;
        canCreateTrip: boolean;
    }> | import("../../common/dto/standard-response.dto").StandardResponse<{
        currentRound: {
            roundId: string;
            name: string;
            description: string;
        };
        questions: import("./config/destination-clarification.config").ClarificationQuestionDef[];
        gateCheck: any;
        needsClarification: boolean;
    }>>;
}
