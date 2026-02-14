import { TransportSchedule, TransportQuery } from '../interfaces/transport-schedule.interface';
export interface TransportAdapter {
    getSchedule(query: TransportQuery): Promise<TransportSchedule[]>;
    getSupportedCountries(): string[];
    getPriority(): number;
    getName(): string;
}
