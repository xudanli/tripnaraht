"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
if (!process.env.DISABLE_REDIS || process.env.DISABLE_REDIS === 'false') {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    if (redisHost === 'localhost' || redisHost === '127.0.0.1') {
        process.env.DISABLE_REDIS = 'true';
    }
}
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
const logging_interceptor_1 = require("./common/interceptors/logging.interceptor");
const http_exception_filter_1 = require("./common/filters/http-exception.filter");
const security_middleware_1 = require("./common/middlewares/security.middleware");
async function bootstrap() {
    var _a;
    console.log('🚀 [Bootstrap] 开始启动应用...');
    console.log(`🔍 [Bootstrap] DISABLE_REDIS=${process.env.DISABLE_REDIS || 'false'}`);
    const logLevels = process.env.LOG_LEVEL
        ? process.env.LOG_LEVEL.split(',').map(level => level.trim())
        : process.env.NODE_ENV === 'production'
            ? ['error', 'warn', 'log']
            : ['error', 'warn', 'log', 'debug'];
    console.log('🏭 [Bootstrap] 创建 NestFactory...');
    const startTime = Date.now();
    let app;
    try {
        const createPromise = core_1.NestFactory.create(app_module_1.AppModule, {
            logger: logLevels,
        });
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`NestFactory.create() 超时（60秒）。当前模块初始化可能未完成。请检查是否有模块的 onModuleInit 或异步初始化操作卡住。`));
            }, 60000);
        });
        console.log('⏳ [Bootstrap] 等待 NestFactory.create() 完成...');
        const progressInterval = setInterval(() => {
            console.log('⏳ [Bootstrap] 仍在等待 NestFactory.create() 完成... (已等待 ' + Math.floor((Date.now() - startTime) / 1000) + ' 秒)');
        }, 5000);
        try {
            app = await Promise.race([createPromise, timeoutPromise]);
            clearInterval(progressInterval);
        }
        catch (error) {
            clearInterval(progressInterval);
            throw error;
        }
        const duration = Date.now() - startTime;
        console.log(`✅ [Bootstrap] NestFactory 创建完成 (耗时: ${duration}ms)`);
    }
    catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ [Bootstrap] NestFactory 创建失败 (耗时: ${duration}ms)`);
        console.error(`错误: ${error.message}`);
        if (error.stack) {
            console.error(`堆栈: ${error.stack}`);
        }
        process.exit(1);
    }
    app.setGlobalPrefix('api');
    const cookieParser = require('cookie-parser');
    app.use(cookieParser());
    console.log('✅ 安全中间件已注册');
    const securityMiddleware = new security_middleware_1.SecurityMiddleware();
    const httpAdapter = app.getHttpAdapter();
    httpAdapter.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'tripnara-api',
        });
    });
    httpAdapter.get('/oauth/callback', (req, res) => {
        const code = req.query.code;
        const error = req.query.error;
        const errorDescription = req.query.error_description;
        if (error) {
            return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth 认证失败</title>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .container {
              background: white;
              padding: 2rem;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              max-width: 500px;
            }
            h1 { color: #d32f2f; margin-top: 0; }
            .error { color: #666; margin: 1rem 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ OAuth 认证失败</h1>
            <div class="error">
              <strong>错误:</strong> ${error}
            </div>
            ${errorDescription ? `<div class="error"><strong>描述:</strong> ${errorDescription}</div>` : ''}
            <p>请检查认证流程或联系支持。</p>
          </div>
        </body>
        </html>
      `);
        }
        if (code) {
            return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth 认证成功</title>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .container {
              background: white;
              padding: 2rem;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              max-width: 500px;
              text-align: center;
            }
            h1 { color: #2e7d32; margin-top: 0; }
            .success { color: #666; margin: 1rem 0; }
            .code { background: #f5f5f5; padding: 0.5rem; border-radius: 4px; font-family: monospace; font-size: 0.9em; word-break: break-all; }
            .note { color: #999; font-size: 0.9em; margin-top: 1rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ OAuth 认证成功</h1>
            <div class="success">
              <p>授权码已接收，认证信息正在处理中...</p>
              <div class="code">${code.substring(0, 50)}...</div>
            </div>
            <div class="note">
              <p>您可以关闭此窗口。</p>
              <p>如果这是首次认证，请返回命令行查看后续步骤。</p>
            </div>
          </div>
        </body>
        </html>
      `);
        }
        return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>OAuth 回调</title>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            max-width: 500px;
            text-align: center;
          }
          h1 { color: #1976d2; margin-top: 0; }
          .info { color: #666; margin: 1rem 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>OAuth 回调端点</h1>
          <div class="info">
            <p>这是 MCP 服务的 OAuth 回调端点。</p>
            <p>请通过 OAuth 授权流程访问此页面。</p>
          </div>
        </div>
      </body>
      </html>
    `);
    });
    httpAdapter.get('/', (req, res) => {
        res.json({
            message: 'TripNara API',
            version: '1.0',
            status: 'running',
            timestamp: new Date().toISOString(),
            docs: '/api-docs',
        });
    });
    httpAdapter.use((req, res, next) => {
        securityMiddleware.use(req, res, next);
    });
    console.log('✅ 全局异常过滤器已注册');
    app.useGlobalFilters(new http_exception_filter_1.AllExceptionsFilter());
    console.log('✅ HTTP 访问日志拦截器已注册');
    app.useGlobalInterceptors(new logging_interceptor_1.LoggingInterceptor());
    const logger = new common_1.Logger('HTTP');
    console.log('✅ HTTP 访问日志中间件已注册');
    httpAdapter.use((req, res, next) => {
        const isStaticResource = /\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i.test(req.originalUrl);
        const isApiPath = req.originalUrl.startsWith('/api');
        if (isStaticResource && !isApiPath) {
            res.setHeader('Cache-Control', 'public, max-age=259200, immutable');
        }
        else if (!isApiPath) {
            res.setHeader('Cache-Control', 'public, max-age=259200');
        }
        else {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
        console.log(`[HTTP-Middleware] 请求到达: ${req.method} ${req.originalUrl}`);
        logger.log(`[Middleware] 请求到达: ${req.method} ${req.originalUrl}`);
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            const logMessage = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;
            console.log(`[HTTP-Middleware] ${logMessage}`);
            logger.log(`[Middleware] ${logMessage}`);
        });
        res.on('close', () => {
            if (!res.writableFinished) {
                const duration = Date.now() - start;
                const logMessage = `${req.method} ${req.originalUrl} ${res.statusCode || 0} ${duration}ms [CLOSED]`;
                console.warn(`[HTTP-Middleware] ${logMessage}`);
                logger.warn(`[Middleware] ${logMessage}`);
            }
        });
        next();
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        skipMissingProperties: false,
        skipNullProperties: true,
        skipUndefinedProperties: true,
        forbidNonWhitelisted: false,
        transformOptions: {
            enableImplicitConversion: true,
        },
    }));
    const frontendUrls = process.env.FRONTEND_URLS
        ? process.env.FRONTEND_URLS.split(',').map(url => url.trim()).filter(url => url)
        : process.env.FRONTEND_URL
            ? [process.env.FRONTEND_URL]
            : [];
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin) {
                return callback(null, true);
            }
            if (frontendUrls.length === 0) {
                if (process.env.NODE_ENV === 'production') {
                    console.error('🚨 [CORS 安全警告] 生产环境未配置 FRONTEND_URL，当前允许所有来源');
                    console.error('   请尽快在环境变量中配置 FRONTEND_URL 或 FRONTEND_URLS');
                    console.error('   例如: FRONTEND_URL=https://tripnara.com');
                    return callback(null, true);
                }
                return callback(null, true);
            }
            const isAllowed = frontendUrls.some(url => {
                if (origin === url)
                    return true;
                const urlBase = url.replace(/\/$/, '');
                if (origin.startsWith(urlBase))
                    return true;
                return false;
            });
            if (isAllowed) {
                callback(null, true);
            }
            else {
                if (process.env.NODE_ENV !== 'production' &&
                    (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
                    callback(null, true);
                }
                else {
                    console.warn(`⚠️  CORS: 拒绝来自 ${origin} 的请求`);
                    console.warn(`   允许的域名: ${frontendUrls.join(', ')}`);
                    callback(new Error('Not allowed by CORS'));
                }
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        exposedHeaders: ['Authorization'],
        maxAge: 86400,
    });
    if (frontendUrls.length > 0) {
        console.log(`✅ CORS 配置: 允许的前端域名: ${frontendUrls.join(', ')}`);
    }
    else if (process.env.NODE_ENV !== 'production') {
        console.log('⚠️  CORS 配置: 未配置 FRONTEND_URL，开发模式允许所有来源');
    }
    console.log('✅ [Bootstrap] 中间件和 CORS 配置完成');
    console.log('📚 [Bootstrap] 开始配置 Swagger...');
    const config = new swagger_1.DocumentBuilder()
        .setTitle('TripNara API')
        .setDescription('智能旅行规划 API - 支持行程创建、地点查询、AI 策略计算等功能')
        .setVersion('1.0')
        .addTag('trips', '行程管理相关接口')
        .addTag('places', '地点查询相关接口')
        .addTag('itinerary-items', '行程项管理相关接口')
        .addTag('itinerary-optimization', '路线优化相关接口（节奏感算法）')
        .addTag('transport', '交通规划相关接口')
        .addTag('flight-prices', '机票价格参考相关接口')
        .addTag('countries', '国家档案相关接口')
        .addTag('planning-policy', '规划策略相关接口（画像驱动、稳健度评估、What-If）')
        .addTag('voice', '语音解析相关接口')
        .addTag('vision', '视觉识别相关接口（拍照识别 POI）')
        .addTag('schedule-action', '行程动作执行相关接口')
        .addTag('agent', '智能体统一入口（COALA + ReAct 双系统架构）')
        .addTag('decision', '决策层接口（Abu/Dr.Dre/Neptune 策略、约束校验、可解释性、学习机制）')
        .addTag('rag', 'RAG 检索增强生成接口（文档检索、合规规则提取、目的地深度信息）')
        .addTag('readiness', '旅行准备度检查接口（个性化准备清单、风险预警）')
        .addTag('auth', '认证相关接口（Google OAuth）')
        .addTag('contact', '联系我们接口（反馈消息和图片上传）')
        .addTag('google-calendar', 'Google Calendar 集成接口（行程同步、事件管理）')
        .addTag('browserbase-mcp', 'Browserbase MCP 接口（浏览器自动化）')
        .addTag('exa', 'Exa 搜索服务接口（实时信息、风险检查、政策更新）')
        .addTag('airbnb', 'Airbnb 住宿服务接口（可用性检查、价格估算、偏好匹配）')
        .addServer('http://47.253.148.159', '生产环境')
        .addCookieAuth('refresh_token')
        .addBearerAuth()
        .build();
    console.log('✅ [Bootstrap] Swagger config 创建完成');
    console.log('📄 [Bootstrap] 开始生成 Swagger 文档...');
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    console.log('✅ [Bootstrap] Swagger document 创建完成');
    console.log('🎨 [Bootstrap] 开始设置 Swagger UI...');
    swagger_1.SwaggerModule.setup('api-docs', app, document, {
        customSiteTitle: 'TripNara API 文档',
        customfavIcon: '/favicon.ico',
        customCss: '.swagger-ui .topbar { display: none }',
    });
    console.log('✅ [Bootstrap] Swagger UI 设置完成');
    console.log('🌐 [Bootstrap] 开始监听端口...');
    const port = Number((_a = process.env.PORT) !== null && _a !== void 0 ? _a : 3000);
    const server = await app.listen(port, '0.0.0.0');
    server.timeout = 120000;
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
    console.log(`✅ [Bootstrap] API listening on http://0.0.0.0:${port}`);
    console.log(`✅ [Bootstrap] HTTP服务器超时设置: ${server.timeout}ms (${server.timeout / 1000}秒)`);
    console.log(`📚 Swagger 文档: http://0.0.0.0:${port}/api-docs`);
}
bootstrap();
//# sourceMappingURL=main.js.map