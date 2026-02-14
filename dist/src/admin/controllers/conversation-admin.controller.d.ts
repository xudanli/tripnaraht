import { NLConversationContextService } from '../../trips/services/nl-conversation-context.service';
export declare class ConversationAdminController {
    private readonly nlConversationContextService;
    private readonly logger;
    constructor(nlConversationContextService: NLConversationContextService);
    clearAllSessions(): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    getStats(): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
}
