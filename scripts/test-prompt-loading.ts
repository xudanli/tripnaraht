// scripts/test-prompt-loading.ts
/**
 * 测试 Prompt 从 docs/SKILLS.md 加载是否正常
 */

import { readFileSync } from 'fs';
import { join } from 'path';

function loadPlannerPromptFromDocs(): string {
  try {
    const docsPath = join(process.cwd(), 'docs', 'SKILLS.md');
    const content = readFileSync(docsPath, 'utf-8');

    const plannerSectionStart = content.indexOf('### 1. 🧠 The Planner');
    if (plannerSectionStart === -1) {
      throw new Error('找不到 Planner 章节');
    }

    const replannerSectionStart = content.indexOf('### 2. 🔄 The Replanner', plannerSectionStart);
    const plannerSection = content.substring(plannerSectionStart, replannerSectionStart);

    const codeBlockMatch = plannerSection.match(/```markdown\n([\s\S]*?)\n```/);
    if (!codeBlockMatch || !codeBlockMatch[1]) {
      throw new Error('找不到 Planner Prompt 代码块');
    }

    return codeBlockMatch[1].trim();
  } catch (error: any) {
    throw error;
  }
}

function loadReplannerPromptFromDocs(): string {
  try {
    const docsPath = join(process.cwd(), 'docs', 'SKILLS.md');
    const content = readFileSync(docsPath, 'utf-8');

    const replannerSectionStart = content.indexOf('### 2. 🔄 The Replanner');
    if (replannerSectionStart === -1) {
      throw new Error('找不到 Replanner 章节');
    }

    const executorSectionStart = content.indexOf('### 3. 🛠️ The Executor', replannerSectionStart);
    const replannerSection = content.substring(replannerSectionStart, executorSectionStart);

    const codeBlockMatch = replannerSection.match(/```markdown\n([\s\S]*?)\n```/);
    if (!codeBlockMatch || !codeBlockMatch[1]) {
      throw new Error('找不到 Replanner Prompt 代码块');
    }

    return codeBlockMatch[1].trim();
  } catch (error: any) {
    throw error;
  }
}

// 测试
console.log('=== 测试 Prompt 加载 ===\n');

try {
  const plannerPrompt = loadPlannerPromptFromDocs();
  console.log('✅ Planner Prompt 加载成功');
  console.log(`   长度: ${plannerPrompt.length} 字符`);
  console.log(`   前50字符: ${plannerPrompt.substring(0, 50)}...`);
  console.log(`   包含变量 {{USER_QUERY}}: ${plannerPrompt.includes('{{USER_QUERY}}')}`);
  console.log(`   包含变量 {{CURRENT_DATE}}: ${plannerPrompt.includes('{{CURRENT_DATE}}')}`);
} catch (error: any) {
  console.error('❌ Planner Prompt 加载失败:', error.message);
}

console.log('');

try {
  const replannerPrompt = loadReplannerPromptFromDocs();
  console.log('✅ Replanner Prompt 加载成功');
  console.log(`   长度: ${replannerPrompt.length} 字符`);
  console.log(`   前50字符: ${replannerPrompt.substring(0, 50)}...`);
  console.log(`   包含变量 {{USER_GOAL}}: ${replannerPrompt.includes('{{USER_GOAL}}')}`);
  console.log(`   包含变量 {{CURRENT_PLAN_JSON}}: ${replannerPrompt.includes('{{CURRENT_PLAN_JSON}}')}`);
} catch (error: any) {
  console.error('❌ Replanner Prompt 加载失败:', error.message);
}

console.log('\n=== 测试完成 ===');
