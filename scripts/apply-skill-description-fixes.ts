#!/usr/bin/env npx tsx
/**
 * One-shot / idempotent batch update of skill metadata.description for Tool RAG.
 * Run: npx tsx scripts/apply-skill-description-fixes.ts
 */

import * as fs from 'fs';
import * as path from 'path';

/** skill.name → new description (single-line, no raw double-quotes inside) */
const FIXES: Record<string, string> = {
  'decision.checkApproval':
    '查询 HITL 审批任务状态（pending/approved/rejected）。在 decision 阶段续跑、用户追问审批进度或需按 approval_id 同步结果时调用。',
  'decision.neptuneRepair':
    'Neptune 修复：在保持路线哲学下替换不可用路段、入口或 POI（仅 REPLACE，不改方向）。在 VERIFY/REPAIR 阶段 verify 报不可达或需 Plan B 换段时调用。',
  'iceland.roadSurfaceAlerts':
    '检测 gravel 路段并输出 iceland 租车条款/碎石击伤与 GP 承保方向提醒（启发式）。在冰岛 routeFeasibility 或 worldState 需路面语义告警时调用。',
  'iceland.tunnelProtocol':
    '生成西峡湾 iceland 单车道 tunnel 会车与让行协议（启发式预设）。在西部 fjords 路线含隧道段、readiness/planning 需驾驶协议时调用。',
  'itinerary.generate':
    '生成结构化 itinerary 草案（按天活动与交通骨架）。在 PLAN_GEN 阶段、RESEARCH 已完成且需首版行程时调用。',
  'opening_hours.get':
    '获取 POI opening_hours 与时区规则。在 RESEARCH/VERIFY 阶段校验活动时间窗或 repair 需判断营业冲突时调用。',
  'plan.budget.detectOverrun':
    '检测 plan 预算超支并归因到交通/住宿/体验等类别。在 planning 阶段用户关注花费或 budget 子系统需实时预警时调用。',
  'plan.budget.estimateBaseline':
    '估算 plan 预算基线与区间（交通/住宿/餐饮/门票/体验/缓冲）。在 PLAN_GEN 早期缺省 budget 或用户询问大概花费时调用。',
  'plan.budget.proposeTradeoffs':
    'plan.budget.proposeTradeoffs：提出 plan 最小牺牲的降本 tradeoff 方案，保持路线哲学。在 budget.detectOverrun 报超支且需可选减负方案时调用。',
  'plan.constraints.arbitrateTradeoffs':
    'plan.constraints.arbitrateTradeoffs：对 plan 约束冲突给出最小牺牲仲裁并标记需用户确认的取舍。在 constraints.detectConflicts 发现冲突后需 System2 仲裁时调用。',
  'plan.log.appendDecision':
    '写入 plan 可追溯 decision log（结论、证据、版本）。在 plan/gate 产生用户可见结论后需审计留痕时调用。',
  'plan.transit.buildTransferGraph':
    '构建 plan 跨城 transit 换乘可达图并标记不可达/高风险段。在多城 transit planning 阶段评估连通性时调用。',
  'poi.search':
    '搜索 poi 地点（类型、半径、关键词）。在 RESEARCH 阶段收集景点/餐厅/地标或 repair 需替换 POI 时调用。',
  'repair.apply':
    '将 verify/neptune 产出的 repair adjustments 应用到 itinerary。在 REPAIR 阶段 verify 失败且已有修复方案需落盘时调用。',
  'transport.search':
    '搜索 transport 两点间路线与耗时。在 RESEARCH/VERIFY/REPAIR 阶段计算转场或校验可达性时调用。',
  'world.multimodalPerception':
    '获取 world 多模态感知摘要（图像/文本线索）。在 world.buildContext 需补充非结构化现场证据时调用。',
  'countryPack.generateRegressionTests':
    '为 countryPack 生成回归测试用例，防止 Pack 变更破坏现有块。在 countryPack validate 后或 CI 维护 Pack 契约时调用。',
  'detail.analyzeHealth':
    '分析 itinerary 健康度（时间/预算/节奏/可达性）并列出风险。在用户查看行程详情或 execution 前需体检摘要时调用。',
  'exec.remind':
    '生成 exec 阶段管家式提醒（出发/入住/交通/天气/安全/预算）。在 trip 进入执行期或用户需要行前/行中提醒时调用。',
  'plan.architect.generateSkeleton':
    '从目标与约束生成 2-3 套 plan architect 骨架（紧凑/均衡/松弛）。在 PLAN_GEN 早期需多方案骨架对比时调用。',
  'plan.constraints.detectConflicts':
    '检测 plan 约束冲突（预算/时间/节奏/可达性）。在 architect 产出方案后或用户修改约束需 gate 前扫描时调用。',
  'plan.evidence.buildEnvelope':
    '构建 plan 统一 evidence envelope，使结论可解释可审计。在 gate/decision 输出需绑定证据引用时调用。',
  'plan.gate.precheck':
    '执行 plan gate 快速预检（数据足够则硬判，不足则标记待确认）。在完整三守护者评审前的轻量门控阶段调用。',
  'plan.pace.computeTimeWindows':
    '计算 plan 每日可用 time windows（入住退房、交通、缓冲）。在 pace 评估或 architect 排程前需时间窗约束时调用。',
  'plan.pace.fatigueScore':
    '计算 plan pace 疲劳与节奏评分（早起/长距/爬升/步行）。在 pace 子系统评估是否过载或需 adjustSchedule 时调用。',
  'plan.transit.generatePlanB':
    '为 plan transit 高风险段生成 Plan B（替代城市/交通/时间窗）。在 buildTransferGraph 标记不可达段后需备选方案时调用。',
  'plan.transit.suggestModes':
    '对比 plan transit 同段 A→B 多模式交通（飞机/火车/大巴/自驾）。在跨城段 mode 选择或 budget/时间权衡时调用。',
  'readiness.summarizeRisks':
    '从 world 模型与决策结果提炼 readiness 关键风险与缓解建议。在 readiness 阶段向用户展示行前风险摘要时调用。',
  'world.buildContext':
    '构建 world 完整上下文（PhysicalReality + HumanCapability + RouteDirection）。在 planning/decision 阶段需一次性拉齐世界模型时调用。',
  'world.realtimeWeather':
    '获取 world 实时天气预警（委托 weather.search）。在 gate/readiness 需当前预警或 execution 期风险刷新时调用。',
  'world.weatherPrediction':
    '获取 world 天气预报摘要（委托 weather.search）。在 planning 阶段评估未来窗口风险或 failureRisk 输入时调用。',
  'context.evaluate':
    '评估 context 包质量：计算命中率、噪音率、超预算率、压缩率与相关性得分。在 context.build/compress 后需 metrics 回归或调优 blocks 时调用。',
  'context.regressionTests':
    '运行 context 编译回归测试：生成快照 hash 并 diff 两次构建。在 context 编译逻辑变更后 CI 或本地防回归时调用。',
  'iceland.daylightWindow':
    '计算 iceland 日照与安全驾驶 daylight 时间窗（suncalc + Atlantic/Reykjavik）。在 planning/readiness 需判断可驾驶时段或 polar night 风险时调用。',
  'iceland.fRoadStatus':
    '查询 iceland F-road 统一状态（开放/积雪/不可通行、4x4、涉水、房车限制）。在路线含高地 F-road 或 gate 需 F路通行裁决时调用。',
  'iceland.weatherSeverityClassifier':
    '分类 iceland 天气运行风险档位（safe/caution/dangerous/avoid_nonessential）。在 worldState 或 readiness 需可执行天气语义时调用。',
  'iceland.windRisk':
    '评估 iceland 横风驾驶 wind 风险（区域暴露度 + Open-Meteo 风速）。在 storm/高地路线 planning 或 verify 需风况门控时调用。',
  'plan.gate.runThreeGuardians':
    '编排 plan gate 三人格（Abu/Dr.Dre/Neptune）完整评审并输出结构化 gate 结果。在 precheck 后需正式 gate 决策或用户确认方案前调用。',
  'routePack.generateRegressionTests':
    '为 routePack 生成回归测试用例，防止 Pack 变更破坏现有块。在 routePack validate 后或 CI 维护 RouteDirection Pack 契约时调用。',
};

function walkSkillFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSkillFiles(full, acc);
    else if (entry.isFile() && entry.name.endsWith('.skill.ts') && !entry.name.endsWith('.spec.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function extractQuotedField(block: string, field: string): string | undefined {
  const re = new RegExp(`${field}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`);
  return block.match(re)?.[2]?.trim();
}

function extractBracedBlock(content: string, marker: string): string | null {
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  const braceStart = content.indexOf('{', idx + marker.length - 1);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) return content.slice(braceStart + 1, i);
    }
  }
  return null;
}

function parseSkillName(content: string): string | undefined {
  const metaInner =
    extractBracedBlock(content, 'metadata = {') ??
    extractBracedBlock(content, 'metadata= {') ??
    extractBracedBlock(content, 'metadata: SkillMetadata = {') ??
    extractBracedBlock(content, 'metadata: SkillMetadata= {');
  if (metaInner) {
    const n = extractQuotedField(metaInner, 'name');
    if (n) return n;
  }
  const dec = content.match(/@SkillDecorator\(\{[\s\S]*?name:\s*['"`]([^'"`]+)['"`]/);
  return dec?.[1];
}

function replaceDescriptionInContent(content: string, oldDesc: string, newDesc: string): string {
  if (oldDesc === newDesc) return content;
  // Replace metadata.description string literals; use [\s\S] so inner " in old broken files still match once.
  const markers = [
    'metadata = {',
    'metadata= {',
    'metadata: SkillMetadata = {',
    'metadata: SkillMetadata= {',
  ];
  for (const marker of markers) {
    const start = content.indexOf(marker);
    if (start === -1) continue;
    const blockStart = content.indexOf('{', start);
    if (blockStart === -1) continue;
    let depth = 0;
    let blockEnd = -1;
    for (let i = blockStart; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') {
        depth--;
        if (depth === 0) {
          blockEnd = i;
          break;
        }
      }
    }
    if (blockEnd === -1) continue;
    const block = content.slice(blockStart, blockEnd + 1);
    const descRe = /description\s*:\s*(['"`])([\s\S]*?)\1/;
    if (!descRe.test(block)) continue;
    const newBlock = block.replace(descRe, `description: '${newDesc.replace(/'/g, "\\'")}'`);
    if (newBlock !== block) {
      return content.slice(0, blockStart) + newBlock + content.slice(blockEnd + 1);
    }
  }
  return content;
}

function main(): void {
  const root = path.join(process.cwd(), 'src/skills');
  let updated = 0;
  let skipped = 0;

  for (const file of walkSkillFiles(root)) {
    const content = fs.readFileSync(file, 'utf8');
    const name = parseSkillName(content);
    if (!name || !FIXES[name]) continue;

    const newDesc = FIXES[name];
    const metaInner =
      extractBracedBlock(content, 'metadata = {') ??
      extractBracedBlock(content, 'metadata= {') ??
      extractBracedBlock(content, 'metadata: SkillMetadata = {') ??
      extractBracedBlock(content, 'metadata: SkillMetadata= {');
    const oldDesc = metaInner ? extractQuotedField(metaInner, 'description') : undefined;

    if (!oldDesc) {
      console.warn(`skip (no metadata.description): ${name} ${file}`);
      skipped++;
      continue;
    }
    if (oldDesc === newDesc) {
      skipped++;
      continue;
    }

    const next = replaceDescriptionInContent(content, oldDesc, newDesc);
    if (next === content) {
      console.warn(`skip (pattern not replaced): ${name}`);
      skipped++;
      continue;
    }
    fs.writeFileSync(file, next, 'utf8');
    console.log(`updated ${name}`);
    updated++;
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped`);
}

main();
