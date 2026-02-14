"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEPAL_EBC_PHILOSOPHY = exports.ICELAND_HIGHLANDS_PHILOSOPHY = void 0;
exports.validateReplacementAgainstPhilosophy = validateReplacementAgainstPhilosophy;
exports.checkCoreExperienceCoverage = checkCoreExperienceCoverage;
exports.ICELAND_HIGHLANDS_PHILOSOPHY = {
    coreStatement: '从文明进入高地，再回到人间',
    mustVisitTags: ['高地荒原', '温泉', '火山'],
    nonNegotiableRules: [
        '必须有一晚住高地 hut 或营地',
        '必须经过至少一个 F-road 路段',
        '必须从 Ring Road 进入高地，再回到 Ring Road',
    ],
    flexibleParts: [
        '具体 F-road 选择（F26 / F35 / F208）',
        '中间停留点（POI 可替换）',
        '天数（7-10 天范围内）',
    ],
    durationFlexibility: {
        minDays: 7,
        maxDays: 10,
        preferredDays: 8,
    },
};
exports.NEPAL_EBC_PHILOSOPHY = {
    coreStatement: '渐进适应 + 回撤安全线',
    mustVisitTags: ['高海拔适应', '珠峰大本营', '夏尔巴文化'],
    nonNegotiableRules: [
        '必须保证渐进适应（每天海拔上升不超过 500m）',
        '必须包含至少 2 个适应日',
        '必须保证回撤安全线（任何时候都能在 2 天内回到低海拔）',
    ],
    flexibleParts: [
        '具体适应点选择（Namche / Dingboche）',
        '侧线探索（Gokyo / Chhukung）',
        '天数（12-16 天范围内）',
    ],
    durationFlexibility: {
        minDays: 12,
        maxDays: 16,
        preferredDays: 14,
    },
};
function validateReplacementAgainstPhilosophy(replacement, philosophy) {
    const violations = [];
    if (replacement.removedTags && philosophy.mustVisitTags) {
        for (const removedTag of replacement.removedTags) {
            if (philosophy.mustVisitTags.includes(removedTag)) {
                violations.push(`不允许删除必须体验类型: ${removedTag}`);
            }
        }
    }
    return {
        allowed: violations.length === 0,
        violations,
    };
}
function checkCoreExperienceCoverage(currentTags, philosophy) {
    if (!philosophy.mustVisitTags || philosophy.mustVisitTags.length === 0) {
        return { covered: true, missingTags: [] };
    }
    const missingTags = philosophy.mustVisitTags.filter(tag => !currentTags.includes(tag));
    return {
        covered: missingTags.length === 0,
        missingTags,
    };
}
//# sourceMappingURL=route-philosophy.model.js.map