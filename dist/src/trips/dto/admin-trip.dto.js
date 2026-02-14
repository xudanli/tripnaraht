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
exports.BatchOperationRequestDto = exports.AdminTripStatsQueryDto = exports.AdminTripListQueryDto = exports.SortOrder = exports.SortField = exports.TripStatus = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var TripStatus;
(function (TripStatus) {
    TripStatus["PLANNING"] = "PLANNING";
    TripStatus["IN_PROGRESS"] = "IN_PROGRESS";
    TripStatus["COMPLETED"] = "COMPLETED";
    TripStatus["CANCELLED"] = "CANCELLED";
})(TripStatus || (exports.TripStatus = TripStatus = {}));
var SortField;
(function (SortField) {
    SortField["CREATED_AT"] = "createdAt";
    SortField["UPDATED_AT"] = "updatedAt";
    SortField["START_DATE"] = "startDate";
    SortField["END_DATE"] = "endDate";
})(SortField || (exports.SortField = SortField = {}));
var SortOrder;
(function (SortOrder) {
    SortOrder["ASC"] = "asc";
    SortOrder["DESC"] = "desc";
})(SortOrder || (exports.SortOrder = SortOrder = {}));
class AdminTripListQueryDto {
    constructor() {
        this.page = 1;
        this.limit = 20;
        this.sortBy = SortField.CREATED_AT;
        this.sortOrder = SortOrder.DESC;
    }
}
exports.AdminTripListQueryDto = AdminTripListQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '页码，从1开始', example: 1, default: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AdminTripListQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '每页数量，默认20，最大100', example: 20, default: 20, maximum: 100 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], AdminTripListQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '状态筛选', enum: TripStatus, example: 'PLANNING' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(TripStatus),
    __metadata("design:type", String)
], AdminTripListQueryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '目的地国家代码筛选（ISO 3166-1 alpha-2）', example: 'JP' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminTripListQueryDto.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '开始日期范围（ISO 8601日期）', example: '2024-01-01' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AdminTripListQueryDto.prototype, "startDateFrom", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结束日期范围（ISO 8601日期）', example: '2024-12-31' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AdminTripListQueryDto.prototype, "startDateTo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '创建时间范围（ISO 8601）', example: '2024-01-01T00:00:00Z' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AdminTripListQueryDto.prototype, "createdAtFrom", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '创建时间范围（ISO 8601）', example: '2024-12-31T23:59:59Z' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AdminTripListQueryDto.prototype, "createdAtTo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户ID筛选（UUID）', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminTripListQueryDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '排序字段', enum: SortField, example: 'createdAt', default: 'createdAt' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(SortField),
    __metadata("design:type", String)
], AdminTripListQueryDto.prototype, "sortBy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '排序方向', enum: SortOrder, example: 'desc', default: 'desc' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(SortOrder),
    __metadata("design:type", String)
], AdminTripListQueryDto.prototype, "sortOrder", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '搜索关键词（目的地、用户邮箱、用户名称）', example: 'Tokyo' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminTripListQueryDto.prototype, "search", void 0);
class AdminTripStatsQueryDto {
}
exports.AdminTripStatsQueryDto = AdminTripStatsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '统计开始日期（ISO 8601日期）', example: '2024-01-01' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AdminTripStatsQueryDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '统计结束日期（ISO 8601日期）', example: '2024-12-31' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], AdminTripStatsQueryDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '按目的地筛选', example: 'JP' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminTripStatsQueryDto.prototype, "destination", void 0);
class BatchOperationRequestDto {
}
exports.BatchOperationRequestDto = BatchOperationRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '操作类型', enum: ['DELETE', 'UPDATE_STATUS'], example: 'UPDATE_STATUS' }),
    (0, class_validator_1.IsEnum)(['DELETE', 'UPDATE_STATUS']),
    __metadata("design:type", String)
], BatchOperationRequestDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程ID列表', type: [String], example: ['trip-id-1', 'trip-id-2'] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], BatchOperationRequestDto.prototype, "tripIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '操作参数', example: { status: 'CANCELLED' } }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], BatchOperationRequestDto.prototype, "params", void 0);
//# sourceMappingURL=admin-trip.dto.js.map