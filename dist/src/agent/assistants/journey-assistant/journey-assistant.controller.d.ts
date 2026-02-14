import { JourneyAssistantService } from './services/journey-assistant.service';
import { JourneyChatRequestDto, JourneyBaseRequestDto, HandleEventRequestDto, AdjustScheduleRequestDto, JourneyAssistantResponseDto } from './dto/journey-assistant.dto';
export declare class JourneyAssistantController {
    private readonly journeyAssistantService;
    constructor(journeyAssistantService: JourneyAssistantService);
    chat(dto: JourneyChatRequestDto): Promise<JourneyAssistantResponseDto>;
    getStatus(tripId: string): Promise<JourneyAssistantResponseDto>;
    getReminders(tripId: string): Promise<JourneyAssistantResponseDto>;
    handleEvent(dto: HandleEventRequestDto): Promise<JourneyAssistantResponseDto>;
    adjustSchedule(dto: AdjustScheduleRequestDto): Promise<JourneyAssistantResponseDto>;
    emergencyHelp(dto: JourneyBaseRequestDto): Promise<JourneyAssistantResponseDto>;
    nearbySearch(dto: JourneyChatRequestDto): Promise<JourneyAssistantResponseDto>;
}
