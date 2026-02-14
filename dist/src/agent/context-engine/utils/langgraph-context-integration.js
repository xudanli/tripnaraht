"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildContextForNode = buildContextForNode;
exports.writeBackFromNode = writeBackFromNode;
exports.buildPromptFromContextPackage = buildPromptFromContextPackage;
async function buildContextForNode(state, contextEngineer, options) {
    var _a, _b;
    const contextOptions = {
        tripId: (_a = state.metadata) === null || _a === void 0 ? void 0 : _a.tripId,
        phase: options.phase,
        agent: options.agent,
        userQuery: state.userQuery,
        tokenBudget: options.tokenBudget,
        requiredTopics: options.requiredTopics,
        includePrivate: false,
    };
    const contextPackage = await contextEngineer.build(contextOptions);
    let projection;
    if ((_b = state.metadata) === null || _b === void 0 ? void 0 : _b.tripState) {
        projection = await contextEngineer.projectState(state.metadata.tripState, {
            tokenBudget: options.tokenBudget,
        });
    }
    return {
        contextPackage,
        projection,
    };
}
async function writeBackFromNode(state, contextEngineer, data) {
    await contextEngineer.writeBack(data.tripRunId, data.attemptNumber || 1, data.scratchpad, data.decisionLogDelta, data.artifactsRefs);
}
function buildPromptFromContextPackage(contextPackage) {
    const publicBlocks = contextPackage.blocks.filter((b) => b.visibility === 'public');
    publicBlocks.sort((a, b) => b.priority - a.priority);
    const sections = [];
    for (const block of publicBlocks) {
        sections.push(`## ${block.key} (优先级: ${block.priority})`);
        sections.push(block.text);
        if (block.data) {
            sections.push(`\n[结构化数据] ${JSON.stringify(block.data, null, 2)}`);
        }
        sections.push('');
    }
    return sections.join('\n');
}
//# sourceMappingURL=langgraph-context-integration.js.map