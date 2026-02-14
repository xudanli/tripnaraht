import { RailSegment, ReservationRequirement, FallbackOption } from '../interfaces/railpass.interface';
export declare class ReservationDecisionEngineService {
    private readonly logger;
    checkReservation(segment: RailSegment): ReservationRequirement;
    private checkMandatoryReservation;
    private estimateReservationFee;
    private assessQuotaRisk;
    private determineBookingChannels;
    private collectRiskFactors;
    generateFallbackOptions(segment: RailSegment): FallbackOption[];
}
