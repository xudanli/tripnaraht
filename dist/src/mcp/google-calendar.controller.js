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
var GoogleCalendarController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleCalendarController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const google_calendar_service_1 = require("./google-calendar.service");
const google_calendar_integration_service_1 = require("./google-calendar-integration.service");
const google_calendar_dto_1 = require("./dto/google-calendar.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let GoogleCalendarController = GoogleCalendarController_1 = class GoogleCalendarController {
    constructor(googleCalendarService, integrationService) {
        this.googleCalendarService = googleCalendarService;
        this.integrationService = integrationService;
        this.logger = new common_1.Logger(GoogleCalendarController_1.name);
    }
    async listTools() {
        try {
            const result = await this.googleCalendarService.listTools();
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('List tools failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取工具列表失败');
        }
    }
    async listCalendars() {
        try {
            const result = await this.googleCalendarService.listCalendars();
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('List calendars failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取日历列表失败');
        }
    }
    async listEvents(query) {
        try {
            const result = await this.googleCalendarService.listEvents(query);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('List events failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取事件列表失败');
        }
    }
    async createEvent(dto) {
        var _a;
        try {
            const result = await this.googleCalendarService.createEvent({
                calendarId: dto.calendarId,
                summary: dto.summary,
                start: dto.start.dateTime ? { dateTime: dto.start.dateTime, timeZone: dto.start.timeZone } : { date: dto.start.date },
                end: dto.end.dateTime ? { dateTime: dto.end.dateTime, timeZone: dto.end.timeZone } : { date: dto.end.date },
                description: dto.description,
                location: dto.location,
                attendees: (_a = dto.attendees) === null || _a === void 0 ? void 0 : _a.map(email => ({ email })),
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Create event failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '创建事件失败');
        }
    }
    async updateEvent(eventId, dto) {
        var _a, _b, _c, _d;
        try {
            const result = await this.googleCalendarService.updateEvent({
                calendarId: dto.calendarId,
                eventId,
                summary: dto.summary,
                start: ((_a = dto.start) === null || _a === void 0 ? void 0 : _a.dateTime) ? { dateTime: dto.start.dateTime, timeZone: dto.start.timeZone } : ((_b = dto.start) === null || _b === void 0 ? void 0 : _b.date) ? { date: dto.start.date } : undefined,
                end: ((_c = dto.end) === null || _c === void 0 ? void 0 : _c.dateTime) ? { dateTime: dto.end.dateTime, timeZone: dto.end.timeZone } : ((_d = dto.end) === null || _d === void 0 ? void 0 : _d.date) ? { date: dto.end.date } : undefined,
                description: dto.description,
                location: dto.location,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Update event failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '更新事件失败');
        }
    }
    async deleteEvent(eventId, dto) {
        try {
            const result = await this.googleCalendarService.deleteEvent({
                calendarId: dto.calendarId,
                eventId,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Delete event failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '删除事件失败');
        }
    }
    async findEvent(dto) {
        try {
            const result = await this.googleCalendarService.findEvent(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Find event failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '查找事件失败');
        }
    }
    async findFreeSlots(dto) {
        try {
            const result = await this.googleCalendarService.findFreeSlots(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Find free slots failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '查找空闲时间段失败');
        }
    }
    async quickAdd(dto) {
        try {
            const result = await this.googleCalendarService.quickAdd(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Quick add failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '快速添加事件失败');
        }
    }
    async getCurrentDateTime() {
        try {
            const result = await this.googleCalendarService.getCurrentDateTime();
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Get current time failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取当前时间失败');
        }
    }
    async syncTripToCalendar(tripId, body) {
        try {
            const result = await this.integrationService.syncTripToCalendar(tripId, body.userId, body.calendarId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Sync trip to calendar failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '同步行程到日历失败');
        }
    }
    async deleteTripEvents(tripId, body) {
        try {
            const result = await this.integrationService.deleteTripEvents(tripId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Delete trip events failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '删除行程日历事件失败');
        }
    }
};
exports.GoogleCalendarController = GoogleCalendarController;
__decorate([
    (0, common_1.Get)('tools'),
    (0, swagger_1.ApiOperation)({
        summary: '列出所有可用工具',
        description: '获取 Google Calendar MCP 服务器提供的所有工具列表',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GoogleCalendarController.prototype, "listTools", null);
__decorate([
    (0, common_1.Get)('calendars'),
    (0, swagger_1.ApiOperation)({
        summary: '列出所有日历',
        description: '获取用户的所有日历列表',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GoogleCalendarController.prototype, "listCalendars", null);
__decorate([
    (0, common_1.Get)('events'),
    (0, swagger_1.ApiOperation)({
        summary: '列出日历事件',
        description: '根据条件列出日历事件',
    }),
    (0, swagger_1.ApiQuery)({ name: 'calendarId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'timeMin', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'timeMax', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'maxResults', required: false, type: Number }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [google_calendar_dto_1.ListEventsDto]),
    __metadata("design:returntype", Promise)
], GoogleCalendarController.prototype, "listEvents", null);
__decorate([
    (0, common_1.Post)('events'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({
        summary: '创建日历事件',
        description: '创建一个新的日历事件',
    }),
    (0, swagger_1.ApiBody)({ type: google_calendar_dto_1.CreateEventDto }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: '创建成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [google_calendar_dto_1.CreateEventDto]),
    __metadata("design:returntype", Promise)
], GoogleCalendarController.prototype, "createEvent", null);
__decorate([
    (0, common_1.Post)('events/:eventId/update'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '更新日历事件',
        description: '更新指定的日历事件',
    }),
    (0, swagger_1.ApiParam)({ name: 'eventId', description: '事件 ID' }),
    (0, swagger_1.ApiBody)({ type: google_calendar_dto_1.UpdateEventDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '更新成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('eventId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, google_calendar_dto_1.UpdateEventDto]),
    __metadata("design:returntype", Promise)
], GoogleCalendarController.prototype, "updateEvent", null);
__decorate([
    (0, common_1.Post)('events/:eventId/delete'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '删除日历事件',
        description: '删除指定的日历事件',
    }),
    (0, swagger_1.ApiParam)({ name: 'eventId', description: '事件 ID' }),
    (0, swagger_1.ApiBody)({ type: google_calendar_dto_1.DeleteEventDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '删除成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('eventId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, google_calendar_dto_1.DeleteEventDto]),
    __metadata("design:returntype", Promise)
], GoogleCalendarController.prototype, "deleteEvent", null);
__decorate([
    (0, common_1.Post)('events/find'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '查找日历事件',
        description: '根据查询条件查找日历事件',
    }),
    (0, swagger_1.ApiBody)({ type: google_calendar_dto_1.FindEventDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '查找成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [google_calendar_dto_1.FindEventDto]),
    __metadata("design:returntype", Promise)
], GoogleCalendarController.prototype, "findEvent", null);
__decorate([
    (0, common_1.Post)('free-slots'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '查找空闲时间段',
        description: '查找指定时间范围内的空闲时间段',
    }),
    (0, swagger_1.ApiBody)({ type: google_calendar_dto_1.FindFreeSlotsDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '查找成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [google_calendar_dto_1.FindFreeSlotsDto]),
    __metadata("design:returntype", Promise)
], GoogleCalendarController.prototype, "findFreeSlots", null);
__decorate([
    (0, common_1.Post)('quick-add'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({
        summary: '快速添加事件',
        description: '使用自然语言快速添加日历事件',
    }),
    (0, swagger_1.ApiBody)({ type: google_calendar_dto_1.QuickAddDto }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: '添加成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [google_calendar_dto_1.QuickAddDto]),
    __metadata("design:returntype", Promise)
], GoogleCalendarController.prototype, "quickAdd", null);
__decorate([
    (0, common_1.Get)('current-time'),
    (0, swagger_1.ApiOperation)({
        summary: '获取当前日期时间',
        description: '获取当前日期时间（用于测试连接）',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GoogleCalendarController.prototype, "getCurrentDateTime", null);
__decorate([
    (0, common_1.Post)('trips/:tripId/sync'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '同步行程到 Google Calendar',
        description: '将 TripNara 行程同步到用户的 Google Calendar',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '用户 ID' },
                calendarId: { type: 'string', description: '目标日历 ID（可选）' },
            },
            required: ['userId'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '同步成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], GoogleCalendarController.prototype, "syncTripToCalendar", null);
__decorate([
    (0, common_1.Post)('trips/:tripId/delete-events'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '删除行程的所有日历事件',
        description: '删除指定行程的所有 Google Calendar 事件',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '用户 ID' },
            },
            required: ['userId'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '删除成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], GoogleCalendarController.prototype, "deleteTripEvents", null);
exports.GoogleCalendarController = GoogleCalendarController = GoogleCalendarController_1 = __decorate([
    (0, swagger_1.ApiTags)('google-calendar'),
    (0, common_1.Controller)('google-calendar'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [google_calendar_service_1.GoogleCalendarService,
        google_calendar_integration_service_1.GoogleCalendarIntegrationService])
], GoogleCalendarController);
//# sourceMappingURL=google-calendar.controller.js.map