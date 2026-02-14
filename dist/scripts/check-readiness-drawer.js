"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api';
const TRIP_ID = process.argv[2] || '7034ff65-e05d-4c04-ba7f-e1073eb12b59';
async function httpRequest(method, url) {
    try {
        const response = await (0, axios_1.default)({
            method,
            url: `${BASE_URL}${url}`,
            proxy: false,
            timeout: 30000,
        });
        return response.data;
    }
    catch (error) {
        if (error.response) {
            throw new Error(`API错误 (${error.response.status}): ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}
async function checkReadinessDrawer(tripId) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    console.log(`\n🔍 检查行程准备度抽屉: ${tripId}\n`);
    console.log('='.repeat(80));
    try {
        console.log('\n1️⃣ 准备度检查结果');
        console.log('-'.repeat(80));
        const readinessResult = await httpRequest('GET', `/readiness/trip/${tripId}?lang=zh`);
        if (readinessResult.success) {
            const data = readinessResult.data;
            console.log(`✅ 检查成功`);
            console.log(`\n📊 摘要:`);
            console.log(`  - 阻塞项: ${((_a = data.summary) === null || _a === void 0 ? void 0 : _a.totalBlockers) || 0}`);
            console.log(`  - 必须项: ${((_b = data.summary) === null || _b === void 0 ? void 0 : _b.totalMust) || 0}`);
            console.log(`  - 建议项: ${((_c = data.summary) === null || _c === void 0 ? void 0 : _c.totalShould) || 0}`);
            console.log(`  - 可选项: ${((_d = data.summary) === null || _d === void 0 ? void 0 : _d.totalOptional) || 0}`);
            console.log(`  - 风险数: ${((_e = data.summary) === null || _e === void 0 ? void 0 : _e.totalRisks) || 0}`);
            if (data.findings && data.findings.length > 0) {
                console.log(`\n📋 检查结果详情 (${data.findings.length} 个目的地):`);
                data.findings.forEach((finding, idx) => {
                    console.log(`\n  目的地 ${idx + 1}: ${finding.destinationId || '未知'}`);
                    console.log(`    Pack: ${finding.packId || '未知'}`);
                    if (finding.blockers && finding.blockers.length > 0) {
                        console.log(`    ⛔ 阻塞项 (${finding.blockers.length}):`);
                        finding.blockers.slice(0, 3).forEach((b) => {
                            console.log(`      - ${b.message || b.id}`);
                        });
                    }
                    if (finding.must && finding.must.length > 0) {
                        console.log(`    🔴 必须项 (${finding.must.length}):`);
                        finding.must.slice(0, 3).forEach((m) => {
                            console.log(`      - ${m.message || m.id}`);
                        });
                    }
                    if (finding.should && finding.should.length > 0) {
                        console.log(`    🟡 建议项 (${finding.should.length}):`);
                        finding.should.slice(0, 3).forEach((s) => {
                            console.log(`      - ${s.message || s.id}`);
                        });
                    }
                    if (finding.risks && finding.risks.length > 0) {
                        console.log(`    ⚠️  风险 (${finding.risks.length}):`);
                        finding.risks.slice(0, 3).forEach((r) => {
                            console.log(`      - ${r.type}: ${r.summary || r.message || '无描述'}`);
                        });
                    }
                });
            }
        }
        else {
            console.log(`❌ 检查失败: ${JSON.stringify(readinessResult.error)}`);
        }
        console.log('\n\n2️⃣ 风险预警（增强版）');
        console.log('-'.repeat(80));
        const riskWarnings = await httpRequest('GET', `/readiness/risk-warnings?tripId=${tripId}&lang=zh`);
        if (riskWarnings.success) {
            const riskData = riskWarnings.data;
            console.log(`✅ 获取成功`);
            console.log(`\n📊 风险摘要:`);
            console.log(`  - 总风险数: ${((_f = riskData.summary) === null || _f === void 0 ? void 0 : _f.totalRisks) || 0}`);
            console.log(`  - 高风险: ${((_g = riskData.summary) === null || _g === void 0 ? void 0 : _g.highSeverity) || 0}`);
            console.log(`  - 中风险: ${((_h = riskData.summary) === null || _h === void 0 ? void 0 : _h.mediumSeverity) || 0}`);
            console.log(`  - 低风险: ${((_j = riskData.summary) === null || _j === void 0 ? void 0 : _j.lowSeverity) || 0}`);
            if ((_k = riskData.summary) === null || _k === void 0 ? void 0 : _k.byCategory) {
                console.log(`\n📊 按分类统计:`);
                console.log(`  - 天气: ${riskData.summary.byCategory.weather || 0}`);
                console.log(`  - 地形: ${riskData.summary.byCategory.terrain || 0}`);
                console.log(`  - 安全: ${riskData.summary.byCategory.safety || 0}`);
                console.log(`  - 物流: ${riskData.summary.byCategory.logistics || 0}`);
                console.log(`  - 其他: ${riskData.summary.byCategory.other || 0}`);
            }
            if (riskData.risks && riskData.risks.length > 0) {
                console.log(`\n⚠️  风险详情 (前5个):`);
                riskData.risks.slice(0, 5).forEach((risk, idx) => {
                    console.log(`\n  ${idx + 1}. ${risk.typeIcon || '⚠️'} ${risk.typeLabel || risk.type} (${risk.severityLabel || risk.severity})`);
                    console.log(`     描述: ${risk.message || risk.description || '无描述'}`);
                    if (risk.impact) {
                        console.log(`     影响: ${risk.impact}`);
                    }
                    if (risk.affectedPois && risk.affectedPois.length > 0) {
                        console.log(`     影响的POI:`);
                        risk.affectedPois.forEach((poi) => {
                            console.log(`       - ${poi.nameCN || poi.name} (第${poi.day}天)`);
                        });
                    }
                    if (risk.mitigation && risk.mitigation.length > 0) {
                        console.log(`     缓解建议:`);
                        risk.mitigation.slice(0, 3).forEach((mit, i) => {
                            console.log(`       ${i + 1}. ${mit}`);
                        });
                    }
                });
            }
            else {
                console.log(`\n✅ 无风险信息`);
            }
        }
        else {
            console.log(`❌ 获取失败: ${JSON.stringify(riskWarnings.error)}`);
        }
        console.log('\n\n3️⃣ 准备度分数');
        console.log('-'.repeat(80));
        const readinessScore = await httpRequest('GET', `/readiness/trip/${tripId}/score`);
        if (readinessScore.success) {
            const scoreData = readinessScore.data;
            console.log(`✅ 获取成功`);
            console.log(`\n📊 分数详情:`);
            if (scoreData.score) {
                console.log(`  - 总体分数: ${scoreData.score.overall || 0}/100`);
                console.log(`  - 证据覆盖率: ${scoreData.score.evidenceCoverage || 0}/100`);
                console.log(`  - 时间可行性: ${scoreData.score.scheduleFeasibility || 0}/100`);
                console.log(`  - 交通确定性: ${scoreData.score.transportCertainty || 0}/100`);
                console.log(`  - 安全风险: ${scoreData.score.safetyRisk || 0}/100`);
                console.log(`  - 缓冲时间: ${scoreData.score.buffers || 0}/100`);
            }
            if (scoreData.summary) {
                console.log(`\n📋 摘要:`);
                console.log(`  - 阻塞项: ${scoreData.summary.blockers || 0}`);
                console.log(`  - 必须项: ${scoreData.summary.must || scoreData.summary.warnings || 0}`);
                console.log(`  - 建议项: ${scoreData.summary.should || scoreData.summary.suggestions || 0}`);
                console.log(`  - 高风险: ${scoreData.summary.highRisks || 0}`);
                console.log(`  - 中风险: ${scoreData.summary.mediumRisks || 0}`);
                console.log(`  - 低风险: ${scoreData.summary.lowRisks || 0}`);
            }
        }
        else {
            console.log(`❌ 获取失败: ${JSON.stringify(readinessScore.error)}`);
        }
        console.log('\n\n4️⃣ 个性化准备清单');
        console.log('-'.repeat(80));
        const checklist = await httpRequest('GET', `/readiness/personalized-checklist?tripId=${tripId}&lang=zh`);
        if (checklist.success) {
            const checklistData = checklist.data;
            console.log(`✅ 获取成功`);
            if (checklistData.items && checklistData.items.length > 0) {
                console.log(`\n📋 清单项 (${checklistData.items.length} 个):`);
                const blockers = checklistData.items.filter((i) => i.level === 'blocker');
                const must = checklistData.items.filter((i) => i.level === 'must');
                const should = checklistData.items.filter((i) => i.level === 'should');
                if (blockers.length > 0) {
                    console.log(`\n  ⛔ 阻塞项 (${blockers.length}):`);
                    blockers.slice(0, 3).forEach((item) => {
                        console.log(`    - ${item.message || item.id}`);
                    });
                }
                if (must.length > 0) {
                    console.log(`\n  🔴 必须项 (${must.length}):`);
                    must.slice(0, 5).forEach((item) => {
                        console.log(`    - ${item.message || item.id}`);
                    });
                }
                if (should.length > 0) {
                    console.log(`\n  🟡 建议项 (${should.length}):`);
                    should.slice(0, 5).forEach((item) => {
                        console.log(`    - ${item.message || item.id}`);
                    });
                }
            }
            else {
                console.log(`\n✅ 无清单项`);
            }
        }
        else {
            console.log(`❌ 获取失败: ${JSON.stringify(checklist.error)}`);
        }
        console.log('\n' + '='.repeat(80));
        console.log('\n✅ 检查完成！\n');
    }
    catch (error) {
        console.error('\n❌ 检查失败:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}
checkReadinessDrawer(TRIP_ID);
//# sourceMappingURL=check-readiness-drawer.js.map