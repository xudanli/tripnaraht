import { TransportOption, TransportMode } from '../../transport/interfaces/transport.interface';
import { RailPassProfile, RailSegment } from '../interfaces/railpass.interface';
import { ReservationDecisionEngineService } from '../services/reservation-decision-engine.service';
export interface EnhancedRailTransportOption extends TransportOption {
    mode: TransportMode.RAIL;
    railPassInfo?: {
        covered: boolean;
        reservationRequired: boolean;
        reservationFeeEstimate?: {
            min: number;
            max: number;
            currency: string;
        };
        reservationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
        consumesTravelDay?: boolean;
    };
}
export declare class TransportIntegrationService {
    private readonly reservationEngine;
    private readonly logger;
    constructor(reservationEngine: ReservationDecisionEngineService);
    enhanceRailTransportOption(transportOption: TransportOption, passProfile?: RailPassProfile, segmentHint?: Partial<RailSegment>): Promise<EnhancedRailTransportOption>;
    private checkPassCoverage;
    filterOptionsByRailPassConstraints(options: TransportOption[], passProfile?: RailPassProfile, constraints?: {
        avoidMandatoryReservations?: boolean;
        maxReservationFee?: number;
    }): TransportOption[];
    recommendBestRailOption(options: TransportOption[], passProfile?: RailPassProfile, preferences?: {
        preferNoReservation?: boolean;
        minimizeCost?: boolean;
        minimizeTime?: boolean;
    }): TransportOption | null;
}
