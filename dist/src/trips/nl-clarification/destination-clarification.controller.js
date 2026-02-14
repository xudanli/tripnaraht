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
exports.DestinationClarificationController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../auth/decorators/public.decorator");
const destination_clarification_config_service_1 = require("./services/destination-clarification-config.service");
const gate_precheck_service_1 = require("./services/gate-precheck.service");
const create_or_update_config_dto_1 = require("./dto/create-or-update-config.dto");
const standard_response_dto_1 = require("../../common/dto/standard-response.dto");
let DestinationClarificationController = class DestinationClarificationController {
    constructor(configService, gatePrecheckService) {
        this.configService = configService;
        this.gatePrecheckService = gatePrecheckService;
    }
    async getAllConfigs() {
        const configs = await this.configService.getAllConfigs();
        return (0, standard_response_dto_1.successResponse)(configs);
    }
    async getConfig(destinationCode) {
        const config = await this.configService.getConfig(destinationCode);
        if (!config) {
            return (0, standard_response_dto_1.successResponse)(null);
        }
        return (0, standard_response_dto_1.successResponse)(config);
    }
    async createOrUpdateConfig(destinationCode, dto) {
        await this.configService.createOrUpdateConfig(destinationCode, dto.config, 'admin');
        return (0, standard_response_dto_1.successResponse)({ message: '配置已保存' });
    }
    async enableConfig(destinationCode) {
        await this.configService.setEnabled(destinationCode, true, 'admin');
        return (0, standard_response_dto_1.successResponse)({ message: '配置已启用' });
    }
    async disableConfig(destinationCode) {
        await this.configService.setEnabled(destinationCode, false, 'admin');
        return (0, standard_response_dto_1.successResponse)({ message: '配置已禁用' });
    }
    async testConfig(destinationCode, testScenario) {
        const config = await this.configService.getConfig(destinationCode);
        if (!config) {
            return (0, standard_response_dto_1.successResponse)({
                error: '配置不存在或未启用',
                shouldUseGenericFlow: true,
            });
        }
        const roundInfo = await this.configService.getCurrentRoundQuestions(destinationCode, testScenario.currentParams, []);
        if (!roundInfo) {
            return (0, standard_response_dto_1.successResponse)({
                message: '所有轮次已完成，可以创建行程',
                canCreateTrip: true,
            });
        }
        let gateResult = null;
        if (roundInfo.shouldTriggerGate && config.gatePrechecks) {
            gateResult = await this.gatePrecheckService.executePrechecks(config.gatePrechecks, testScenario.currentParams, destinationCode);
        }
        return (0, standard_response_dto_1.successResponse)({
            currentRound: {
                roundId: roundInfo.round.roundId,
                name: roundInfo.round.name,
                description: roundInfo.round.description,
            },
            questions: roundInfo.questions,
            gateCheck: gateResult,
            needsClarification: true,
        });
    }
};
exports.DestinationClarificationController = DestinationClarificationController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '获取所有目的地澄清配置' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功获取配置列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DestinationClarificationController.prototype, "getAllConfigs", null);
__decorate([
    (0, common_1.Get)(':destinationCode'),
    (0, swagger_1.ApiOperation)({ summary: '获取目的地澄清配置' }),
    (0, swagger_1.ApiParam)({ name: 'destinationCode', description: '目的地代码（ISO 3166-1 alpha-2）' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功获取配置' }),
    __param(0, (0, common_1.Param)('destinationCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DestinationClarificationController.prototype, "getConfig", null);
__decorate([
    (0, common_1.Post)(':destinationCode'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '创建或更新目的地澄清配置' }),
    (0, swagger_1.ApiParam)({ name: 'destinationCode', description: '目的地代码' }),
    (0, swagger_1.ApiBody)({ type: create_or_update_config_dto_1.CreateOrUpdateDestinationClarificationConfigDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '配置已保存' }),
    __param(0, (0, common_1.Param)('destinationCode')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_or_update_config_dto_1.CreateOrUpdateDestinationClarificationConfigDto]),
    __metadata("design:returntype", Promise)
], DestinationClarificationController.prototype, "createOrUpdateConfig", null);
__decorate([
    (0, common_1.Patch)(':destinationCode/enable'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '启用目的地澄清配置' }),
    (0, swagger_1.ApiParam)({ name: 'destinationCode', description: '目的地代码' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '配置已启用' }),
    __param(0, (0, common_1.Param)('destinationCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DestinationClarificationController.prototype, "enableConfig", null);
__decorate([
    (0, common_1.Patch)(':destinationCode/disable'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '禁用目的地澄清配置' }),
    (0, swagger_1.ApiParam)({ name: 'destinationCode', description: '目的地代码' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '配置已禁用' }),
    __param(0, (0, common_1.Param)('destinationCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DestinationClarificationController.prototype, "disableConfig", null);
__decorate([
    (0, common_1.Post)(':destinationCode/test'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '测试目的地澄清配置' }),
    (0, swagger_1.ApiParam)({ name: 'destinationCode', description: '目的地代码' }),
    (0, swagger_1.ApiBody)({ type: create_or_update_config_dto_1.TestConfigDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '测试结果' }),
    __param(0, (0, common_1.Param)('destinationCode')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_or_update_config_dto_1.TestConfigDto]),
    __metadata("design:returntype", Promise)
], DestinationClarificationController.prototype, "testConfig", null);
exports.DestinationClarificationController = DestinationClarificationController = __decorate([
    (0, common_1.Controller)('admin/destination-clarification'),
    (0, swagger_1.ApiTags)('Admin - 目的地澄清配置'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [destination_clarification_config_service_1.DestinationClarificationConfigService,
        gate_precheck_service_1.GatePrecheckService])
], DestinationClarificationController);
//# sourceMappingURL=destination-clarification.controller.js.map