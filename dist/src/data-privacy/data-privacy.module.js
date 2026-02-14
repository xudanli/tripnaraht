"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataPrivacyModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("../prisma/prisma.module");
const encryption_service_1 = require("./services/encryption.service");
const data_privacy_framework_service_1 = require("./services/data-privacy-framework.service");
const sensitive_data_handling_service_1 = require("./services/sensitive-data-handling.service");
let DataPrivacyModule = class DataPrivacyModule {
};
exports.DataPrivacyModule = DataPrivacyModule;
exports.DataPrivacyModule = DataPrivacyModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, prisma_module_1.PrismaModule],
        providers: [
            encryption_service_1.EncryptionService,
            data_privacy_framework_service_1.DataPrivacyFrameworkService,
            sensitive_data_handling_service_1.SensitiveDataHandlingService,
        ],
        exports: [
            encryption_service_1.EncryptionService,
            data_privacy_framework_service_1.DataPrivacyFrameworkService,
            sensitive_data_handling_service_1.SensitiveDataHandlingService,
        ],
    })
], DataPrivacyModule);
//# sourceMappingURL=data-privacy.module.js.map