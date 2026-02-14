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
exports.QuickAddDto = exports.FindFreeSlotsDto = exports.FindEventDto = exports.ListEventsDto = exports.DeleteEventDto = exports.UpdateEventDto = exports.CreateEventDto = exports.DateTimeDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class DateTimeDto {
}
exports.DateTimeDto = DateTimeDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '日期时间（ISO 8601）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DateTimeDto.prototype, "dateTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '日期（YYYY-MM-DD）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DateTimeDto.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '时区' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DateTimeDto.prototype, "timeZone", void 0);
class CreateEventDto {
}
exports.CreateEventDto = CreateEventDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '日历 ID（默认: primary）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateEventDto.prototype, "calendarId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '事件标题' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateEventDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '开始时间', type: DateTimeDto }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DateTimeDto),
    __metadata("design:type", DateTimeDto)
], CreateEventDto.prototype, "start", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '结束时间', type: DateTimeDto }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DateTimeDto),
    __metadata("design:type", DateTimeDto)
], CreateEventDto.prototype, "end", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '事件描述' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateEventDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '事件位置' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateEventDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '参与者邮箱列表', type: [String] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateEventDto.prototype, "attendees", void 0);
class UpdateEventDto {
}
exports.UpdateEventDto = UpdateEventDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '日历 ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateEventDto.prototype, "calendarId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '事件 ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateEventDto.prototype, "eventId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '事件标题' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateEventDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '开始时间', type: DateTimeDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DateTimeDto),
    __metadata("design:type", DateTimeDto)
], UpdateEventDto.prototype, "start", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结束时间', type: DateTimeDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DateTimeDto),
    __metadata("design:type", DateTimeDto)
], UpdateEventDto.prototype, "end", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '事件描述' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateEventDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '事件位置' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateEventDto.prototype, "location", void 0);
class DeleteEventDto {
}
exports.DeleteEventDto = DeleteEventDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '日历 ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DeleteEventDto.prototype, "calendarId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '事件 ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DeleteEventDto.prototype, "eventId", void 0);
class ListEventsDto {
}
exports.ListEventsDto = ListEventsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '日历 ID（默认: primary）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ListEventsDto.prototype, "calendarId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '开始时间（ISO 8601）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ListEventsDto.prototype, "timeMin", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结束时间（ISO 8601）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ListEventsDto.prototype, "timeMax", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '最大结果数' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ListEventsDto.prototype, "maxResults", void 0);
class FindEventDto {
}
exports.FindEventDto = FindEventDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '日历 ID（默认: primary）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FindEventDto.prototype, "calendarId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '搜索查询' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FindEventDto.prototype, "query", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '开始时间（ISO 8601）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FindEventDto.prototype, "timeMin", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结束时间（ISO 8601）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FindEventDto.prototype, "timeMax", void 0);
class FindFreeSlotsDto {
}
exports.FindFreeSlotsDto = FindFreeSlotsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '日历 ID（默认: primary）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FindFreeSlotsDto.prototype, "calendarId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '开始时间（ISO 8601）' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FindFreeSlotsDto.prototype, "timeMin", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '结束时间（ISO 8601）' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FindFreeSlotsDto.prototype, "timeMax", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '持续时间（分钟）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], FindFreeSlotsDto.prototype, "durationMinutes", void 0);
class QuickAddDto {
}
exports.QuickAddDto = QuickAddDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '日历 ID（默认: primary）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QuickAddDto.prototype, "calendarId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '自然语言描述' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QuickAddDto.prototype, "text", void 0);
//# sourceMappingURL=google-calendar.dto.js.map