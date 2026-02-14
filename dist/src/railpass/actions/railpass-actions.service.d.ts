import { RailSegment, ReservationTask, FallbackOption } from '../interfaces/railpass.interface';
import { ReservationDecisionEngineService } from '../services/reservation-decision-engine.service';
import { ReservationOrchestrationService } from '../services/reservation-orchestration.service';
export type RailPassActionType = 'BOOK_RESERVATION' | 'SWITCH_TO_NO_RESERVATION_ROUTE' | 'SHIFT_DEPARTURE_TIME' | 'MOVE_SEGMENT_TO_OTHER_DAY' | 'REPLACE_RAIL_WITH_FLIGHT_OR_BUS' | 'SPLIT_NIGHT_TRAIN' | 'MERGE_SEGMENTS_SAME_DAY';
export interface RailPassActionResult {
    actionType: RailPassActionType;
    success: boolean;
    segmentId: string;
    newSegment?: RailSegment;
    reservationTask?: ReservationTask;
    fallbackOption?: FallbackOption;
    explanation: string;
    impact?: {
        timeDeltaMinutes?: number;
        costDeltaEur?: number;
        travelDaysDelta?: number;
    };
}
export declare class RailPassActionsService {
    private readonly reservationEngine;
    private readonly reservationOrchestrator;
    private readonly logger;
    constructor(reservationEngine: ReservationDecisionEngineService, reservationOrchestrator: ReservationOrchestrationService);
    bookReservation(segment: RailSegment, task: ReservationTask): Promise<RailPassActionResult>;
    switchToNoReservationRoute(segment: RailSegment): Promise<RailPassActionResult>;
    shiftDepartureTime(segment: RailSegment, deltaHours?: number): Promise<RailPassActionResult>;
    moveSegmentToOtherDay(segment: RailSegment, newDate: string): Promise<RailPassActionResult>;
    replaceRailWithAlternative(segment: RailSegment, alternative: 'FLIGHT' | 'BUS'): Promise<RailPassActionResult>;
    splitNightTrain(segment: RailSegment): Promise<RailPassActionResult>;
    mergeSegmentsSameDay(segments: RailSegment[]): Promise<RailPassActionResult[]>;
    private estimateReservationCost;
    private shiftTime;
    suggestActionsForViolation(violationCode: string, segment: RailSegment): RailPassActionType[];
}
