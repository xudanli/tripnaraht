"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ProphetService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProphetService = void 0;
const common_1 = require("@nestjs/common");
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
let ProphetService = ProphetService_1 = class ProphetService {
    constructor() {
        this.logger = new common_1.Logger(ProphetService_1.name);
        const scriptPath = path.join(process.cwd(), 'scripts', 'prophet_predict.py');
        this.pythonScriptPath = scriptPath;
        try {
            const fs = require('fs');
            if (!fs.existsSync(this.pythonScriptPath)) {
                this.logger.warn(`Prophet 脚本不存在: ${this.pythonScriptPath}`);
            }
        }
        catch (error) {
        }
    }
    async predict(historicalData, startDate, periods = 30) {
        this.logger.debug(`使用 Prophet 预测价格: ${historicalData.length} 条历史数据, 预测 ${periods} 天`);
        if (historicalData.length < 30) {
            this.logger.warn('历史数据不足30条，降级到历史同期均值法');
            throw new Error('历史数据不足，需要至少30条数据');
        }
        try {
            const inputData = {
                historical_data: historicalData,
                periods,
                start_date: startDate,
            };
            const result = await this.callPythonScript(inputData);
            if (!result.success) {
                throw new Error(result.error || 'Prophet 预测失败');
            }
            return result.forecast.map((f) => ({
                date: f.date,
                price: f.price,
                lower_bound: f.lower_bound,
                upper_bound: f.upper_bound,
                trend: f.trend,
                confidence: f.confidence,
            }));
        }
        catch (error) {
            this.logger.error(`Prophet 预测失败: ${error.message}`);
            throw error;
        }
    }
    async callPythonScript(inputData) {
        return new Promise((resolve, reject) => {
            const pythonCommand = this.findPythonCommand();
            const pythonProcess = (0, child_process_1.spawn)(pythonCommand, [this.pythonScriptPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            let stdout = '';
            let stderr = '';
            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    this.logger.error(`Python 脚本执行失败: ${stderr}`);
                    reject(new Error(`Python 脚本退出码: ${code}, 错误: ${stderr}`));
                    return;
                }
                try {
                    const result = JSON.parse(stdout);
                    resolve(result);
                }
                catch (error) {
                    this.logger.error(`解析 Python 输出失败: ${error.message}`);
                    reject(new Error(`解析 Python 输出失败: ${error.message}`));
                }
            });
            pythonProcess.on('error', (error) => {
                this.logger.error(`启动 Python 进程失败: ${error.message}`);
                reject(new Error(`启动 Python 进程失败: ${error.message}`));
            });
            pythonProcess.stdin.write(JSON.stringify(inputData));
            pythonProcess.stdin.end();
        });
    }
    findPythonCommand() {
        return 'python3';
    }
    async checkAvailability() {
        try {
            const pythonCommand = this.findPythonCommand();
            const testProcess = (0, child_process_1.spawn)(pythonCommand, ['--version']);
            return new Promise((resolve) => {
                testProcess.on('close', (code) => {
                    if (code === 0) {
                        const prophetCheck = (0, child_process_1.spawn)(pythonCommand, [
                            '-c',
                            'import prophet; print("Prophet available")',
                        ]);
                        prophetCheck.on('close', (prophetCode) => {
                            if (prophetCode === 0) {
                                resolve({ available: true, message: 'Prophet 可用' });
                            }
                            else {
                                resolve({
                                    available: false,
                                    message: 'Python 可用，但 Prophet 未安装。请运行: pip install prophet',
                                });
                            }
                        });
                        prophetCheck.on('error', () => {
                            resolve({
                                available: false,
                                message: '无法检查 Prophet，请确保 Python 已安装',
                            });
                        });
                    }
                    else {
                        resolve({
                            available: false,
                            message: 'Python 未安装或不在 PATH 中',
                        });
                    }
                });
                testProcess.on('error', () => {
                    resolve({
                        available: false,
                        message: 'Python 未安装或不在 PATH 中',
                    });
                });
            });
        }
        catch (error) {
            return {
                available: false,
                message: `检查失败: ${error.message}`,
            };
        }
    }
};
exports.ProphetService = ProphetService;
exports.ProphetService = ProphetService = ProphetService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], ProphetService);
//# sourceMappingURL=prophet-service.js.map