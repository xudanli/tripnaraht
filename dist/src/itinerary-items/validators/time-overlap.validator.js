"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeOverlapValidator = void 0;
const common_1 = require("@nestjs/common");
const base_validator_1 = require("./base.validator");
const validation_interface_1 = require("../interfaces/validation.interface");
const luxon_1 = require("luxon");
let TimeOverlapValidator = class TimeOverlapValidator extends base_validator_1.BaseValidator {
    getCode() {
        return validation_interface_1.ValidationCode.TIME_OVERLAP;
    }
    getSeverity() {
        return validation_interface_1.ValidationSeverity.ERROR;
    }
    async validate(context) {
        var _a;
        const { newItem, existingItems } = context;
        const newStart = luxon_1.DateTime.fromJSDate(newItem.startTime);
        const newEnd = luxon_1.DateTime.fromJSDate(newItem.endTime);
        const nonRestItems = existingItems.filter(item => item.type !== 'REST');
        const newItemIsRest = newItem.type === 'REST';
        for (const existing of nonRestItems) {
            const existStart = luxon_1.DateTime.fromJSDate(existing.startTime);
            const existEnd = luxon_1.DateTime.fromJSDate(existing.endTime);
            if (newItemIsRest) {
                continue;
            }
            if (newStart < existEnd && newEnd > existStart) {
                const overlapStart = newStart > existStart ? newStart : existStart;
                const overlapEnd = newEnd < existEnd ? newEnd : existEnd;
                const overlapMinutes = overlapEnd.diff(overlapStart, 'minutes').minutes;
                const suggestedStart = existEnd.plus({ minutes: 15 });
                const duration = newEnd.diff(newStart, 'minutes').minutes;
                const suggestedEnd = suggestedStart.plus({ minutes: duration });
                const placeName = ((_a = existing.place) === null || _a === void 0 ? void 0 : _a.name) || '未知活动';
                return this.fail(`时间冲突：与「${placeName}」(${existStart.toFormat('HH:mm')}-${existEnd.toFormat('HH:mm')}) 存在 ${Math.ceil(overlapMinutes)} 分钟重叠`, {
                    conflictingItemId: existing.id,
                    conflictingItemName: placeName,
                    conflictingTimeRange: {
                        start: existing.startTime.toISOString(),
                        end: existing.endTime.toISOString(),
                    },
                    requestedTimeRange: {
                        start: newItem.startTime.toISOString(),
                        end: newItem.endTime.toISOString(),
                    },
                    overlapMinutes: Math.ceil(overlapMinutes),
                    suggestedStartTime: suggestedStart.toISO(),
                }, [
                    {
                        action: 'ADJUST_TIME',
                        description: `将开始时间调整为 ${suggestedStart.toFormat('HH:mm')}，避免与「${placeName}」冲突`,
                        suggestedValue: {
                            startTime: suggestedStart.toISO() || undefined,
                            endTime: suggestedEnd.toISO() || undefined,
                        },
                        estimatedImprovement: '消除时间重叠',
                    },
                ]);
            }
        }
        return this.pass();
    }
};
exports.TimeOverlapValidator = TimeOverlapValidator;
exports.TimeOverlapValidator = TimeOverlapValidator = __decorate([
    (0, common_1.Injectable)()
], TimeOverlapValidator);
//# sourceMappingURL=time-overlap.validator.js.map