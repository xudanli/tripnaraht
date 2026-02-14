"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleCalendarModule = void 0;
const common_1 = require("@nestjs/common");
const google_calendar_controller_1 = require("./google-calendar.controller");
const google_calendar_service_1 = require("./google-calendar.service");
const google_calendar_integration_service_1 = require("./google-calendar-integration.service");
const prisma_module_1 = require("../prisma/prisma.module");
const redis_module_1 = require("../redis/redis.module");
let GoogleCalendarModule = class GoogleCalendarModule {
};
exports.GoogleCalendarModule = GoogleCalendarModule;
exports.GoogleCalendarModule = GoogleCalendarModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, redis_module_1.RedisModule],
        controllers: [google_calendar_controller_1.GoogleCalendarController],
        providers: [google_calendar_service_1.GoogleCalendarService, google_calendar_integration_service_1.GoogleCalendarIntegrationService],
        exports: [google_calendar_service_1.GoogleCalendarService, google_calendar_integration_service_1.GoogleCalendarIntegrationService],
    })
], GoogleCalendarModule);
//# sourceMappingURL=google-calendar.module.js.map