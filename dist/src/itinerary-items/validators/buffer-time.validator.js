"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BufferTimeValidator = void 0;
const common_1 = require("@nestjs/common");
const base_validator_1 = require("./base.validator");
const validation_interface_1 = require("../interfaces/validation.interface");
const luxon_1 = require("luxon");
let BufferTimeValidator = class BufferTimeValidator extends base_validator_1.BaseValidator {
    constructor() {
        super(...arguments);
        this.MIN_BUFFER_MINUTES = 15;
        this.RECOMMENDED_BUFFER_MINUTES = 30;
    }
    getCode() {
        return validation_interface_1.ValidationCode.SHORT_BUFFER;
    }
    getSeverity() {
        return validation_interface_1.ValidationSeverity.INFO;
    }
    async validate(context) {
        var _a;
        const { newItem, previousItem } = context;
        if (!previousItem) {
            return this.pass();
        }
        const prevEnd = luxon_1.DateTime.fromJSDate(previousItem.endTime);
        const newStart = luxon_1.DateTime.fromJSDate(newItem.startTime);
        const bufferMinutes = newStart.diff(prevEnd, 'minutes').minutes;
        if (bufferMinutes > 0 && bufferMinutes < this.MIN_BUFFER_MINUTES) {
            const prevName = ((_a = previousItem.place) === null || _a === void 0 ? void 0 : _a.name) || '前一活动';
            const additionalBuffer = this.RECOMMENDED_BUFFER_MINUTES - bufferMinutes;
            return this.createResult(true, `缓冲时间较短：与「${prevName}」仅间隔 ${Math.round(bufferMinutes)} 分钟，建议至少 ${this.RECOMMENDED_BUFFER_MINUTES} 分钟以应对意外延误`, {
                previousItemId: previousItem.id,
                previousItemName: prevName,
                bufferMinutes: Math.round(bufferMinutes),
                minBuffer: this.MIN_BUFFER_MINUTES,
                recommendedBuffer: this.RECOMMENDED_BUFFER_MINUTES,
            }, [
                {
                    action: 'ADD_BUFFER',
                    description: `建议将开始时间延后 ${Math.ceil(additionalBuffer)} 分钟`,
                    suggestedValue: {
                        startTime: newStart.plus({ minutes: additionalBuffer }).toISO() || undefined,
                    },
                    estimatedImprovement: '降低因前一活动延误而导致整体行程混乱的风险',
                },
            ]);
        }
        return this.pass();
    }
};
exports.BufferTimeValidator = BufferTimeValidator;
exports.BufferTimeValidator = BufferTimeValidator = __decorate([
    (0, common_1.Injectable)()
], BufferTimeValidator);
//# sourceMappingURL=buffer-time.validator.js.map