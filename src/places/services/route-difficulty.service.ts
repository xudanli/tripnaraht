// src/places/services/route-difficulty.service.ts
import { Injectable, Logger, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as crypto from 'crypto';
import { RouteDifficultyRequestDto, RouteDifficultyResponseDto } from '../dto/route-difficulty.dto';

const execFileAsync = promisify(execFile);

/**
 * 路线难度评估服务
 * 
 * 功能：
 * 1. 调用Python脚本计算路线难度
 * 2. 缓存结果以避免重复计算
 * 3. 处理错误和重试
 */
@Injectable()
export class RouteDifficultyService {
  private readonly logger = new Logger(RouteDifficultyService.name);
  private readonly cache: Map<string, { result: RouteDifficultyResponseDto; timestamp: number }> = new Map();
  private readonly cacheTTL = 3600 * 1000; // 1小时
  private readonly pythonScriptPath: string;

  constructor(private configService: ConfigService) {
    // Python脚本路径
    this.pythonScriptPath = path.join(process.cwd(), 'tools', 'end2end_difficulty_with_geojson.py');
  }

  /**
   * 计算路线难度
   */
  async calculateDifficulty(
    request: RouteDifficultyRequestDto,
  ): Promise<RouteDifficultyResponseDto> {
    // 生成缓存键
    const cacheKey = this.generateCacheKey(request);

    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      this.logger.debug(`Cache hit for key: ${cacheKey}`);
      const result = { ...cached.result };
      if (!request.includeGeoJson) {
        delete result.geojson;
      }
      return result;
    }

    // 验证API密钥
    this.validateApiKeys(request.provider);

    // 调用Python脚本
    try {
      const result = await this.callPythonScript(request);
      
      // 缓存结果（不包含geojson以节省内存）
      const resultToCache = { ...result };
      if (!request.includeGeoJson) {
        delete resultToCache.geojson;
      }
      this.cache.set(cacheKey, {
        result: resultToCache,
        timestamp: Date.now(),
      });

      // 清理过期缓存
      this.cleanExpiredCache();

      return result;
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const errorStack = error?.stack;
      this.logger.error(`Failed to calculate difficulty: ${errorMessage}`, errorStack);
      throw new ServiceUnavailableException(
        `路线难度计算失败: ${errorMessage}`,
      );
    }
  }

  /**
   * 调用Python脚本
   */
  private async callPythonScript(
    request: RouteDifficultyRequestDto,
  ): Promise<RouteDifficultyResponseDto> {
    const args = this.buildPythonArgs(request);
    
    this.logger.debug(`Calling Python script: ${this.pythonScriptPath} ${args.join(' ')}`);

    try {
      // 设置环境变量
      const env = { ...process.env };
      if (request.provider === 'google') {
        // 支持多种环境变量名
        const apiKey = 
          this.configService.get<string>('GOOGLE_MAPS_API_KEY') ||
          this.configService.get<string>('GOOGLE_ROUTES_API_KEY') ||
          this.configService.get<string>('GOOGLE_PLACES_API_KEY');
        if (apiKey) {
          env.GOOGLE_MAPS_API_KEY = apiKey;
        }
      } else {
        // 支持多种环境变量名
        const accessToken = 
          this.configService.get<string>('MAPBOX_ACCESS_TOKEN') ||
          this.configService.get<string>('VITE_MAPBOX_ACCESS_TOKEN');
        if (accessToken) {
          env.MAPBOX_ACCESS_TOKEN = accessToken;
        }
      }

      // 执行Python脚本
      const { stdout, stderr } = await execFileAsync(
        'python3',
        [this.pythonScriptPath, ...args],
        {
          env,
          timeout: 60000, // 60秒超时
          maxBuffer: 10 * 1024 * 1024, // 10MB缓冲区
        },
      );

      // 检查stderr中是否有错误（如依赖缺失）
      if (stderr) {
        this.logger.warn(`Python script stderr: ${stderr}`);
        // 如果是模块缺失错误，提前抛出
        if (stderr.includes('ModuleNotFoundError') || stderr.includes('No module named')) {
          const missingModule = stderr.match(/No module named ['"]([^'"]+)['"]/)?.[1] || 'unknown';
          throw new ServiceUnavailableException(
            `Python依赖缺失: 缺少模块 '${missingModule}'。请运行: pip install requests pillow`,
          );
        }
      }

      // 解析输出（脚本会打印JSON到stdout的最后一行）
      const lines = stdout.split('\n').filter(line => line.trim());
      let jsonLine = '';
      
      // 查找JSON输出（通常在最后一行）
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{')) {
          try {
            // 尝试解析JSON
            JSON.parse(line);
            jsonLine = line;
            break;
          } catch (e) {
            // 不是有效的JSON，继续查找
            continue;
          }
        }
      }

      if (!jsonLine) {
        // 如果没有找到JSON，尝试解析整个stdout
        const cleaned = stdout.trim().split('\n').filter(l => l.trim()).join('\n');
        try {
          jsonLine = cleaned;
        } catch (e) {
          this.logger.error(`Failed to parse JSON from stdout: ${stdout}`);
          throw new Error('无法从Python脚本输出中解析JSON');
        }
      }

      const result = JSON.parse(jsonLine);
      return this.mapToResponseDto(result, request.includeGeoJson);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      
      // 检查是否是Python依赖缺失
      if (errorMessage.includes('ModuleNotFoundError') || errorMessage.includes('No module named')) {
        const missingModule = errorMessage.match(/No module named ['"]([^'"]+)['"]/)?.[1] || 'unknown';
        throw new ServiceUnavailableException(
          `Python依赖缺失: 缺少模块 '${missingModule}'。请运行: pip install requests pillow`,
        );
      }
      
      if (error?.code === 'ETIMEDOUT') {
        throw new ServiceUnavailableException('Python脚本执行超时（60秒）');
      }
      
      // 其他错误
      throw error;
    }
  }

  /**
   * 构建Python脚本参数
   */
  private buildPythonArgs(request: RouteDifficultyRequestDto): string[] {
    const args: string[] = [
      '--provider',
      request.provider,
      '--origin',
      request.origin,
      '--destination',
      request.destination,
    ];

    if (request.profile) {
      args.push('--profile', request.profile);
    }
    if (request.sampleM) {
      args.push('--sample-m', request.sampleM.toString());
    }
    if (request.category) {
      args.push('--category', request.category);
    }
    if (request.accessType) {
      args.push('--accessType', request.accessType);
    }
    if (request.visitDuration) {
      args.push('--visitDuration', request.visitDuration);
    }
    if (request.typicalStay) {
      args.push('--typicalStay', request.typicalStay);
    }
    if (request.elevationMeters) {
      args.push('--elevationMeters', request.elevationMeters.toString());
    }
    if (request.subCategory) {
      args.push('--subCategory', request.subCategory);
    }
    if (request.trailDifficulty) {
      args.push('--trailDifficulty', request.trailDifficulty);
    }
    if (request.provider === 'mapbox') {
      if (request.z) {
        args.push('--z', request.z.toString());
      }
      if (request.workers) {
        args.push('--workers', request.workers.toString());
      }
    }

    // 如果需要GeoJSON，使用临时文件
    if (request.includeGeoJson) {
      const tmpFile = `/tmp/route_difficulty_${Date.now()}.geojson`;
      args.push('--out', tmpFile);
    }

    return args;
  }

  /**
   * 映射Python脚本输出到响应DTO
   */
  private mapToResponseDto(
    pythonResult: any,
    includeGeoJson?: boolean,
  ): RouteDifficultyResponseDto {
    const dto: RouteDifficultyResponseDto = {
      distance_km: pythonResult.distance_km || 0,
      elevation_gain_m: pythonResult.elevation_gain_m || 0,
      slope_avg: pythonResult.slope_avg || 0,
      label: pythonResult.label || 'EASY',
      S_km: pythonResult.S_km || 0,
      notes: pythonResult.notes || [],
    };

    if (includeGeoJson && pythonResult.geojson) {
      dto.geojson = pythonResult.geojson;
    }

    return dto;
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(request: RouteDifficultyRequestDto): string {
    // 使用关键参数生成哈希
    const keyParts = [
      request.provider,
      request.origin,
      request.destination,
      request.profile || 'walking',
      request.sampleM?.toString() || '30',
      request.category || '',
      request.accessType || '',
      request.elevationMeters?.toString() || '',
      request.trailDifficulty || '',
    ];
    
    const keyString = keyParts.join('|');
    return crypto.createHash('md5').update(keyString).digest('hex');
  }

  /**
   * 清理过期缓存
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp >= this.cacheTTL) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 验证API密钥
   */
  private validateApiKeys(provider: string): void {
    if (provider === 'google') {
      // 支持多种环境变量名
      const apiKey = 
        this.configService.get<string>('GOOGLE_MAPS_API_KEY') ||
        this.configService.get<string>('GOOGLE_ROUTES_API_KEY') ||
        this.configService.get<string>('GOOGLE_PLACES_API_KEY');
      if (!apiKey) {
        throw new ServiceUnavailableException('GOOGLE_MAPS_API_KEY 或 GOOGLE_ROUTES_API_KEY 未配置');
      }
    } else if (provider === 'mapbox') {
      // 支持多种环境变量名
      const accessToken = 
        this.configService.get<string>('MAPBOX_ACCESS_TOKEN') ||
        this.configService.get<string>('VITE_MAPBOX_ACCESS_TOKEN');
      if (!accessToken) {
        throw new ServiceUnavailableException('MAPBOX_ACCESS_TOKEN 或 VITE_MAPBOX_ACCESS_TOKEN 未配置');
      }
    }
  }
}

