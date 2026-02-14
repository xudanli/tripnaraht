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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JourneyAssistantController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const journey_assistant_service_1 = require("./services/journey-assistant.service");
const public_decorator_1 = require("../../../auth/decorators/public.decorator");
const journey_assistant_dto_1 = require("./dto/journey-assistant.dto");
let JourneyAssistantController = class JourneyAssistantController {
    constructor(journeyAssistantService) {
        this.journeyAssistantService = journeyAssistantService;
    }
    async chat(dto) {
        return await this.journeyAssistantService.handle({
            action: 'chat',
            tripId: dto.tripId,
            userId: dto.userId,
            message: dto.message,
            language: dto.language,
            context: dto.context ? {
                currentLocation: dto.context.currentLocation ? {
                    lat: dto.context.currentLocation.lat,
                    lng: dto.context.currentLocation.lng,
                } : undefined,
                timezone: dto.context.timezone,
            } : undefined,
        });
    }
    async getStatus(tripId) {
        return await this.journeyAssistantService.handle({
            action: 'get_status',
            tripId,
            userId: 'default',
        });
    }
    async getReminders(tripId) {
        return await this.journeyAssistantService.handle({
            action: 'get_reminders',
            tripId,
            userId: 'default',
        });
    }
    async handleEvent(dto) {
        return await this.journeyAssistantService.handle({
            action: 'handle_event',
            tripId: dto.tripId,
            userId: dto.userId,
            eventId: dto.eventId,
            selectedOptionId: dto.selectedOptionId,
            language: dto.language,
            context: dto.context ? {
                currentLocation: dto.context.currentLocation ? {
                    lat: dto.context.currentLocation.lat,
                    lng: dto.context.currentLocation.lng,
                } : undefined,
                timezone: dto.context.timezone,
            } : undefined,
        });
    }
    async adjustSchedule(dto) {
        return await this.journeyAssistantService.handle({
            action: 'adjust_schedule',
            tripId: dto.tripId,
            userId: dto.userId,
            adjustmentParams: {
                itemId: dto.adjustmentParams.itemId,
                newTime: dto.adjustmentParams.newTime,
                cancel: dto.adjustmentParams.cancel,
                replace: dto.adjustmentParams.replace,
            },
            language: dto.language,
            context: dto.context ? {
                currentLocation: dto.context.currentLocation ? {
                    lat: dto.context.currentLocation.lat,
                    lng: dto.context.currentLocation.lng,
                } : undefined,
                timezone: dto.context.timezone,
            } : undefined,
        });
    }
    async emergencyHelp(dto) {
        return await this.journeyAssistantService.handle({
            action: 'chat',
            tripId: dto.tripId,
            userId: dto.userId,
            message: '紧急求助 SOS',
            language: dto.language,
            context: dto.context ? {
                currentLocation: dto.context.currentLocation ? {
                    lat: dto.context.currentLocation.lat,
                    lng: dto.context.currentLocation.lng,
                } : undefined,
                timezone: dto.context.timezone,
            } : undefined,
        });
    }
    async nearbySearch(dto) {
        const searchMessage = dto.message || '附近有什么好吃的';
        return await this.journeyAssistantService.handle({
            action: 'chat',
            tripId: dto.tripId,
            userId: dto.userId,
            message: searchMessage,
            language: dto.language,
            context: dto.context ? {
                currentLocation: dto.context.currentLocation ? {
                    lat: dto.context.currentLocation.lat,
                    lng: dto.context.currentLocation.lng,
                } : undefined,
                timezone: dto.context.timezone,
            } : undefined,
        });
    }
};
exports.JourneyAssistantController = JourneyAssistantController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('chat'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '与行程助手对话',
        description: '旅途中与行程助手对话，可查询行程、寻找附近地点、请求导航等'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '对话成功',
        type: journey_assistant_dto_1.JourneyAssistantResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [journey_assistant_dto_1.JourneyChatRequestDto]),
    __metadata("design:returntype", Promise)
], JourneyAssistantController.prototype, "chat", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trips/:tripId/status'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程状态',
        description: '获取当前行程的状态，包括今日安排、进度、预算使用情况等'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: journey_assistant_dto_1.JourneyAssistantResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], JourneyAssistantController.prototype, "getStatus", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trips/:tripId/reminders'),
    (0, swagger_1.ApiOperation)({
        summary: '获取提醒列表',
        description: '获取当前行程的所有待办提醒'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: journey_assistant_dto_1.JourneyAssistantResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], JourneyAssistantController.prototype, "getReminders", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('events/handle'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '处理突发事件',
        description: '处理航班延误、景点关闭等突发事件，获取应急方案或执行已选方案'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '处理成功',
        type: journey_assistant_dto_1.JourneyAssistantResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [journey_assistant_dto_1.HandleEventRequestDto]),
    __metadata("design:returntype", Promise)
], JourneyAssistantController.prototype, "handleEvent", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('schedule/adjust'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '调整行程',
        description: '调整行程安排，包括改时间、取消活动、替换活动等'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '调整成功',
        type: journey_assistant_dto_1.JourneyAssistantResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [journey_assistant_dto_1.AdjustScheduleRequestDto]),
    __metadata("design:returntype", Promise)
], JourneyAssistantController.prototype, "adjustSchedule", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('emergency'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '紧急求助',
        description: '紧急情况下获取帮助，包括医院、警察、大使馆等信息'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: journey_assistant_dto_1.JourneyAssistantResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [journey_assistant_dto_1.JourneyBaseRequestDto]),
    __metadata("design:returntype", Promise)
], JourneyAssistantController.prototype, "emergencyHelp", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('nearby'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '附近搜索',
        description: '搜索附近的餐厅、景点、医院等'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '搜索成功',
        type: journey_assistant_dto_1.JourneyAssistantResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [journey_assistant_dto_1.JourneyChatRequestDto]),
    __metadata("design:returntype", Promise)
], JourneyAssistantController.prototype, "nearbySearch", null);
exports.JourneyAssistantController = JourneyAssistantController = __decorate([
    (0, swagger_1.ApiTags)('行程助手智能体'),
    (0, common_1.Controller)('agent/journey-assistant'),
    __metadata("design:paramtypes", [journey_assistant_service_1.JourneyAssistantService])
], JourneyAssistantController);
//# sourceMappingURL=journey-assistant.controller.js.map