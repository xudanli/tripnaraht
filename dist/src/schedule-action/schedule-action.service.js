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
var ScheduleActionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduleActionService = void 0;
const common_1 = require("@nestjs/common");
const place_to_poi_helper_service_1 = require("../planning-policy/services/place-to-poi-helper.service");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const crypto_1 = require("crypto");
const timeline_rebuilder_util_1 = require("./utils/timeline-rebuilder.util");
let ScheduleActionService = ScheduleActionService_1 = class ScheduleActionService {
    constructor(placeToPoiHelper) {
        this.placeToPoiHelper = placeToPoiHelper;
        this.logger = new common_1.Logger(ScheduleActionService_1.name);
        this.timelineRebuilder = new timeline_rebuilder_util_1.TimelineRebuilder();
    }
    async apply(schedule, action) {
        const requestId = (0, crypto_1.randomUUID)();
        const actionType = action.type;
        const poiId = action.poiId;
        this.logger.log(`[${requestId}] apply action: type=${actionType}, poiId=${poiId || 'N/A'}`);
        try {
            switch (action.type) {
                case 'QUERY_NEXT_STOP':
                    return this.queryNextStop(schedule, requestId);
                case 'MOVE_POI_TO_MORNING':
                    return await this.movePoiToMorning(schedule, action, requestId);
                case 'ADD_POI_TO_SCHEDULE':
                    return await this.addPoiToSchedule(schedule, action, requestId);
                default:
                    this.logger.warn(`[${requestId}] Unsupported action type: ${action.type}`);
                    return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.UNSUPPORTED_ACTION, `不支持的动作类型: ${action.type}`, { actionType: action.type });
            }
        }
        catch (error) {
            this.logger.error(`[${requestId}] Error applying action: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '执行动作时发生错误', { actionType, requestId });
        }
    }
    queryNextStop(schedule, requestId) {
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const nextStop = schedule.stops.find((s) => s.kind === 'POI' && s.startMin >= nowMin);
        if (nextStop) {
            const timeStr = this.formatTime(nextStop.startMin);
            return (0, standard_response_dto_1.successResponse)({
                applied: false,
                answer: {
                    title: `下一站是：${nextStop.name}（${timeStr}）`,
                    details: `预计 ${timeStr} 到达 ${nextStop.name}`,
                },
            });
        }
        else {
            return (0, standard_response_dto_1.successResponse)({
                applied: false,
                answer: {
                    title: '今天没有更多行程了',
                    details: '当前行程已全部完成',
                },
            });
        }
    }
    async movePoiToMorning(schedule, action, requestId) {
        var _a;
        if (!action.poiId && !action.poiName) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'poiId 或 poiName 必须提供一个', { field: 'action.poiId' });
        }
        const targetStop = schedule.stops.find((s) => s.kind === 'POI' && (action.poiId ? s.id === action.poiId : s.name === action.poiName));
        if (!targetStop) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `找不到指定的 POI: ${action.poiId || action.poiName}`, { poiId: action.poiId, poiName: action.poiName });
        }
        const morningEndMin = 690;
        if (targetStop.startMin < morningEndMin) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, `${targetStop.name} 已经在上午时间段了`, { poiId: targetStop.id, currentStartMin: targetStop.startMin });
        }
        const newStops = [...schedule.stops];
        const originalIndex = newStops.findIndex((s) => s.id === targetStop.id);
        if (originalIndex === -1) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, '无法找到目标 POI 在行程中的位置', { poiId: targetStop.id });
        }
        newStops.splice(originalIndex, 1);
        let insertIndex = 0;
        for (let i = 0; i < newStops.length; i++) {
            const stop = newStops[i];
            if (stop.kind === 'POI' && stop.startMin >= morningEndMin) {
                insertIndex = i;
                break;
            }
            if (stop.kind === 'POI' && stop.startMin < morningEndMin) {
                insertIndex = i + 1;
            }
        }
        const rebuildTimeline = (_a = action.rebuildTimeline) !== null && _a !== void 0 ? _a : false;
        let finalStops;
        let timelineRebuilt = false;
        if (rebuildTimeline) {
            let targetPoi = null;
            const placeIdNum = action.poiId ? parseInt(action.poiId, 10) : NaN;
            if (!isNaN(placeIdNum)) {
                try {
                    targetPoi = await this.placeToPoiHelper.getPoiById(placeIdNum);
                }
                catch (error) {
                    this.logger.warn(`[${requestId}] Failed to fetch POI info for timeline rebuild: ${error.message}`);
                }
            }
            const dayStartMin = schedule.stops.length > 0
                ? Math.min(...schedule.stops.map((s) => s.startMin))
                : 540;
            const dayEndMin = schedule.stops.length > 0
                ? Math.max(...schedule.stops.map((s) => s.endMin))
                : 1200;
            const tempTargetStop = {
                ...targetStop,
                startMin: 600,
                endMin: 600 + (targetStop.endMin - targetStop.startMin),
            };
            newStops.splice(insertIndex, 0, tempTargetStop);
            const rebuiltStops = this.timelineRebuilder.rebuildTimeline(newStops, targetPoi, insertIndex, dayStartMin, dayEndMin);
            if (rebuiltStops) {
                finalStops = rebuiltStops;
                timelineRebuilt = true;
                this.logger.log(`[${requestId}] Timeline rebuilt for POI ${targetStop.id}: ${targetStop.startMin} -> ${rebuiltStops[insertIndex].startMin}`);
            }
            else {
                this.logger.warn(`[${requestId}] Timeline rebuild failed for POI ${targetStop.id}, falling back to reorder only`);
                newStops.splice(insertIndex, 1);
                finalStops = newStops;
                const newTargetStop = {
                    ...targetStop,
                    startMin: 600,
                    endMin: 600 + (targetStop.endMin - targetStop.startMin),
                };
                finalStops.splice(insertIndex, 0, newTargetStop);
            }
        }
        else {
            const newTargetStop = {
                ...targetStop,
                startMin: 600,
                endMin: 600 + (targetStop.endMin - targetStop.startMin),
            };
            newStops.splice(insertIndex, 0, newTargetStop);
            finalStops = newStops;
        }
        const finalTargetStop = finalStops[insertIndex];
        this.logger.log(`[${requestId}] Moved POI ${targetStop.id} to morning: ${targetStop.startMin} -> ${finalTargetStop.startMin}${timelineRebuilt ? ' (timeline rebuilt)' : ' (reordered only)'}`);
        return (0, standard_response_dto_1.successResponse)({
            applied: true,
            newSchedule: {
                ...schedule,
                stops: finalStops,
            },
            message: `已将「${targetStop.name}」移动到上午段${timelineRebuilt ? '（已重建时间轴）' : '（仅调整顺序）'}`,
        });
    }
    async addPoiToSchedule(schedule, action, requestId) {
        try {
            if (!action.poiId) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'poiId is required for ADD_POI_TO_SCHEDULE', { field: 'action.poiId' });
            }
            let poi = null;
            const placeIdNum = parseInt(action.poiId, 10);
            if (!isNaN(placeIdNum)) {
                this.logger.log(`[${requestId}] Fetching POI from Place table: placeId=${placeIdNum}`);
                poi = await this.placeToPoiHelper.getPoiById(placeIdNum);
            }
            else {
                this.logger.warn(`[${requestId}] POI ID is not a number, Place table lookup skipped: ${action.poiId}`);
            }
            if (!poi) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `找不到指定的 POI: ${action.poiId}（请确保 poiId 是有效的 Place ID）`, { poiId: action.poiId, suggestion: '请使用 Place 表中的数字 ID' });
            }
            const existingStop = schedule.stops.find((s) => s.kind === 'POI' && s.id === poi.id);
            if (existingStop) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, `POI「${poi.name}」已经在行程中`, { poiId: poi.id, existingStartMin: existingStop.startMin });
            }
            const lastStop = schedule.stops[schedule.stops.length - 1];
            const insertAfterIndex = action.insertAfterStopId
                ? schedule.stops.findIndex((s) => s.id === action.insertAfterStopId)
                : schedule.stops.length - 1;
            const baseTime = lastStop ? lastStop.endMin : 540;
            const visitMin = poi.avgVisitMin || 120;
            const newStartMin = baseTime + 30;
            const newEndMin = newStartMin + visitMin;
            const newStop = {
                kind: 'POI',
                id: poi.id,
                name: poi.name,
                startMin: newStartMin,
                endMin: newEndMin,
                lat: poi.lat,
                lng: poi.lng,
                notes: [`从拍照识别添加: ${poi.name}`],
            };
            const newStops = [...schedule.stops];
            if (insertAfterIndex >= 0 && insertAfterIndex < newStops.length) {
                newStops.splice(insertAfterIndex + 1, 0, newStop);
            }
            else {
                newStops.push(newStop);
            }
            this.logger.log(`[${requestId}] Added POI ${poi.id} (${poi.name}) to schedule at ${this.formatTime(newStartMin)}`);
            return (0, standard_response_dto_1.successResponse)({
                applied: true,
                newSchedule: {
                    ...schedule,
                    stops: newStops,
                },
                message: `已将「${poi.name}」添加到行程中（${this.formatTime(newStartMin)}）`,
            });
        }
        catch (error) {
            this.logger.error(`[${requestId}] Error adding POI: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '添加 POI 时发生错误', { poiId: action.poiId, requestId });
        }
    }
    formatTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
    async preview(schedule, action) {
        var _a, _b;
        const requestId = (0, crypto_1.randomUUID)();
        const actionType = action.type;
        this.logger.log(`[${requestId}] preview action: type=${actionType}`);
        try {
            const scheduleCopy = JSON.parse(JSON.stringify(schedule));
            const result = await this.apply(scheduleCopy, action);
            if (!result.success || !result.data) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, ((_a = result.error) === null || _a === void 0 ? void 0 : _a.message) || '预览动作失败', (_b = result.error) === null || _b === void 0 ? void 0 : _b.details);
            }
            const diff = this.calculateDiff(schedule, result.data.newSchedule || scheduleCopy);
            const warnings = this.generateWarnings(schedule, result.data.newSchedule || scheduleCopy, action);
            return (0, standard_response_dto_1.successResponse)({
                applied: false,
                canApply: result.data.applied !== false,
                diff,
                warnings,
                newSchedule: result.data.newSchedule,
                message: result.data.message || '预览完成',
            });
        }
        catch (error) {
            this.logger.error(`[${requestId}] Error previewing action: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '预览动作时发生错误', { actionType, requestId });
        }
    }
    calculateDiff(oldSchedule, newSchedule) {
        const oldStops = oldSchedule.stops;
        const newStops = newSchedule.stops;
        const movedStops = [];
        const addedStops = [];
        const removedStops = [];
        for (let i = 0; i < newStops.length; i++) {
            const newStop = newStops[i];
            const oldIndex = oldStops.findIndex(s => s.id === newStop.id);
            if (oldIndex >= 0 && oldIndex !== i) {
                movedStops.push({
                    id: newStop.id,
                    name: newStop.name,
                    from: oldIndex,
                    to: i,
                });
            }
        }
        for (let i = 0; i < newStops.length; i++) {
            const newStop = newStops[i];
            if (!oldStops.find(s => s.id === newStop.id)) {
                addedStops.push({
                    id: newStop.id,
                    name: newStop.name,
                    position: i,
                });
            }
        }
        for (const oldStop of oldStops) {
            if (!newStops.find(s => s.id === oldStop.id)) {
                removedStops.push({
                    id: oldStop.id,
                    name: oldStop.name,
                });
            }
        }
        const affectedStopCount = movedStops.length + addedStops.length + removedStops.length;
        return {
            movedStops,
            addedStops,
            removedStops,
            affectedStopCount,
        };
    }
    generateWarnings(oldSchedule, newSchedule, action) {
        const warnings = [];
        const stops = newSchedule.stops;
        for (let i = 0; i < stops.length - 1; i++) {
            if (stops[i].endMin > stops[i + 1].startMin) {
                warnings.push(`时间冲突：${stops[i].name} 和 ${stops[i + 1].name} 时间重叠`);
            }
        }
        const diff = this.calculateDiff(oldSchedule, newSchedule);
        if (diff.affectedStopCount > 3) {
            warnings.push(`此操作将影响 ${diff.affectedStopCount} 个行程项，请确认`);
        }
        return warnings;
    }
};
exports.ScheduleActionService = ScheduleActionService;
exports.ScheduleActionService = ScheduleActionService = ScheduleActionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [place_to_poi_helper_service_1.PlaceToPoiHelperService])
], ScheduleActionService);
//# sourceMappingURL=schedule-action.service.js.map