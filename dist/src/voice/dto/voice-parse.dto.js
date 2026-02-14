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
exports.VoiceParseRequestDto = exports.DayScheduleResultDto = exports.StopDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class StopDto {
}
exports.StopDto = StopDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'POI' }),
    __metadata("design:type", String)
], StopDto.prototype, "kind", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '6211' }),
    __metadata("design:type", String)
], StopDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '东京塔' }),
    __metadata("design:type", String)
], StopDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 540 }),
    __metadata("design:type", Number)
], StopDto.prototype, "startMin", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 660 }),
    __metadata("design:type", Number)
], StopDto.prototype, "endMin", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 35.6762 }),
    __metadata("design:type", Number)
], StopDto.prototype, "lat", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 139.6503 }),
    __metadata("design:type", Number)
], StopDto.prototype, "lng", void 0);
class DayScheduleResultDto {
}
exports.DayScheduleResultDto = DayScheduleResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [StopDto] }),
    __metadata("design:type", Array)
], DayScheduleResultDto.prototype, "stops", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: Object }),
    __metadata("design:type", Object)
], DayScheduleResultDto.prototype, "metrics", void 0);
class VoiceParseRequestDto {
}
exports.VoiceParseRequestDto = VoiceParseRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '今天下一站是什么？' }),
    __metadata("design:type", String)
], VoiceParseRequestDto.prototype, "transcript", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: DayScheduleResultDto }),
    __metadata("design:type", DayScheduleResultDto)
], VoiceParseRequestDto.prototype, "schedule", void 0);
//# sourceMappingURL=voice-parse.dto.js.map