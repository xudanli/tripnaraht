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
exports.ApplyActionRequestDto = exports.ActionAddPoiToScheduleDto = exports.ActionMovePoiToMorningDto = exports.ActionQueryNextStopDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ActionQueryNextStopDto {
}
exports.ActionQueryNextStopDto = ActionQueryNextStopDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['QUERY_NEXT_STOP'], example: 'QUERY_NEXT_STOP' }),
    __metadata("design:type", String)
], ActionQueryNextStopDto.prototype, "type", void 0);
class ActionMovePoiToMorningDto {
}
exports.ActionMovePoiToMorningDto = ActionMovePoiToMorningDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['MOVE_POI_TO_MORNING'], example: 'MOVE_POI_TO_MORNING' }),
    __metadata("design:type", String)
], ActionMovePoiToMorningDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '6211', description: 'POI ID（Place ID，数字字符串）' }),
    __metadata("design:type", String)
], ActionMovePoiToMorningDto.prototype, "poiId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '东京塔', description: 'POI 名称（用于匹配）' }),
    __metadata("design:type", String)
], ActionMovePoiToMorningDto.prototype, "poiName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['AM', 'PM'], example: 'AM', description: '偏好时间段' }),
    __metadata("design:type", String)
], ActionMovePoiToMorningDto.prototype, "preferredRange", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否重建时间轴（默认 false，仅调整顺序；true 时会重新计算时间，考虑交通、营业时间等约束，冲突时回退到仅重排）',
        example: false,
        default: false,
    }),
    __metadata("design:type", Boolean)
], ActionMovePoiToMorningDto.prototype, "rebuildTimeline", void 0);
class ActionAddPoiToScheduleDto {
}
exports.ActionAddPoiToScheduleDto = ActionAddPoiToScheduleDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['ADD_POI_TO_SCHEDULE'], example: 'ADD_POI_TO_SCHEDULE' }),
    __metadata("design:type", String)
], ActionAddPoiToScheduleDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '6211' }),
    __metadata("design:type", String)
], ActionAddPoiToScheduleDto.prototype, "poiId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['AM', 'PM'], example: 'AM' }),
    __metadata("design:type", String)
], ActionAddPoiToScheduleDto.prototype, "preferredRange", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '插入到此 stop 之后', example: '12571' }),
    __metadata("design:type", String)
], ActionAddPoiToScheduleDto.prototype, "insertAfterStopId", void 0);
class ApplyActionRequestDto {
}
exports.ApplyActionRequestDto = ApplyActionRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: Object, description: '当前行程计划（DayScheduleResult）' }),
    __metadata("design:type", Object)
], ApplyActionRequestDto.prototype, "schedule", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '要执行的动作',
        oneOf: [
            { $ref: '#/components/schemas/ActionQueryNextStopDto' },
            { $ref: '#/components/schemas/ActionMovePoiToMorningDto' },
            { $ref: '#/components/schemas/ActionAddPoiToScheduleDto' },
        ],
    }),
    __metadata("design:type", Object)
], ApplyActionRequestDto.prototype, "action", void 0);
//# sourceMappingURL=apply-action.dto.js.map