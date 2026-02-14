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
exports.AdminDecisionStatsQueryDto = exports.AdminDecisionLogListQueryDto = exports.DecisionAction = exports.DecisionSource = exports.DecisionPersona = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var DecisionPersona;
(function (DecisionPersona) {
    DecisionPersona["ABU"] = "ABU";
    DecisionPersona["DR_DRE"] = "DR_DRE";
    DecisionPersona["NEPTUNE"] = "NEPTUNE";
})(DecisionPersona || (exports.DecisionPersona = DecisionPersona = {}));
var DecisionSource;
(function (DecisionSource) {
    DecisionSource["PHYSICAL"] = "PHYSICAL";
    DecisionSource["HUMAN"] = "HUMAN";
    DecisionSource["PHILOSOPHY"] = "PHILOSOPHY";
    DecisionSource["HEURISTIC"] = "HEURISTIC";
})(DecisionSource || (exports.DecisionSource = DecisionSource = {}));
var DecisionAction;
(function (DecisionAction) {
    DecisionAction["ALLOW"] = "ALLOW";
    DecisionAction["REJECT"] = "REJECT";
    DecisionAction["ADJUST"] = "ADJUST";
    DecisionAction["REPLACE"] = "REPLACE";
})(DecisionAction || (exports.DecisionAction = DecisionAction = {}));
class AdminDecisionLogListQueryDto {
    constructor() {
        this.page = 1;
        this.limit = 20;
        this.sortBy = 'timestamp';
        this.sortOrder = 'desc';
    }
}
exports.AdminDecisionLogListQueryDto = AdminDecisionLogListQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '页码，从1开始', example: 1, default: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AdminDecisionLogListQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '每页数量，默认20，最大100', example: 20, default: 20, maximum: 100 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], AdminDecisionLogListQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '行程ID筛选' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminDecisionLogListQueryDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户ID筛选' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminDecisionLogListQueryDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Persona筛选', enum: DecisionPersona }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(DecisionPersona),
    __metadata("design:type", String)
], AdminDecisionLogListQueryDto.prototype, "persona", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '决策来源筛选', enum: DecisionSource }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(DecisionSource),
    __metadata("design:type", String)
], AdminDecisionLogListQueryDto.prototype, "decisionSource", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '决策动作筛选', enum: DecisionAction }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(DecisionAction),
    __metadata("design:type", String)
], AdminDecisionLogListQueryDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '开始日期（ISO 8601日期）', example: '2024-01-01' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AdminDecisionLogListQueryDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结束日期（ISO 8601日期）', example: '2024-12-31' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AdminDecisionLogListQueryDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '排序字段', example: 'timestamp', default: 'timestamp' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminDecisionLogListQueryDto.prototype, "sortBy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '排序方向', enum: ['asc', 'desc'], example: 'desc', default: 'desc' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['asc', 'desc']),
    __metadata("design:type", String)
], AdminDecisionLogListQueryDto.prototype, "sortOrder", void 0);
class AdminDecisionStatsQueryDto {
}
exports.AdminDecisionStatsQueryDto = AdminDecisionStatsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '统计开始日期（ISO 8601日期）', example: '2024-01-01' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AdminDecisionStatsQueryDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '统计结束日期（ISO 8601日期）', example: '2024-12-31' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AdminDecisionStatsQueryDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '按国家筛选', example: 'JP' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminDecisionStatsQueryDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '按路线方向筛选' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminDecisionStatsQueryDto.prototype, "routeDirectionId", void 0);
//# sourceMappingURL=admin-decision.dto.js.map