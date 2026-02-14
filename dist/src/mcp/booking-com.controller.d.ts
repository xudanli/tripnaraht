import { BookingComService } from './booking-com.service';
import { BookingComMonitoringService } from './booking-com-monitoring.service';
import { SearchCarRentalsDto } from './dto/booking-com.dto';
export declare class BookingComController {
    private readonly bookingComService;
    private readonly monitoringService;
    private readonly logger;
    constructor(bookingComService: BookingComService, monitoringService: BookingComMonitoringService);
    searchCarRentals(dto: SearchCarRentalsDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    health(): Promise<import("../common/dto/standard-response.dto").StandardResponse<{
        available: boolean;
        service: string;
    }>>;
    getMonitoringStats(days?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    checkCostLimit(limit: string, days?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
