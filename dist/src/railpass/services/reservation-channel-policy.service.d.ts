import { RailSegment } from '../interfaces/railpass.interface';
import { ReservationChannel } from '../interfaces/railpass.interface';
export interface ReservationChannelPolicy {
    countryCode: string;
    operator?: string;
    preferredChannels: ReservationChannel[];
    supportsApiBooking: boolean;
    supportsOnlineBooking: boolean;
    requiresOfflineBooking: boolean;
    bookingUrl?: string;
    instructions: string;
    recommendedAdvanceDays?: number;
}
export declare class ReservationChannelPolicyService {
    private readonly logger;
    private readonly channelPolicies;
    getChannelPolicy(segment: RailSegment): ReservationChannelPolicy;
    generateBookingChecklist(segments: RailSegment[]): Array<{
        segmentId: string;
        from: string;
        to: string;
        policy: ReservationChannelPolicy;
        urgency: 'LOW' | 'MEDIUM' | 'HIGH';
        bookingDeadline?: string;
    }>;
}
