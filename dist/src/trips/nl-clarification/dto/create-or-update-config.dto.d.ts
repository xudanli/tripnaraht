import { DestinationClarificationConfig } from '../config/destination-clarification.config';
export declare class CreateOrUpdateDestinationClarificationConfigDto {
    destinationName: string;
    enabled: boolean;
    config: DestinationClarificationConfig;
    metadata?: Record<string, any>;
}
export declare class TestConfigDto {
    currentParams: Record<string, any>;
    userInput: string;
}
