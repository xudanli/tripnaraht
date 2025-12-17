// src/flight-prices/services/prophet-service.ts
import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { PriceForecast } from '../interfaces/price-prediction.interface';
import * as path from 'path';

/**
 * Prophet 服务
 * 
 * 通过调用 Python 脚本使用 Prophet 模型进行时间序列预测
 */
@Injectable()
export class ProphetService {
  private readonly logger = new Logger(ProphetService.name);
  private readonly pythonScriptPath: string;

  constructor() {
    // 获取 Python 脚本路径
    // 支持开发环境和生产环境
    const scriptPath = path.join(process.cwd(), 'scripts', 'prophet_predict.py');
    // 如果脚本不存在，尝试相对路径
    this.pythonScriptPath = scriptPath;
    
    // 验证脚本是否存在（可选，在运行时检查）
    try {
      const fs = require('fs');
      if (!fs.existsSync(this.pythonScriptPath)) {
        this.logger.warn(`Prophet 脚本不存在: ${this.pythonScriptPath}`);
      }
    } catch (error) {
      // 忽略错误，在运行时处理
    }
  }

  /**
   * 使用 Prophet 模型进行价格预测
   */
  async predict(
    historicalData: Array<{ date: string; price: number }>,
    startDate: string,
    periods: number = 30
  ): Promise<PriceForecast[]> {
    this.logger.debug(`使用 Prophet 预测价格: ${historicalData.length} 条历史数据, 预测 ${periods} 天`);

    // 检查历史数据量
    if (historicalData.length < 30) {
      this.logger.warn('历史数据不足30条，降级到历史同期均值法');
      throw new Error('历史数据不足，需要至少30条数据');
    }

    try {
      // 准备输入数据
      const inputData = {
        historical_data: historicalData,
        periods,
        start_date: startDate,
      };

      // 调用 Python 脚本
      const result = await this.callPythonScript(inputData);

      if (!result.success) {
        throw new Error(result.error || 'Prophet 预测失败');
      }

      // 转换格式
      return result.forecast.map((f: any) => ({
        date: f.date,
        price: f.price,
        lower_bound: f.lower_bound,
        upper_bound: f.upper_bound,
        trend: f.trend,
        confidence: f.confidence,
      }));
    } catch (error: any) {
      this.logger.error(`Prophet 预测失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 调用 Python 脚本
   */
  private async callPythonScript(inputData: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // 使用 python3 或 python 命令
      const pythonCommand = this.findPythonCommand();
      
      const pythonProcess = spawn(pythonCommand, [this.pythonScriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      // 收集标准输出
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // 收集错误输出
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // 处理进程结束
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          this.logger.error(`Python 脚本执行失败: ${stderr}`);
          reject(new Error(`Python 脚本退出码: ${code}, 错误: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (error: any) {
          this.logger.error(`解析 Python 输出失败: ${error.message}`);
          reject(new Error(`解析 Python 输出失败: ${error.message}`));
        }
      });

      // 处理进程错误
      pythonProcess.on('error', (error) => {
        this.logger.error(`启动 Python 进程失败: ${error.message}`);
        reject(new Error(`启动 Python 进程失败: ${error.message}`));
      });

      // 发送输入数据
      pythonProcess.stdin.write(JSON.stringify(inputData));
      pythonProcess.stdin.end();
    });
  }

  /**
   * 查找 Python 命令
   */
  private findPythonCommand(): string {
    // 优先尝试 python3，然后是 python
    // 实际应该检查系统环境
    return 'python3'; // 或 'python'
  }

  /**
   * 检查 Python 和 Prophet 是否可用
   */
  async checkAvailability(): Promise<{ available: boolean; message: string }> {
    try {
      // 尝试运行一个简单的 Python 命令
      const pythonCommand = this.findPythonCommand();
      const testProcess = spawn(pythonCommand, ['--version']);
      
      return new Promise((resolve) => {
        testProcess.on('close', (code) => {
          if (code === 0) {
            // 进一步检查 Prophet 是否安装
            const prophetCheck = spawn(pythonCommand, [
              '-c',
              'import prophet; print("Prophet available")',
            ]);
            
            prophetCheck.on('close', (prophetCode) => {
              if (prophetCode === 0) {
                resolve({ available: true, message: 'Prophet 可用' });
              } else {
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
          } else {
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
    } catch (error: any) {
      return {
        available: false,
        message: `检查失败: ${error.message}`,
      };
    }
  }
}

