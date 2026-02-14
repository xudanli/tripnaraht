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
Object.defineProperty(exports, "__esModule", { value: true });
exports.KPUConfigService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let KPUConfigService = class KPUConfigService {
    constructor(configService) {
        this.configService = configService;
    }
    getConfig() {
        return {
            enableSnippetValidation: this.configService.get('kpu.enableSnippetValidation', true),
            minValidationScore: this.configService.get('kpu.minValidationScore', 0.6),
            enableFactCheck: this.configService.get('kpu.enableFactCheck', true),
            enableConsistencyCheck: this.configService.get('kpu.enableConsistencyCheck', true),
            enableCitationCheck: this.configService.get('kpu.enableCitationCheck', true),
            cacheTTL: this.configService.get('kpu.cacheTTL', 3600),
            cacheEnabled: this.configService.get('kpu.cacheEnabled', true),
            cacheMemorySize: this.configService.get('kpu.cacheMemorySize', 1000),
            cacheRedisEnabled: this.configService.get('kpu.cacheRedisEnabled', true),
            defaultLlmProvider: this.configService.get('kpu.defaultLlmProvider', 'DEEPSEEK'),
            maxConcurrentValidations: this.configService.get('kpu.maxConcurrentValidations', 10),
            maxConcurrentGenerations: this.configService.get('kpu.maxConcurrentGenerations', 5),
            validationTimeout: this.configService.get('kpu.validationTimeout', 5000),
            generationTimeout: this.configService.get('kpu.generationTimeout', 10000),
        };
    }
    getDefaultValidationOptions() {
        const config = this.getConfig();
        return {
            enableFactCheck: config.enableFactCheck,
            enableConsistencyCheck: config.enableConsistencyCheck,
            enableCitationCheck: config.enableCitationCheck,
        };
    }
};
exports.KPUConfigService = KPUConfigService;
exports.KPUConfigService = KPUConfigService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], KPUConfigService);
//# sourceMappingURL=kpu-config.service.js.map