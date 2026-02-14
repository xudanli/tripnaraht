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
exports.CreateTripDto = exports.TravelerDto = exports.MobilityTag = exports.TripPace = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
const trip_status_dto_1 = require("./trip-status.dto");
var TripPace;
(function (TripPace) {
    TripPace["RELAXED"] = "relaxed";
    TripPace["STANDARD"] = "standard";
    TripPace["TIGHT"] = "tight";
})(TripPace || (exports.TripPace = TripPace = {}));
var MobilityTag;
(function (MobilityTag) {
    MobilityTag["IRON_LEGS"] = "IRON_LEGS";
    MobilityTag["ACTIVE_SENIOR"] = "ACTIVE_SENIOR";
    MobilityTag["CITY_POTATO"] = "CITY_POTATO";
    MobilityTag["LIMITED"] = "LIMITED";
})(MobilityTag || (exports.MobilityTag = MobilityTag = {}));
class TravelerDto {
}
exports.TravelerDto = TravelerDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['ADULT', 'ELDERLY', 'CHILD'],
        description: '旅行者类型（兴趣维度：年龄/身份）',
        example: 'ADULT',
        enumName: 'InterestProfile'
    }),
    (0, class_validator_1.IsEnum)(['ADULT', 'ELDERLY', 'CHILD'], { message: 'type 必须是 ADULT、ELDERLY 或 CHILD' }),
    __metadata("design:type", String)
], TravelerDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: MobilityTag,
        description: '行动能力标签（体能维度：用户画像）',
        example: MobilityTag.CITY_POTATO,
        enumName: 'MobilityTag'
    }),
    (0, class_validator_1.IsEnum)(MobilityTag, { message: 'mobilityTag 必须是有效的行动能力标签' }),
    __metadata("design:type", String)
], TravelerDto.prototype, "mobilityTag", void 0);
class CreateTripDto {
}
exports.CreateTripDto = CreateTripDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '目的地国家代码（ISO 3166-1 alpha-2）',
        example: 'JP',
        enum: ['JP', 'IS', 'US', 'CN'],
        default: 'JP'
    }),
    (0, class_validator_1.IsString)({ message: 'destination 必须是字符串' }),
    __metadata("design:type", String)
], CreateTripDto.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '行程开始日期（ISO 8601 格式）',
        example: '2024-05-01',
        type: String,
        format: 'date'
    }),
    (0, class_validator_1.IsDateString)({}, { message: 'startDate 必须是有效的日期字符串 (ISO 8601)' }),
    __metadata("design:type", String)
], CreateTripDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '行程结束日期（ISO 8601 格式）',
        example: '2024-05-05',
        type: String,
        format: 'date'
    }),
    (0, class_validator_1.IsDateString)({}, { message: 'endDate 必须是有效的日期字符串 (ISO 8601)' }),
    __metadata("design:type", String)
], CreateTripDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '总预算（单位：人民币 CNY）',
        example: 20000,
        minimum: 0,
        type: Number
    }),
    (0, class_validator_1.IsNumber)({}, { message: 'totalBudget 必须是数字' }),
    __metadata("design:type", Number)
], CreateTripDto.prototype, "totalBudget", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '旅行者列表',
        type: [TravelerDto],
        example: [
            { type: 'ADULT', mobilityTag: 'CITY_POTATO' },
            { type: 'ADULT', mobilityTag: 'CITY_POTATO' },
            { type: 'ELDERLY', mobilityTag: 'ACTIVE_SENIOR' }
        ]
    }),
    (0, class_validator_1.IsArray)({ message: 'travelers 必须是数组' }),
    (0, class_validator_1.ValidateNested)({ each: true, message: 'travelers 数组中的每个元素必须符合 TravelerDto 格式' }),
    (0, class_transformer_1.Type)(() => TravelerDto),
    __metadata("design:type", Array)
], CreateTripDto.prototype, "travelers", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '行程状态',
        enum: trip_status_dto_1.TripStatus,
        example: trip_status_dto_1.TripStatus.PLANNING,
        default: trip_status_dto_1.TripStatus.PLANNING
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(trip_status_dto_1.TripStatus, { message: 'status 必须是有效的行程状态' }),
    __metadata("design:type", String)
], CreateTripDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '旅行节奏',
        enum: TripPace,
        example: TripPace.STANDARD,
        enumName: 'TripPace'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(TripPace, { message: 'pace 必须是 relaxed、standard 或 tight' }),
    __metadata("design:type", String)
], CreateTripDto.prototype, "pace", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '兴趣偏好标签数组',
        type: [String],
        example: ['food', 'history', 'photography']
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)({ message: 'preferences 必须是数组' }),
    (0, class_validator_1.IsString)({ each: true, message: 'preferences 数组中的每个元素必须是字符串' }),
    __metadata("design:type", Array)
], CreateTripDto.prototype, "preferences", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '必须去的地点 POI IDs',
        type: [Number],
        example: [12345, 67890]
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)({ message: 'mustPlaces 必须是数组' }),
    (0, class_validator_1.IsInt)({ each: true, message: 'mustPlaces 数组中的每个元素必须是整数' }),
    __metadata("design:type", Array)
], CreateTripDto.prototype, "mustPlaces", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '不想去的地点 POI IDs',
        type: [Number],
        example: [11111]
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)({ message: 'avoidPlaces 必须是数组' }),
    (0, class_validator_1.IsInt)({ each: true, message: 'avoidPlaces 数组中的每个元素必须是整数' }),
    __metadata("design:type", Array)
], CreateTripDto.prototype, "avoidPlaces", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '行程名称（1-200 字符，可选。如不提供，系统将自动生成默认名称）',
        example: '冰岛环岛游',
        maxLength: 200,
        minLength: 1,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)({ message: 'name 必须是字符串' }),
    (0, class_validator_1.Length)(1, 200, { message: '行程名称长度必须在 1-200 字符之间' }),
    __metadata("design:type", String)
], CreateTripDto.prototype, "name", void 0);
//# sourceMappingURL=create-trip.dto.js.map