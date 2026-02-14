import { DayScheduleResult } from '../planning-policy/interfaces/scheduler.interface';
import { AssistantAction } from '../assist/dto/action.dto';
import { PlaceToPoiHelperService } from '../planning-policy/services/place-to-poi-helper.service';
import { StandardResponse } from '../common/dto/standard-response.dto';
export declare class ScheduleActionService {
    private readonly placeToPoiHelper;
    private readonly logger;
    private readonly timelineRebuilder;
    constructor(placeToPoiHelper: PlaceToPoiHelperService);
    apply(schedule: DayScheduleResult, action: AssistantAction): Promise<StandardResponse<{
        applied: boolean;
        newSchedule?: DayScheduleResult;
        answer?: {
            title: string;
            details: string;
        };
        message?: string;
    }>>;
    private queryNextStop;
    private movePoiToMorning;
    private addPoiToSchedule;
    private formatTime;
    preview(schedule: DayScheduleResult, action: AssistantAction): Promise<StandardResponse<{
        applied: boolean;
        canApply: boolean;
        diff?: {
            movedStops: Array<{
                id: string;
                name: string;
                from: number;
                to: number;
            }>;
            addedStops: Array<{
                id: string;
                name: string;
                position: number;
            }>;
            removedStops: Array<{
                id: string;
                name: string;
            }>;
            affectedStopCount: number;
        };
        warnings: string[];
        newSchedule?: DayScheduleResult;
        message: string;
    }>>;
    private calculateDiff;
    private generateWarnings;
}
