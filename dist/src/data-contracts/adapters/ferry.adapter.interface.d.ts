import { FerrySchedule, FerryQuery } from '../interfaces/ferry-schedule.interface';
export interface FerryAdapter {
    getSchedule(query: FerryQuery): Promise<FerrySchedule[]>;
    getSupportedCountries(): string[];
    getPriority(): number;
    getName(): string;
}
