import { RLTrajectory } from '../interfaces/trajectory.interface';
export interface PIIAnonymizationConfig {
    anonymize_user_ids?: boolean;
    anonymize_emails?: boolean;
    anonymize_phones?: boolean;
    anonymize_coordinates?: boolean;
    anonymize_timestamps?: boolean;
    hash_salt?: string;
}
export interface AnonymizedTrajectory extends RLTrajectory {
    anonymization_metadata: {
        anonymized_at: string;
        config: PIIAnonymizationConfig;
        anonymized_fields: string[];
    };
}
export declare class PIIAnonymizerService {
    private readonly logger;
    private readonly defaultConfig;
    anonymizeTrajectory(trajectory: RLTrajectory, config?: PIIAnonymizationConfig): Promise<AnonymizedTrajectory>;
    anonymizeField(fieldName: string, fieldValue: any, config?: PIIAnonymizationConfig): any;
    private anonymizeState;
    private anonymizeAction;
    private anonymizeUserRequest;
    private anonymizeCoordinates;
    private anonymizeItinerary;
    private anonymizeTimestamp;
    private hashValue;
}
