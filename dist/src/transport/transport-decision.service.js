"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransportDecisionService = void 0;
const common_1 = require("@nestjs/common");
const transport_interface_1 = require("./interfaces/transport.interface");
let TransportDecisionService = class TransportDecisionService {
    rankOptions(options, context) {
        const scoredOptions = options.map((opt) => {
            const score = this.calculatePainScore(opt, context);
            const reason = this.generateRecommendationReason(opt, context);
            const warnings = this.generateWarnings(opt, context);
            return {
                ...opt,
                score,
                recommendationReason: reason,
                warnings,
            };
        });
        const sortedOptions = scoredOptions.sort((a, b) => {
            const scoreA = a.score || 999999;
            const scoreB = b.score || 999999;
            return scoreA - scoreB;
        });
        const recommendationReason = this.generateOverallReason(sortedOptions[0], context);
        const specialAdvice = this.generateSpecialAdvice(context);
        return {
            options: sortedOptions,
            recommendationReason,
            specialAdvice,
        };
    }
    calculatePainScore(option, context) {
        let score = 0;
        const timeValue = this.getTimeValue(context);
        score += option.cost;
        score += option.durationMinutes * timeValue;
        if (context.hasLuggage) {
            const luggagePenalty = context.isMovingDay ? 1000 : 500;
            if (option.mode === transport_interface_1.TransportMode.TRANSIT) {
                score += luggagePenalty;
            }
            if (option.mode === transport_interface_1.TransportMode.WALKING && option.walkDistance > 500) {
                score += 1000;
            }
            if (option.mode === transport_interface_1.TransportMode.TAXI) {
                score -= context.isMovingDay ? 200 : 100;
            }
        }
        if (context.hasElderly) {
            if (option.mode === transport_interface_1.TransportMode.TRANSIT) {
                score += (option.transfers || 0) * 100;
                score += option.walkDistance / 10;
            }
            if (option.mode === transport_interface_1.TransportMode.WALKING && option.durationMinutes > 15) {
                score += 999;
            }
            if (option.mode === transport_interface_1.TransportMode.TAXI) {
                score -= 50;
            }
        }
        if (context.isRaining) {
            if (option.mode === transport_interface_1.TransportMode.WALKING) {
                score += 9999;
            }
            if (option.mode === transport_interface_1.TransportMode.TRANSIT) {
                score += option.walkDistance / 5;
            }
            if (option.mode === transport_interface_1.TransportMode.TAXI) {
                score -= 200;
            }
        }
        if (context.hasLimitedMobility) {
            if (option.mode === transport_interface_1.TransportMode.WALKING) {
                score += 5000;
            }
            if (option.mode === transport_interface_1.TransportMode.TRANSIT) {
                score += 1000;
            }
            if (option.mode === transport_interface_1.TransportMode.TAXI) {
                score -= 300;
            }
        }
        if (context.budgetSensitivity === 'HIGH') {
            if (option.cost > 100) {
                score += (option.cost - 100) * 0.5;
            }
        }
        if (option.mode === transport_interface_1.TransportMode.TRANSIT) {
            if ((option.transfers || 0) > 2) {
                score += 500;
            }
        }
        return Math.round(score);
    }
    getTimeValue(context) {
        let baseValue = 2;
        if (context.timeSensitivity === 'HIGH') {
            baseValue = 5;
        }
        else if (context.timeSensitivity === 'LOW') {
            baseValue = 1;
        }
        return baseValue;
    }
    generateRecommendationReason(option, context) {
        const reasons = [];
        if (option.mode === transport_interface_1.TransportMode.TAXI) {
            if (context.hasLuggage) {
                reasons.push('适合携带行李');
            }
            if (context.hasElderly) {
                reasons.push('适合老人出行');
            }
            if (context.isRaining) {
                reasons.push('避免淋雨');
            }
            if (context.hasLimitedMobility) {
                reasons.push('无障碍出行');
            }
        }
        if (option.mode === transport_interface_1.TransportMode.TRANSIT) {
            if (option.cost < 50) {
                reasons.push('经济实惠');
            }
            if ((option.transfers || 0) === 0) {
                reasons.push('无需换乘');
            }
        }
        if (option.mode === transport_interface_1.TransportMode.WALKING) {
            if (option.durationMinutes < 15) {
                reasons.push('距离较近');
            }
            reasons.push('免费');
        }
        return reasons.length > 0 ? reasons.join('、') : '推荐此方式';
    }
    generateWarnings(option, context) {
        const warnings = [];
        if (option.mode === transport_interface_1.TransportMode.WALKING) {
            if (option.walkDistance > 1000) {
                warnings.push(`需要步行 ${Math.round(option.walkDistance / 1000 * 10) / 10} 公里`);
            }
            if (context.isRaining) {
                warnings.push('当前正在下雨，不建议步行');
            }
            if (context.hasLuggage) {
                warnings.push('携带行李时步行不便');
            }
        }
        if (option.mode === transport_interface_1.TransportMode.TRANSIT) {
            if ((option.transfers || 0) > 1) {
                warnings.push(`需要换乘 ${option.transfers} 次`);
            }
            if (option.walkDistance > 800) {
                warnings.push(`需要步行 ${Math.round(option.walkDistance)} 米到车站`);
            }
            if (context.hasLuggage) {
                warnings.push('携带大件行李时乘坐公共交通不便');
            }
            if (context.hasElderly && (option.transfers || 0) > 0) {
                warnings.push('换乘对老人不友好');
            }
        }
        if (option.mode === transport_interface_1.TransportMode.TAXI) {
            if (option.cost > 200) {
                warnings.push(`费用较高（${option.cost} 元）`);
            }
        }
        return warnings;
    }
    generateOverallReason(topOption, context) {
        if (topOption.mode === transport_interface_1.TransportMode.TAXI) {
            if (context.hasLuggage && context.isRaining) {
                return '您带着行李，且外面正在下雨，建议打车出行';
            }
            if (context.hasElderly) {
                return '考虑到有老人同行，建议打车出行';
            }
            if (context.hasLuggage) {
                return '您带着行李，建议打车出行';
            }
        }
        if (topOption.mode === transport_interface_1.TransportMode.TRANSIT) {
            if (topOption.cost < 50) {
                return '公共交通经济实惠，推荐使用';
            }
        }
        if (topOption.mode === transport_interface_1.TransportMode.WALKING) {
            return '距离较近，建议步行';
        }
        return '推荐此交通方式';
    }
    generateSpecialAdvice(context) {
        const advice = [];
        if (context.isMovingDay && context.currentCity !== context.targetCity) {
            if (context.currentCity === 'JP' || context.targetCity === 'JP') {
                advice.push('💡 建议使用宅急便（Yamato）将行李直接寄到下一家酒店，今日轻装游玩');
            }
            else {
                advice.push('💡 建议先去酒店存行李，再开始游玩');
            }
        }
        if (context.hasLuggage && !context.isMovingDay) {
            advice.push('💡 如果可能，建议将行李寄存在酒店或车站的行李寄存处');
        }
        return advice;
    }
};
exports.TransportDecisionService = TransportDecisionService;
exports.TransportDecisionService = TransportDecisionService = __decorate([
    (0, common_1.Injectable)()
], TransportDecisionService);
//# sourceMappingURL=transport-decision.service.js.map