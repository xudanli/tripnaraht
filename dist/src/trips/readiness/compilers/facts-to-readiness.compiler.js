"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FactsToReadinessCompiler = void 0;
const common_1 = require("@nestjs/common");
let FactsToReadinessCompiler = class FactsToReadinessCompiler {
    compile(facts, context) {
        const items = [];
        items.push(...this.compileEntryTransit(facts, context));
        items.push(...this.compileLogistics(facts, context));
        items.push(...this.compileSafety(facts, context));
        const blockers = [];
        const must = [];
        const should = [];
        const optional = [];
        for (const item of items) {
            if (item.level === 'blocker') {
                blockers.push(item);
            }
            else if (item.level === 'must') {
                must.push(item);
            }
            else if (item.level === 'should') {
                should.push(item);
            }
            else if (item.level === 'optional') {
                optional.push(item);
            }
        }
        return {
            destinationId: facts.isoCode,
            packId: `facts.${facts.isoCode.toLowerCase()}`,
            packVersion: '1.0.0',
            blockers,
            must,
            should,
            optional,
            risks: [],
        };
    }
    compileEntryTransit(facts, context) {
        const items = [];
        if (facts.visaForCN && context.traveler.nationality === 'CN') {
            const visa = facts.visaForCN;
            if (visa.status === 'VISA_REQUIRED' || visa.status === 'EVISA' || visa.status === 'VOA') {
                items.push({
                    id: `fact.${facts.isoCode}.entry.visa`,
                    category: 'entry_transit',
                    severity: 'high',
                    level: 'must',
                    message: `前往 ${facts.nameCN} 需要${visa.statusCN || visa.status}。${visa.requirementCN || visa.requirement || ''}`,
                    tasks: [
                        {
                            title: `办理${visa.statusCN || visa.status}`,
                            dueOffsetDays: -45,
                            tags: ['visa'],
                        },
                    ],
                });
            }
            else if (visa.status === 'VISA_FREE') {
                items.push({
                    id: `fact.${facts.isoCode}.entry.visa-free`,
                    category: 'entry_transit',
                    severity: 'low',
                    level: 'optional',
                    message: `${facts.nameCN} 对中国护照免签，停留期：${visa.allowedStayCN || visa.allowedStay || '请查询最新政策'}`,
                });
            }
        }
        return items;
    }
    compileLogistics(facts, context) {
        var _a, _b, _c;
        const items = [];
        if (((_a = facts.powerInfo) === null || _a === void 0 ? void 0 : _a.plugTypes) && facts.powerInfo.plugTypes.length > 0) {
            const chinaPlugTypes = ['A', 'C', 'I'];
            const needsAdapter = !facts.powerInfo.plugTypes.some(pt => chinaPlugTypes.includes(pt));
            if (needsAdapter) {
                items.push({
                    id: `fact.${facts.isoCode}.logistics.power-adapter`,
                    category: 'logistics',
                    severity: 'medium',
                    level: 'must',
                    message: `${facts.nameCN} 使用 ${facts.powerInfo.plugTypes.join('/')} 型插头，需要准备转换插头。电压：${facts.powerInfo.voltage || '未知'}V，频率：${facts.powerInfo.frequency || '未知'}Hz`,
                    tasks: [
                        {
                            title: '准备转换插头',
                            dueOffsetDays: -7,
                            tags: ['gear', 'logistics'],
                        },
                    ],
                });
            }
        }
        if (facts.paymentType === 'CASH_HEAVY') {
            items.push({
                id: `fact.${facts.isoCode}.logistics.cash`,
                category: 'logistics',
                severity: 'medium',
                level: 'should',
                message: `${facts.nameCN} 现金使用较多，建议提前准备现金。${((_b = facts.paymentInfo) === null || _b === void 0 ? void 0 : _b.cash_preparation) || ''}`,
                tasks: [
                    {
                        title: '准备现金或了解 ATM 网络',
                        dueOffsetDays: -3,
                        tags: ['logistics', 'payment'],
                    },
                ],
            });
        }
        if ((_c = facts.paymentInfo) === null || _c === void 0 ? void 0 : _c.tipping) {
            items.push({
                id: `fact.${facts.isoCode}.logistics.tipping`,
                category: 'logistics',
                severity: 'low',
                level: 'optional',
                message: `${facts.nameCN} 小费习惯：${facts.paymentInfo.tipping}`,
            });
        }
        if (facts.currencyCode && context.traveler.nationality === 'CN' && facts.exchangeRateToCNY) {
            items.push({
                id: `fact.${facts.isoCode}.logistics.currency`,
                category: 'logistics',
                severity: 'low',
                level: 'optional',
                message: `${facts.nameCN} 使用 ${facts.currencyName || facts.currencyCode}，汇率参考：1 ${facts.currencyCode} ≈ ${facts.exchangeRateToCNY.toFixed(4)} CNY`,
            });
        }
        return items;
    }
    compileSafety(facts, context) {
        const items = [];
        if (facts.emergency) {
            const emergency = facts.emergency;
            const numbers = [];
            if (emergency.police)
                numbers.push(`报警：${emergency.police}`);
            if (emergency.fire)
                numbers.push(`火警：${emergency.fire}`);
            if (emergency.medical)
                numbers.push(`医疗：${emergency.medical}`);
            if (numbers.length > 0) {
                items.push({
                    id: `fact.${facts.isoCode}.safety.emergency`,
                    category: 'safety_hazards',
                    severity: 'medium',
                    level: 'should',
                    message: `${facts.nameCN} 紧急电话：${numbers.join('，')}${emergency.note ? `（${emergency.note}）` : ''}`,
                    tasks: [
                        {
                            title: '保存紧急电话号码',
                            dueOffsetDays: -1,
                            tags: ['safety'],
                        },
                    ],
                });
            }
        }
        return items;
    }
};
exports.FactsToReadinessCompiler = FactsToReadinessCompiler;
exports.FactsToReadinessCompiler = FactsToReadinessCompiler = __decorate([
    (0, common_1.Injectable)()
], FactsToReadinessCompiler);
//# sourceMappingURL=facts-to-readiness.compiler.js.map