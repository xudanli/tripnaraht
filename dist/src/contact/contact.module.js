"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const contact_controller_1 = require("./contact.controller");
const contact_service_1 = require("./services/contact.service");
const file_storage_service_1 = require("./services/file-storage.service");
const rate_limit_service_1 = require("./services/rate-limit.service");
const contact_notification_service_1 = require("./services/contact-notification.service");
const redis_module_1 = require("../redis/redis.module");
const prisma_module_1 = require("../prisma/prisma.module");
let ContactModule = class ContactModule {
};
exports.ContactModule = ContactModule;
exports.ContactModule = ContactModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, redis_module_1.RedisModule, config_1.ConfigModule],
        controllers: [contact_controller_1.ContactController],
        providers: [
            contact_service_1.ContactService,
            file_storage_service_1.FileStorageService,
            rate_limit_service_1.RateLimitService,
            contact_notification_service_1.ContactNotificationService,
        ],
        exports: [contact_service_1.ContactService],
    })
], ContactModule);
//# sourceMappingURL=contact.module.js.map