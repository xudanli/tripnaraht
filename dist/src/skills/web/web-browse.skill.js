"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var WebBrowseSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebBrowseSkill = void 0;
const common_1 = require("@nestjs/common");
const skill_decorator_1 = require("../decorators/skill.decorator");
const puppeteer_1 = __importDefault(require("puppeteer"));
let WebBrowseSkill = WebBrowseSkill_1 = class WebBrowseSkill {
    constructor() {
        this.logger = new common_1.Logger(WebBrowseSkill_1.name);
        this.browser = null;
        this.cache = new Map();
        this.DEFAULT_CACHE_TTL_MS = 1000 * 60 * 60;
        this.DEFAULT_TIMEOUT_MS = 15000;
        this.metadata = {
            name: 'web.browse',
            description: '浏览网页并提取结构化内容（用于 RAG Level 4 降级）',
            version: '1.0.0',
            category: 'rag',
            toolGroup: 'DOMAIN',
            inputSchema: {
                required: ['url'],
                typeChecks: {
                    url: { type: 'string', format: 'url' },
                    query: { type: 'string' },
                    timeout: { type: 'number', min: 1000, max: 60000 },
                    waitForSelector: { type: 'string' },
                },
            },
        };
        this.logger.log(`[WebBrowseSkill] 已初始化`);
    }
    async execute(input) {
        const startTime = Date.now();
        if (!input.url) {
            throw new Error('url 参数是必需的');
        }
        try {
            new URL(input.url);
        }
        catch (error) {
            throw new Error(`无效的 URL: ${input.url}`);
        }
        if (!input.disableCache) {
            const cached = this.getCache(input.url);
            if (cached) {
                this.logger.log(`[WebBrowseSkill] 从缓存返回: ${input.url}`);
                return {
                    ...cached,
                    cached: true,
                    duration_ms: Date.now() - startTime,
                };
            }
        }
        await this.ensureBrowser();
        let page = null;
        try {
            page = await this.browser.newPage();
            if (input.userAgent) {
                await page.setUserAgent(input.userAgent);
            }
            else {
                await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            }
            const timeout = input.timeout || this.DEFAULT_TIMEOUT_MS;
            page.setDefaultTimeout(timeout);
            this.logger.log(`[WebBrowseSkill] 正在加载: ${input.url}`);
            await page.goto(input.url, {
                waitUntil: 'networkidle2',
                timeout,
            });
            if (input.waitForSelector) {
                await page.waitForSelector(input.waitForSelector, { timeout });
            }
            const content = await this.extractContent(page, input);
            const metadata = await this.extractMetadata(page);
            const links = await this.extractLinks(page);
            let relevanceScore;
            if (input.query) {
                relevanceScore = this.calculateRelevance(content, input.query);
            }
            const evidenceId = input.evidence_id || `web_browse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const output = {
                url: input.url,
                title: await page.title(),
                content,
                metadata,
                links,
                evidence_id: evidenceId,
                source: 'web.browse',
                cached: false,
                duration_ms: Date.now() - startTime,
                relevance_score: relevanceScore,
            };
            if (!input.disableCache) {
                this.setCache(input.url, output);
            }
            this.logger.log(`[WebBrowseSkill] ✓ 成功浏览 ${input.url} (${output.duration_ms}ms, 内容长度: ${content.length} 字符)`);
            return output;
        }
        catch (error) {
            this.logger.error(`[WebBrowseSkill] ✗ 浏览失败: ${input.url}`, error.stack);
            throw new Error(`网页浏览失败: ${error.message}`);
        }
        finally {
            if (page) {
                await page.close();
            }
        }
    }
    async extractContent(page, input) {
        if (input.extractAllText) {
            return await page.evaluate(() => {
                return document.body.innerText || '';
            });
        }
        else {
            return await page.evaluate(() => {
                const selectors = [
                    'article',
                    'main',
                    '[role="main"]',
                    '.content',
                    '.main-content',
                    '#content',
                    '#main-content',
                ];
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element && element.textContent) {
                        return element.textContent.trim();
                    }
                }
                return document.body.innerText || '';
            });
        }
    }
    async extractMetadata(page) {
        try {
            const description = await page.$eval('meta[name="description"], meta[property="og:description"]', el => el.getAttribute('content')).catch(() => undefined);
            const keywordsStr = await page.$eval('meta[name="keywords"]', el => el.getAttribute('content')).catch(() => undefined);
            const author = await page.$eval('meta[name="author"]', el => el.getAttribute('content')).catch(() => undefined);
            const lastModified = await page.$eval('meta[property="article:modified_time"], meta[name="last-modified"]', el => el.getAttribute('content')).catch(() => undefined);
            return {
                description: description || undefined,
                keywords: keywordsStr === null || keywordsStr === void 0 ? void 0 : keywordsStr.split(',').map(k => k.trim()),
                author: author || undefined,
                lastModified: lastModified || undefined,
            };
        }
        catch (error) {
            return {};
        }
    }
    async extractLinks(page) {
        return await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href]'));
            return links
                .map((link) => {
                var _a;
                return ({
                    href: link.href,
                    text: ((_a = link.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || '',
                });
            })
                .filter(link => link.href && link.text)
                .slice(0, 50);
        });
    }
    calculateRelevance(content, query) {
        const lowerContent = content.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const queryWords = lowerQuery.split(/\s+/);
        let matchCount = 0;
        for (const word of queryWords) {
            if (lowerContent.includes(word)) {
                matchCount++;
            }
        }
        return queryWords.length > 0 ? matchCount / queryWords.length : 0;
    }
    async ensureBrowser() {
        if (!this.browser || !this.browser.isConnected()) {
            this.logger.log('[WebBrowseSkill] 启动 Puppeteer 浏览器...');
            this.browser = await puppeteer_1.default.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                ],
            });
            this.logger.log('[WebBrowseSkill] ✓ Puppeteer 浏览器已启动');
        }
    }
    getCache(url) {
        const entry = this.cache.get(url);
        if (!entry)
            return null;
        const now = Date.now();
        if (now - entry.timestamp > entry.ttl_ms) {
            this.cache.delete(url);
            return null;
        }
        return entry.data;
    }
    setCache(url, data, ttl_ms) {
        this.cache.set(url, {
            data,
            timestamp: Date.now(),
            ttl_ms: ttl_ms || this.DEFAULT_CACHE_TTL_MS,
        });
    }
    clearCache() {
        this.cache.clear();
        this.logger.log('[WebBrowseSkill] 缓存已清空');
    }
    async onModuleDestroy() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.logger.log('[WebBrowseSkill] 浏览器已关闭');
        }
        this.clearCache();
    }
};
exports.WebBrowseSkill = WebBrowseSkill;
exports.WebBrowseSkill = WebBrowseSkill = WebBrowseSkill_1 = __decorate([
    (0, skill_decorator_1.Skill)({
        name: 'web.browse',
        description: '浏览网页并提取结构化内容（用于 RAG Level 4 降级）',
        version: '1.0.0',
        category: 'rag',
        toolGroup: 'DOMAIN',
    }),
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], WebBrowseSkill);
//# sourceMappingURL=web-browse.skill.js.map