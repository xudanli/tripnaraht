"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebBrowseActions = createWebBrowseActions;
const action_interface_1 = require("../../interfaces/action.interface");
function createWebBrowseActions(webBrowseExecutor) {
    return [
        {
            name: 'webbrowse.browse',
            description: '使用无头浏览器访问网页并提取内容',
            metadata: {
                kind: action_interface_1.ActionKind.EXTERNAL,
                cost: action_interface_1.ActionCost.HIGH,
                side_effect: action_interface_1.ActionSideEffect.CALLS_API,
                preconditions: [],
                idempotent: false,
                cacheable: false,
            },
            input_schema: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: '要访问的 URL',
                    },
                    extract_text: {
                        type: 'boolean',
                        description: '是否提取页面文本内容',
                        default: true,
                    },
                    extract_links: {
                        type: 'boolean',
                        description: '是否提取页面链接',
                        default: false,
                    },
                    take_screenshot: {
                        type: 'boolean',
                        description: '是否截图',
                        default: false,
                    },
                    wait_for_selector: {
                        type: 'string',
                        description: '等待特定 CSS 选择器',
                        default: undefined,
                    },
                    wait_for_timeout: {
                        type: 'number',
                        description: '等待超时时间（毫秒）',
                        default: 5000,
                    },
                },
                required: ['url'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' },
                    url: { type: 'string' },
                    title: { type: 'string' },
                    content: { type: 'string' },
                    extracted_text: { type: 'string' },
                    links: { type: 'array', items: { type: 'string' } },
                    screenshot: { type: 'string' },
                    metadata: {
                        type: 'object',
                        properties: {
                            loadTime: { type: 'number' },
                            contentLength: { type: 'number' },
                            statusCode: { type: 'number' },
                        },
                    },
                    error: { type: 'string' },
                },
            },
            execute: async (input, state) => {
                var _a, _b, _c;
                if (!input.url || typeof input.url !== 'string') {
                    return {
                        success: false,
                        error: 'URL parameter is required but was not provided. The webbrowse.browse action requires a valid URL to browse.',
                        url: input.url,
                        shouldReplan: true,
                    };
                }
                const result = await webBrowseExecutor.browse(input.url, {
                    extractText: input.extract_text !== false,
                    extractLinks: input.extract_links === true,
                    takeScreenshot: input.take_screenshot === true,
                    waitForSelector: input.wait_for_selector,
                    waitForTimeout: input.wait_for_timeout || 5000,
                });
                if (!result.success) {
                    return {
                        success: false,
                        error: result.error || 'WebBrowse failed',
                        url: input.url,
                    };
                }
                return {
                    success: true,
                    url: result.url,
                    title: result.title,
                    content: result.content,
                    extracted_text: result.content,
                    links: result.metadata && 'linksCount' in result.metadata ? [] : undefined,
                    screenshot: result.screenshot,
                    metadata: {
                        loadTime: (_a = result.metadata) === null || _a === void 0 ? void 0 : _a.loadTime,
                        contentLength: (_b = result.metadata) === null || _b === void 0 ? void 0 : _b.contentLength,
                        statusCode: (_c = result.metadata) === null || _c === void 0 ? void 0 : _c.statusCode,
                    },
                };
            },
        },
    ];
}
//# sourceMappingURL=webbrowse.actions.js.map