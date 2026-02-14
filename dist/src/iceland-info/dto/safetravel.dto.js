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
exports.SafetravelQueryDto = exports.SafetravelResponseDto = exports.SafetravelTravelConditionsDto = exports.SafetravelAlertDto = exports.AlertType = exports.AlertSeverity = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var AlertSeverity;
(function (AlertSeverity) {
    AlertSeverity["LOW"] = "low";
    AlertSeverity["MEDIUM"] = "medium";
    AlertSeverity["HIGH"] = "high";
    AlertSeverity["CRITICAL"] = "critical";
})(AlertSeverity || (exports.AlertSeverity = AlertSeverity = {}));
var AlertType;
(function (AlertType) {
    AlertType["WEATHER"] = "weather";
    AlertType["ROAD"] = "road";
    AlertType["TRAVEL"] = "travel";
    AlertType["GENERAL"] = "general";
})(AlertType || (exports.AlertType = AlertType = {}));
class SafetravelAlertDto {
}
exports.SafetravelAlertDto = SafetravelAlertDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '警报ID' }),
    __metadata("design:type", String)
], SafetravelAlertDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '警报标题' }),
    __metadata("design:type", String)
], SafetravelAlertDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '警报内容' }),
    __metadata("design:type", String)
], SafetravelAlertDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '警报类型', enum: AlertType }),
    __metadata("design:type", String)
], SafetravelAlertDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '严重程度', enum: AlertSeverity }),
    __metadata("design:type", String)
], SafetravelAlertDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '生效时间' }),
    __metadata("design:type", String)
], SafetravelAlertDto.prototype, "effectiveTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '过期时间' }),
    __metadata("design:type", String)
], SafetravelAlertDto.prototype, "expiryTime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '相关区域' }),
    __metadata("design:type", Array)
], SafetravelAlertDto.prototype, "regions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '相关F路' }),
    __metadata("design:type", Array)
], SafetravelAlertDto.prototype, "fRoads", void 0);
class SafetravelTravelConditionsDto {
}
exports.SafetravelTravelConditionsDto = SafetravelTravelConditionsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '区域名称' }),
    __metadata("design:type", String)
], SafetravelTravelConditionsDto.prototype, "region", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '路况状态', enum: ['open', 'closed', 'caution', 'impassable'] }),
    __metadata("design:type", String)
], SafetravelTravelConditionsDto.prototype, "roadStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '天气状态', enum: ['good', 'fair', 'poor', 'dangerous'] }),
    __metadata("design:type", String)
], SafetravelTravelConditionsDto.prototype, "weatherStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '综合状态', enum: ['green', 'yellow', 'orange', 'red'] }),
    __metadata("design:type", String)
], SafetravelTravelConditionsDto.prototype, "overallStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '状态描述' }),
    __metadata("design:type", String)
], SafetravelTravelConditionsDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最后更新时间' }),
    __metadata("design:type", String)
], SafetravelTravelConditionsDto.prototype, "lastUpdated", void 0);
class SafetravelResponseDto {
}
exports.SafetravelResponseDto = SafetravelResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '当前警报列表', type: [SafetravelAlertDto] }),
    __metadata("design:type", Array)
], SafetravelResponseDto.prototype, "alerts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '旅行条件', type: [SafetravelTravelConditionsDto] }),
    __metadata("design:type", Array)
], SafetravelResponseDto.prototype, "travelConditions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最后更新时间' }),
    __metadata("design:type", String)
], SafetravelResponseDto.prototype, "lastUpdated", void 0);
class SafetravelQueryDto {
}
exports.SafetravelQueryDto = SafetravelQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '区域过滤',
        example: 'highlands',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SafetravelQueryDto.prototype, "region", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '警报类型过滤',
        enum: AlertType,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(AlertType),
    __metadata("design:type", String)
], SafetravelQueryDto.prototype, "alertType", void 0);
//# sourceMappingURL=safetravel.dto.js.map