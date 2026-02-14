"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingComMcpClient = void 0;
const axios_1 = __importDefault(require("axios"));
class BookingComMcpClient {
    constructor() {
        this.baseURL = 'https://booking-com15.p.rapidapi.com/api/v1/cars';
        this.apiKey = process.env.RAPIDAPI_BOOKING_COM_API_KEY || '';
        this.apiHost = process.env.RAPIDAPI_BOOKING_COM_HOST || 'booking-com15.p.rapidapi.com';
        if (!this.apiKey || this.apiKey.trim() === '') {
            throw new Error('RAPIDAPI_BOOKING_COM_API_KEY environment variable is required. ' +
                'Please set it in .env file and restart the server.');
        }
        this.axiosInstance = axios_1.default.create({
            baseURL: this.baseURL,
            headers: {
                'x-rapidapi-host': this.apiHost,
                'x-rapidapi-key': this.apiKey,
            },
            timeout: 10000,
        });
    }
    async searchCarRentals(params) {
        var _a, _b, _c;
        try {
            const response = await this.axiosInstance.get('/searchCarRentals', {
                params: {
                    pick_up_latitude: params.pick_up_latitude,
                    pick_up_longitude: params.pick_up_longitude,
                    drop_off_latitude: params.drop_off_latitude,
                    drop_off_longitude: params.drop_off_longitude,
                    pick_up_time: params.pick_up_time,
                    drop_off_time: params.drop_off_time,
                    driver_age: params.driver_age,
                    currency_code: params.currency_code || 'USD',
                    location: params.location || 'US',
                    ...(params.pick_up_date && { pick_up_date: params.pick_up_date }),
                    ...(params.drop_off_date && { drop_off_date: params.drop_off_date }),
                },
            });
            return {
                data: ((_a = response.data) === null || _a === void 0 ? void 0 : _a.data) || response.data || [],
                meta: (_b = response.data) === null || _b === void 0 ? void 0 : _b.meta,
            };
        }
        catch (error) {
            if (error.response) {
                throw new Error(`Booking.com API error: ${error.response.status} - ${((_c = error.response.data) === null || _c === void 0 ? void 0 : _c.message) || error.message}`);
            }
            else if (error.request) {
                throw new Error('Booking.com API request timeout or network error');
            }
            else {
                throw new Error(`Booking.com API request error: ${error.message}`);
            }
        }
    }
}
exports.BookingComMcpClient = BookingComMcpClient;
//# sourceMappingURL=booking-com-client.js.map