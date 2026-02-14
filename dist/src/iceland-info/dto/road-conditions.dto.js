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
exports.RoadConditionsQueryDto = exports.RoadConditionsResponseDto = exports.RoadSegmentDto = exports.RoadCondition = exports.RoadStatus = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var RoadStatus;
(function (RoadStatus) {
    RoadStatus["OPEN"] = "open";
    RoadStatus["CLOSED"] = "closed";
    RoadStatus["CAUTION"] = "caution";
    RoadStatus["IMPASSABLE"] = "impassable";
})(RoadStatus || (exports.RoadStatus = RoadStatus = {}));
var RoadCondition;
(function (RoadCondition) {
    RoadCondition["DRY"] = "dry";
    RoadCondition["WET"] = "wet";
    RoadCondition["ICY"] = "icy";
    RoadCondition["SNOW"] = "snow";
    RoadCondition["SLUSHY"] = "slushy";
    RoadCondition["MUDDY"] = "muddy";
})(RoadCondition || (exports.RoadCondition = RoadCondition = {}));
class RoadSegmentDto {
}
exports.RoadSegmentDto = RoadSegmentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '路段ID' }),
    __metadata("design:type", String)
], RoadSegmentDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '路段名称' }),
    __metadata("design:type", String)
], RoadSegmentDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'F路编号', example: 'F208' }),
    __metadata("design:type", String)
], RoadSegmentDto.prototype, "fRoadNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '起点坐标' }),
    __metadata("design:type", Object)
], RoadSegmentDto.prototype, "startPoint", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '终点坐标' }),
    __metadata("design:type", Object)
], RoadSegmentDto.prototype, "endPoint", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '路况状态', enum: RoadStatus }),
    __metadata("design:type", String)
], RoadSegmentDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '路面条件', enum: RoadCondition }),
    __metadata("design:type", String)
], RoadSegmentDto.prototype, "condition", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否开放' }),
    __metadata("design:type", Boolean)
], RoadSegmentDto.prototype, "isOpen", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '状态描述' }),
    __metadata("design:type", String)
], RoadSegmentDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最后更新时间' }),
    __metadata("design:type", String)
], RoadSegmentDto.prototype, "lastUpdated", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '预计开放时间' }),
    __metadata("design:type", String)
], RoadSegmentDto.prototype, "expectedOpenTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '预计关闭时间' }),
    __metadata("design:type", String)
], RoadSegmentDto.prototype, "expectedCloseTime", void 0);
class RoadConditionsResponseDto {
}
exports.RoadConditionsResponseDto = RoadConditionsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'F路列表', type: [RoadSegmentDto] }),
    __metadata("design:type", Array)
], RoadConditionsResponseDto.prototype, "fRoads", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最后更新时间' }),
    __metadata("design:type", String)
], RoadConditionsResponseDto.prototype, "lastUpdated", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '数据源' }),
    __metadata("design:type", String)
], RoadConditionsResponseDto.prototype, "source", void 0);
class RoadConditionsQueryDto {
}
exports.RoadConditionsQueryDto = RoadConditionsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'F路编号过滤（多个用逗号分隔）',
        example: 'F208,F26,F910',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RoadConditionsQueryDto.prototype, "fRoads", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '状态过滤',
        enum: RoadStatus,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], RoadConditionsQueryDto.prototype, "status", void 0);
//# sourceMappingURL=road-conditions.dto.js.map