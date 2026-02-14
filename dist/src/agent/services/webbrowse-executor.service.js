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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var WebBrowseExecutorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebBrowseExecutorService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const playwright_1 = require("playwright");
let WebBrowseExecutorService = WebBrowseExecutorService_1 = class WebBrowseExecutorService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(WebBrowseExecutorService_1.name);
        this.browser = null;
        this.maxConcurrentPages = 3;
        this.activePages = new Set();
        this.enabled = process.env.ENABLE_WEBBROWSE !== 'false';
        if (!this.enabled) {
            this.logger.log('WebBrowse is disabled');
        }
    }
    async getBrowser() {
        if (!this.enabled) {
            throw new Error('WebBrowse is disabled (ENABLE_WEBBROWSE=false)');
        }
        if (!this.browser) {
            try {
                this.browser = await playwright_1.chromium.launch({
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-blink-features=AutomationControlled',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                    ],
                });
                this.logger.debug('Browser instance created');
            }
            catch (error) {
                this.logger.error(`Failed to launch browser: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
                throw new Error(`Browser launch failed: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}. If you don't need WebBrowse, set ENABLE_WEBBROWSE=false`);
            }
        }
        return this.browser;
    }
    async browse(url, options) {
        if (!this.enabled) {
            return {
                success: false,
                error: 'WebBrowse is disabled',
            };
        }
        if (this.activePages.size >= this.maxConcurrentPages) {
            return {
                success: false,
                error: `Maximum concurrent pages limit reached (${this.maxConcurrentPages})`,
            };
        }
        let page = null;
        const startTime = Date.now();
        try {
            const browser = await this.getBrowser();
            const context = await browser.newContext({
                userAgent: (options === null || options === void 0 ? void 0 : options.userAgent) || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: (options === null || options === void 0 ? void 0 : options.viewport) || { width: 1920, height: 1080 },
                locale: 'zh-CN',
            });
            page = await context.newPage();
            this.activePages.add(page);
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });
            });
            this.logger.debug(`Browsing URL: ${url}`);
            const response = await page.goto(url, {
                waitUntil: 'networkidle',
                timeout: 30000,
            });
            if (options === null || options === void 0 ? void 0 : options.waitForTimeout) {
                await page.waitForTimeout(options.waitForTimeout);
            }
            if (options === null || options === void 0 ? void 0 : options.waitForSelector) {
                try {
                    await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
                }
                catch (error) {
                    this.logger.warn(`Wait for selector "${options.waitForSelector}" timeout`);
                }
            }
            const content = await page.content();
            const title = await page.title();
            const loadTime = Date.now() - startTime;
            let extractedText;
            if (options === null || options === void 0 ? void 0 : options.extractText) {
                extractedText = await page.evaluate(() => {
                    const scripts = document.querySelectorAll('script, style');
                    scripts.forEach((el) => el.remove());
                    return document.body.innerText || document.body.textContent || '';
                });
            }
            let extractedLinks;
            if (options === null || options === void 0 ? void 0 : options.extractLinks) {
                extractedLinks = await page.evaluate(() => {
                    const links = Array.from(document.querySelectorAll('a[href]'));
                    return links
                        .map((link) => link.href)
                        .filter((href) => href && href.startsWith('http'));
                });
            }
            let screenshot;
            if (options === null || options === void 0 ? void 0 : options.takeScreenshot) {
                const screenshotBuffer = await page.screenshot({ fullPage: false });
                screenshot = screenshotBuffer.toString('base64');
            }
            const result = {
                success: true,
                url,
                content: extractedText || content,
                title,
                screenshot,
                metadata: {
                    loadTime,
                    contentLength: content.length,
                    statusCode: response === null || response === void 0 ? void 0 : response.status(),
                },
            };
            if (extractedLinks) {
                result.metadata = {
                    ...result.metadata,
                    ...{ linksCount: extractedLinks.length },
                };
            }
            this.logger.debug(`Successfully browsed ${url} (${loadTime}ms)`);
            return result;
        }
        catch (error) {
            this.logger.error(`Failed to browse ${url}: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`, error === null || error === void 0 ? void 0 : error.stack);
            return {
                success: false,
                url,
                error: (error === null || error === void 0 ? void 0 : error.message) || String(error),
            };
        }
        finally {
            if (page) {
                this.activePages.delete(page);
                try {
                    await page.close();
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.logger.warn(`Failed to close page: ${errorMessage}`);
                }
            }
        }
    }
    async browseMany(urls, options) {
        const promises = urls.map(url => this.browse(url, options));
        return Promise.all(promises);
    }
    async cleanup() {
        const closePromises = Array.from(this.activePages).map(async (page) => {
            try {
                await page.close();
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.warn(`Failed to close page during cleanup: ${errorMessage}`);
            }
        });
        await Promise.all(closePromises);
        this.activePages.clear();
        if (this.browser) {
            try {
                await this.browser.close();
                this.browser = null;
                this.logger.debug('Browser instance closed');
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.warn(`Failed to close browser: ${errorMessage}`);
            }
        }
    }
    async isAvailable() {
        if (!this.enabled) {
            return false;
        }
        try {
            const browser = await this.getBrowser();
            return browser.isConnected();
        }
        catch (error) {
            return false;
        }
    }
};
exports.WebBrowseExecutorService = WebBrowseExecutorService;
exports.WebBrowseExecutorService = WebBrowseExecutorService = WebBrowseExecutorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], WebBrowseExecutorService);
//# sourceMappingURL=webbrowse-executor.service.js.map