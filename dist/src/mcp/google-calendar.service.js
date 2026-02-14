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
var GoogleCalendarService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleCalendarService = void 0;
const common_1 = require("@nestjs/common");
const google_calendar_client_1 = require("./google-calendar-client");
let GoogleCalendarService = GoogleCalendarService_1 = class GoogleCalendarService {
    constructor() {
        this.logger = new common_1.Logger(GoogleCalendarService_1.name);
        this.isConnected = false;
        this.client = new google_calendar_client_1.GoogleCalendarMcpClient();
    }
    async onModuleInit() {
        this.logger.log('Google Calendar Service initialized (lazy connection)');
    }
    async onModuleDestroy() {
        try {
            await this.disconnect();
        }
        catch (error) {
            this.logger.warn(`Failed to disconnect from Google Calendar MCP: ${error.message}`);
        }
    }
    async connect() {
        if (this.isConnected) {
            return;
        }
        try {
            await this.client.connect();
            this.isConnected = true;
            this.logger.log('Connected to Google Calendar MCP server');
        }
        catch (error) {
            this.logger.error(`Failed to connect: ${error.message}`);
            throw error;
        }
    }
    async disconnect() {
        if (!this.isConnected) {
            return;
        }
        try {
            await this.client.disconnect();
            this.isConnected = false;
            this.logger.log('Disconnected from Google Calendar MCP server');
        }
        catch (error) {
            this.logger.error(`Failed to disconnect: ${error.message}`);
        }
    }
    async ensureConnected() {
        var _a;
        if (this.isConnected) {
            return;
        }
        try {
            await this.connect();
        }
        catch (error) {
            if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('already started')) {
                try {
                    await this.client.listTools();
                    this.isConnected = true;
                    this.logger.log('Transport already started, connection verified');
                    return;
                }
                catch (verifyError) {
                    this.logger.warn('Connection verification failed, reconnecting...');
                    this.isConnected = false;
                    try {
                        await this.client.disconnect();
                    }
                    catch {
                    }
                    await this.connect();
                }
            }
            else {
                throw error;
            }
        }
    }
    async listTools() {
        await this.ensureConnected();
        return await this.client.listTools();
    }
    async listEvents(params = {}) {
        await this.ensureConnected();
        return await this.client.listEvents(params);
    }
    async createEvent(params) {
        await this.ensureConnected();
        return await this.client.createEvent(params);
    }
    async deleteEvent(params) {
        await this.ensureConnected();
        return await this.client.deleteEvent(params);
    }
    async updateEvent(params) {
        await this.ensureConnected();
        return await this.client.updateEvent(params);
    }
    async findEvent(params) {
        await this.ensureConnected();
        return await this.client.findEvent(params);
    }
    async getCurrentDateTime() {
        await this.ensureConnected();
        return await this.client.getCurrentDateTime();
    }
    async findFreeSlots(params) {
        await this.ensureConnected();
        return await this.client.findFreeSlots(params);
    }
    async listCalendars() {
        await this.ensureConnected();
        return await this.client.listCalendars();
    }
    async quickAdd(params) {
        await this.ensureConnected();
        return await this.client.quickAdd(params);
    }
};
exports.GoogleCalendarService = GoogleCalendarService;
exports.GoogleCalendarService = GoogleCalendarService = GoogleCalendarService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], GoogleCalendarService);
//# sourceMappingURL=google-calendar.service.js.map