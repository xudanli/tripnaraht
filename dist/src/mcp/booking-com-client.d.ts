export interface SearchCarRentalsParams {
    pick_up_latitude: number;
    pick_up_longitude: number;
    drop_off_latitude: number;
    drop_off_longitude: number;
    pick_up_time: string;
    drop_off_time: string;
    driver_age: number;
    currency_code?: string;
    location?: string;
    pick_up_date?: string;
    drop_off_date?: string;
}
export interface CarRental {
    id: string;
    company: string;
    vehicle_type: string;
    price: {
        amount: number;
        currency: string;
    };
    pickup_location: {
        lat: number;
        lng: number;
        address: string;
    };
    dropoff_location: {
        lat: number;
        lng: number;
        address: string;
    };
    pickup_time: string;
    dropoff_time: string;
    [key: string]: any;
}
export interface SearchCarRentalsResponse {
    data: CarRental[];
    meta?: {
        total: number;
        [key: string]: any;
    };
}
export declare class BookingComMcpClient {
    private axiosInstance;
    private readonly apiKey;
    private readonly apiHost;
    private readonly baseURL;
    constructor();
    searchCarRentals(params: SearchCarRentalsParams): Promise<SearchCarRentalsResponse>;
}
