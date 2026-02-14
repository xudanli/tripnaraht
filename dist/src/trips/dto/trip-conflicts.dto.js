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
exports.ConflictsResponseDto = exports.ConflictDto = exports.ConflictSuggestionDto = exports.ConflictSeverity = exports.ConflictType = void 0;
const swagger_1 = require("@nestjs/swagger");
var ConflictType;
(function (ConflictType) {
    ConflictType["TIME_CONFLICT"] = "TIME_CONFLICT";
    ConflictType["LUNCH_WINDOW"] = "LUNCH_WINDOW";
    ConflictType["FATIGUE_EXCEEDED"] = "FATIGUE_EXCEEDED";
    ConflictType["BUFFER_INSUFFICIENT"] = "BUFFER_INSUFFICIENT";
    ConflictType["CLOSURE_RISK"] = "CLOSURE_RISK";
    ConflictType["ACCESSIBILITY_MISMATCH"] = "ACCESSIBILITY_MISMATCH";
    ConflictType["TRANSPORT_TOO_LONG"] = "TRANSPORT_TOO_LONG";
})(ConflictType || (exports.ConflictType = ConflictType = {}));
var ConflictSeverity;
(function (ConflictSeverity) {
    ConflictSeverity["HIGH"] = "HIGH";
    ConflictSeverity["MEDIUM"] = "MEDIUM";
    ConflictSeverity["LOW"] = "LOW";
})(ConflictSeverity || (exports.ConflictSeverity = ConflictSeverity = {}));
class ConflictSuggestionDto {
}
exports.ConflictSuggestionDto = ConflictSuggestionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '建议操作' }),
    __metadata("design:type", String)
], ConflictSuggestionDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '建议描述' }),
    __metadata("design:type", String)
], ConflictSuggestionDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '影响说明' }),
    __metadata("design:type", String)
], ConflictSuggestionDto.prototype, "impact", void 0);
class ConflictDto {
}
exports.ConflictDto = ConflictDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '冲突 ID' }),
    __metadata("design:type", String)
], ConflictDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '冲突类型', enum: ConflictType }),
    __metadata("design:type", String)
], ConflictDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '严重程度', enum: ConflictSeverity }),
    __metadata("design:type", String)
], ConflictDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标题' }),
    __metadata("design:type", String)
], ConflictDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '描述' }),
    __metadata("design:type", String)
], ConflictDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '受影响的日期数组' }),
    __metadata("design:type", Array)
], ConflictDto.prototype, "affectedDays", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '受影响的行程项 ID 数组' }),
    __metadata("design:type", Array)
], ConflictDto.prototype, "affectedItemIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '时间重叠分钟数（仅TIME_CONFLICT类型）' }),
    __metadata("design:type", Number)
], ConflictDto.prototype, "overlapMinutes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '建议列表', type: [ConflictSuggestionDto] }),
    __metadata("design:type", Array)
], ConflictDto.prototype, "suggestions", void 0);
class ConflictsResponseDto {
}
exports.ConflictsResponseDto = ConflictsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程 ID' }),
    __metadata("design:type", String)
], ConflictsResponseDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '冲突列表', type: [ConflictDto] }),
    __metadata("design:type", Array)
], ConflictsResponseDto.prototype, "conflicts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '冲突总数' }),
    __metadata("design:type", Number)
], ConflictsResponseDto.prototype, "total", void 0);
//# sourceMappingURL=trip-conflicts.dto.js.map