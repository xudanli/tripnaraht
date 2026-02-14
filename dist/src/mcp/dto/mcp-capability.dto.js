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
exports.QueryCapabilitiesDto = exports.BatchUpdateCapabilityStatusDto = exports.UpdateCapabilityStatusDto = exports.McpCapabilityDto = exports.McpCapabilityStatus = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var McpCapabilityStatus;
(function (McpCapabilityStatus) {
    McpCapabilityStatus["ENABLED"] = "enabled";
    McpCapabilityStatus["DISABLED"] = "disabled";
})(McpCapabilityStatus || (exports.McpCapabilityStatus = McpCapabilityStatus = {}));
class McpCapabilityDto {
}
exports.McpCapabilityDto = McpCapabilityDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '服务名称', example: 'google_maps' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], McpCapabilityDto.prototype, "serviceName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '服务显示名称', example: 'Google Maps' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], McpCapabilityDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '服务描述', example: 'Google Maps API 服务，提供地点搜索、路线规划、地理编码等功能' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], McpCapabilityDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否启用', example: true }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], McpCapabilityDto.prototype, "enabled", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '工具列表', example: ['google_maps.searchPlaces', 'google_maps.getRoute'] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], McpCapabilityDto.prototype, "tools", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '服务分类', example: 'mapping' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], McpCapabilityDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否需要认证', example: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], McpCapabilityDto.prototype, "authRequired", void 0);
class UpdateCapabilityStatusDto {
}
exports.UpdateCapabilityStatusDto = UpdateCapabilityStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '服务名称', example: 'google_maps' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateCapabilityStatusDto.prototype, "serviceName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '启用状态', enum: McpCapabilityStatus, example: McpCapabilityStatus.ENABLED }),
    (0, class_validator_1.IsEnum)(McpCapabilityStatus),
    __metadata("design:type", String)
], UpdateCapabilityStatusDto.prototype, "status", void 0);
class BatchUpdateCapabilityStatusDto {
}
exports.BatchUpdateCapabilityStatusDto = BatchUpdateCapabilityStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新列表', type: [UpdateCapabilityStatusDto] }),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], BatchUpdateCapabilityStatusDto.prototype, "updates", void 0);
class QueryCapabilitiesDto {
}
exports.QueryCapabilitiesDto = QueryCapabilitiesDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '按服务名称过滤', example: 'google_maps' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryCapabilitiesDto.prototype, "serviceName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '按启用状态过滤', enum: McpCapabilityStatus }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(McpCapabilityStatus),
    __metadata("design:type", String)
], QueryCapabilitiesDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '按分类过滤', example: 'mapping' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryCapabilitiesDto.prototype, "category", void 0);
//# sourceMappingURL=mcp-capability.dto.js.map