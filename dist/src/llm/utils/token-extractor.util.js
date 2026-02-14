"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTokenUsage = extractTokenUsage;
const llm_request_dto_1 = require("../dto/llm-request.dto");
function extractTokenUsage(provider, response, prompt) {
    switch (provider) {
        case llm_request_dto_1.LlmProvider.OPENAI:
            return extractOpenAITokenUsage(response, prompt);
        case llm_request_dto_1.LlmProvider.ANTHROPIC:
            return extractAnthropicTokenUsage(response, prompt);
        case llm_request_dto_1.LlmProvider.DEEPSEEK:
            return extractDeepSeekTokenUsage(response, prompt);
        case llm_request_dto_1.LlmProvider.GEMINI:
            return extractGeminiTokenUsage(response, prompt);
        default:
            return estimateTokenUsage(prompt, '');
    }
}
function extractOpenAITokenUsage(response, prompt) {
    var _a, _b, _c;
    if (response === null || response === void 0 ? void 0 : response.usage) {
        return {
            prompt_tokens: response.usage.prompt_tokens || 0,
            completion_tokens: response.usage.completion_tokens || 0,
            total_tokens: response.usage.total_tokens || 0,
        };
    }
    const completion = ((_c = (_b = (_a = response === null || response === void 0 ? void 0 : response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '';
    return estimateTokenUsage(prompt, completion);
}
function extractAnthropicTokenUsage(response, prompt) {
    var _a, _b;
    if (response === null || response === void 0 ? void 0 : response.usage) {
        return {
            prompt_tokens: response.usage.input_tokens || 0,
            completion_tokens: response.usage.output_tokens || 0,
            total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
        };
    }
    const completion = ((_b = (_a = response === null || response === void 0 ? void 0 : response.content) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.text) || '';
    return estimateTokenUsage(prompt, completion);
}
function extractDeepSeekTokenUsage(response, prompt) {
    var _a, _b, _c;
    if (response === null || response === void 0 ? void 0 : response.usage) {
        return {
            prompt_tokens: response.usage.prompt_tokens || 0,
            completion_tokens: response.usage.completion_tokens || 0,
            total_tokens: response.usage.total_tokens || 0,
        };
    }
    const completion = ((_c = (_b = (_a = response === null || response === void 0 ? void 0 : response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '';
    return estimateTokenUsage(prompt, completion);
}
function extractGeminiTokenUsage(response, prompt) {
    var _a, _b, _c, _d, _e;
    if (response === null || response === void 0 ? void 0 : response.usageMetadata) {
        return {
            prompt_tokens: response.usageMetadata.promptTokenCount || 0,
            completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
            total_tokens: response.usageMetadata.totalTokenCount || 0,
        };
    }
    const completion = ((_e = (_d = (_c = (_b = (_a = response === null || response === void 0 ? void 0 : response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text) || '';
    return estimateTokenUsage(prompt, completion);
}
function estimateTokenUsage(prompt, completion) {
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = Math.ceil(completion.length / 4);
    const totalTokens = promptTokens + completionTokens;
    return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
    };
}
//# sourceMappingURL=token-extractor.util.js.map