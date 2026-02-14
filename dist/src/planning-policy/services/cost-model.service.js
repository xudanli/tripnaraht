"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultCostModelInstance = exports.DefaultCostModel = void 0;
const common_1 = require("@nestjs/common");
let DefaultCostModel = class DefaultCostModel {
    edgeCost({ segment, policy }) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const w = policy.weights;
        const c = policy.constraints;
        if (c.requireWheelchairAccess && segment.wheelchairAccessible === false) {
            return Number.POSITIVE_INFINITY;
        }
        if (c.forbidStairs &&
            ((_a = segment.stairsCount) !== null && _a !== void 0 ? _a : 0) > 0 &&
            segment.elevatorAvailable !== true) {
            return Number.POSITIVE_INFINITY;
        }
        const timeCost = segment.durationMin * w.valueOfTimePerMin;
        const walkPain = segment.walkMin *
            w.walkPainPerMin *
            (((_b = policy.context) === null || _b === void 0 ? void 0 : _b.isRaining) ? w.rainWalkMultiplier : 1.0);
        const transferPain = segment.transferCount *
            w.transferPain *
            (((_c = policy.context) === null || _c === void 0 ? void 0 : _c.hasElderly) ? w.elderlyTransferMultiplier : 1.0);
        const stairPain = ((_d = segment.stairsCount) !== null && _d !== void 0 ? _d : 0) > 0 ? w.stairPain : 0;
        const crowdPain = ((_e = segment.crowdLevel) !== null && _e !== void 0 ? _e : 0) * 2 * w.crowdPainPerMin;
        const luggagePain = (((_f = policy.context) === null || _f === void 0 ? void 0 : _f.hasLuggage) || ((_g = policy.context) === null || _g === void 0 ? void 0 : _g.isMovingDay)) &&
            (segment.mode === 'BUS' || segment.mode === 'SUBWAY')
            ? w.luggageTransitPenalty
            : 0;
        const moneyCost = (_h = segment.costCny) !== null && _h !== void 0 ? _h : 0;
        return timeCost + walkPain + transferPain + stairPain + crowdPain + luggagePain + moneyCost;
    }
    itineraryCost(input, policy) {
        var _a, _b, _c;
        const w = policy.weights;
        return (input.totalTravelMin * w.valueOfTimePerMin +
            input.totalWalkMin *
                w.walkPainPerMin *
                (((_a = policy.context) === null || _a === void 0 ? void 0 : _a.isRaining) ? w.rainWalkMultiplier : 1.0) +
            input.totalTransfers *
                w.transferPain *
                (((_b = policy.context) === null || _b === void 0 ? void 0 : _b.hasElderly) ? w.elderlyTransferMultiplier : 1.0) +
            input.totalQueueMin * w.crowdPainPerMin +
            (input.totalStairsCount > 0 ? w.stairPain : 0) +
            input.overtimeMin * w.overtimePenaltyPerMin +
            ((_c = input.planChangeCount) !== null && _c !== void 0 ? _c : 0) * w.planChangePenalty);
    }
};
exports.DefaultCostModel = DefaultCostModel;
exports.DefaultCostModel = DefaultCostModel = __decorate([
    (0, common_1.Injectable)()
], DefaultCostModel);
exports.DefaultCostModelInstance = new DefaultCostModel();
//# sourceMappingURL=cost-model.service.js.map