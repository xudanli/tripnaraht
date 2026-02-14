"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BookingComService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingComService = void 0;
const common_1 = require("@nestjs/common");
const booking_com_client_1 = require("./booking-com-client");
const redis_service_1 = require("../redis/redis.service");
let BookingComService = BookingComService_1 = class BookingComService {
    constructor(redisService) {
        this.redisService = redisService;
        this.logger = new common_1.Logger(BookingComService_1.name);
        this.client = null;
        try {
            this.client = new booking_com_client_1.BookingComMcpClient();
            this.logger.log('✅ Booking.com Service initialized successfully');
        }
        catch (error) {
            this.logger.warn(`⚠️  Failed to initialize Booking.com client: ${error.message}`);
            this.logger.warn('💡 Booking.com features will be disabled until API Key is configured');
            this.logger.warn('📝 Please set RAPIDAPI_BOOKING_COM_API_KEY in .env file and restart the server');
            this.client = null;
        }
    }
    async searchCarRentals(params) {
        if (!this.client) {
            throw new Error('Booking.com client is not available. Please check RAPIDAPI_BOOKING_COM_API_KEY configuration.');
        }
        try {
            return await this.client.searchCarRentals(params);
        }
        catch (error) {
            this.logger.error(`Failed to search car rentals: ${error.message}`);
            throw error;
        }
    }
    isAvailable() {
        return this.client !== null;
    }
};
exports.BookingComService = BookingComService;
exports.BookingComService = BookingComService = BookingComService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], BookingComService);
//# sourceMappingURL=booking-com.service.js.map