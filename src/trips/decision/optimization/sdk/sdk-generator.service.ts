/**
 * SDK 生成器服务
 *
 * P3.4 优化：多语言客户端 SDK 生成
 *
 * 功能：
 * - TypeScript/JavaScript SDK
 * - Python SDK
 * - OpenAPI 规范生成
 * - 类型定义生成
 */

import { Injectable, Logger } from '@nestjs/common';

export interface ApiEndpoint {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  parameters: ParameterDefinition[];
  requestBody?: TypeDefinition;
  response: TypeDefinition;
  tags: string[];
}

export interface ParameterDefinition {
  name: string;
  in: 'path' | 'query' | 'header';
  required: boolean;
  type: string;
  description: string;
}

export interface TypeDefinition {
  name: string;
  properties: PropertyDefinition[];
  description?: string;
}

export interface PropertyDefinition {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: unknown;
  enum?: string[];
}

export interface SDKConfig {
  name: string;
  version: string;
  baseUrl: string;
  description: string;
  author: string;
  license: string;
}

export interface GeneratedSDK {
  language: string;
  files: GeneratedFile[];
  instructions: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

const DEFAULT_ENDPOINTS: ApiEndpoint[] = [
  {
    name: 'createDecision',
    method: 'POST',
    path: '/api/v1/decisions',
    description: '创建新的决策请求',
    parameters: [],
    requestBody: {
      name: 'CreateDecisionRequest',
      properties: [
        { name: 'userId', type: 'string', required: true, description: '用户 ID' },
        { name: 'tripId', type: 'string', required: true, description: '行程 ID' },
        { name: 'context', type: 'object', required: false, description: '决策上下文' },
        { name: 'preferences', type: 'object', required: false, description: '用户偏好' },
      ],
    },
    response: {
      name: 'DecisionResponse',
      properties: [
        { name: 'decisionId', type: 'string', required: true },
        { name: 'status', type: 'string', required: true, enum: ['pending', 'completed', 'failed'] },
        { name: 'result', type: 'DecisionResult', required: false },
      ],
    },
    tags: ['Decisions'],
  },
  {
    name: 'getDecision',
    method: 'GET',
    path: '/api/v1/decisions/{decisionId}',
    description: '获取决策结果',
    parameters: [
      { name: 'decisionId', in: 'path', required: true, type: 'string', description: '决策 ID' },
    ],
    response: {
      name: 'DecisionResponse',
      properties: [
        { name: 'decisionId', type: 'string', required: true },
        { name: 'status', type: 'string', required: true },
        { name: 'result', type: 'DecisionResult', required: false },
        { name: 'explanation', type: 'DecisionExplanation', required: false },
      ],
    },
    tags: ['Decisions'],
  },
  {
    name: 'submitFeedback',
    method: 'POST',
    path: '/api/v1/decisions/{decisionId}/feedback',
    description: '提交用户反馈',
    parameters: [
      { name: 'decisionId', in: 'path', required: true, type: 'string', description: '决策 ID' },
    ],
    requestBody: {
      name: 'FeedbackRequest',
      properties: [
        { name: 'rating', type: 'number', required: true, description: '评分 1-5' },
        { name: 'comment', type: 'string', required: false, description: '文字反馈' },
        { name: 'selectedOption', type: 'string', required: false, description: '用户选择的方案' },
      ],
    },
    response: {
      name: 'FeedbackResponse',
      properties: [
        { name: 'success', type: 'boolean', required: true },
        { name: 'feedbackId', type: 'string', required: true },
      ],
    },
    tags: ['Feedback'],
  },
  {
    name: 'getMetrics',
    method: 'GET',
    path: '/api/v1/metrics',
    description: '获取系统指标',
    parameters: [
      { name: 'from', in: 'query', required: false, type: 'string', description: '开始时间' },
      { name: 'to', in: 'query', required: false, type: 'string', description: '结束时间' },
    ],
    response: {
      name: 'MetricsResponse',
      properties: [
        { name: 'totalDecisions', type: 'number', required: true },
        { name: 'successRate', type: 'number', required: true },
        { name: 'averageLatency', type: 'number', required: true },
        { name: 'averageUtility', type: 'number', required: true },
      ],
    },
    tags: ['Metrics'],
  },
];

@Injectable()
export class SDKGeneratorService {
  private readonly logger = new Logger(SDKGeneratorService.name);

  private endpoints: ApiEndpoint[] = DEFAULT_ENDPOINTS;
  private config: SDKConfig = {
    name: 'decision-os-sdk',
    version: '1.0.0',
    baseUrl: 'https://api.decision-os.example.com',
    description: 'Decision OS Client SDK',
    author: 'Decision OS Team',
    license: 'MIT',
  };

  configure(config: Partial<SDKConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setEndpoints(endpoints: ApiEndpoint[]): void {
    this.endpoints = endpoints;
  }

  addEndpoint(endpoint: ApiEndpoint): void {
    this.endpoints.push(endpoint);
  }

  /**
   * 生成 TypeScript SDK
   */
  generateTypeScriptSDK(): GeneratedSDK {
    const files: GeneratedFile[] = [];

    files.push({
      path: 'src/types.ts',
      content: this.generateTypeScriptTypes(),
    });

    files.push({
      path: 'src/client.ts',
      content: this.generateTypeScriptClient(),
    });

    files.push({
      path: 'src/index.ts',
      content: this.generateTypeScriptIndex(),
    });

    files.push({
      path: 'package.json',
      content: this.generateTypeScriptPackageJson(),
    });

    files.push({
      path: 'tsconfig.json',
      content: this.generateTsConfig(),
    });

    files.push({
      path: 'README.md',
      content: this.generateTypeScriptReadme(),
    });

    return {
      language: 'typescript',
      files,
      instructions: `
1. 解压 SDK 文件到项目目录
2. 运行 npm install
3. 运行 npm run build
4. 在项目中导入: import { DecisionOSClient } from '${this.config.name}'
      `.trim(),
    };
  }

  /**
   * 生成 Python SDK
   */
  generatePythonSDK(): GeneratedSDK {
    const files: GeneratedFile[] = [];

    files.push({
      path: 'decision_os/__init__.py',
      content: this.generatePythonInit(),
    });

    files.push({
      path: 'decision_os/client.py',
      content: this.generatePythonClient(),
    });

    files.push({
      path: 'decision_os/types.py',
      content: this.generatePythonTypes(),
    });

    files.push({
      path: 'setup.py',
      content: this.generatePythonSetup(),
    });

    files.push({
      path: 'requirements.txt',
      content: 'requests>=2.28.0\npydantic>=2.0.0\n',
    });

    files.push({
      path: 'README.md',
      content: this.generatePythonReadme(),
    });

    return {
      language: 'python',
      files,
      instructions: `
1. 解压 SDK 文件到项目目录
2. 运行 pip install -e .
3. 在项目中导入: from decision_os import DecisionOSClient
      `.trim(),
    };
  }

  /**
   * 生成 OpenAPI 规范
   */
  generateOpenAPISpec(): string {
    const spec = {
      openapi: '3.0.3',
      info: {
        title: this.config.name,
        version: this.config.version,
        description: this.config.description,
        license: { name: this.config.license },
      },
      servers: [{ url: this.config.baseUrl }],
      paths: this.generateOpenAPIPaths(),
      components: {
        schemas: this.generateOpenAPISchemas(),
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    };

    return JSON.stringify(spec, null, 2);
  }

  /**
   * 获取所有端点
   */
  getEndpoints(): ApiEndpoint[] {
    return this.endpoints;
  }

  // ========== TypeScript 生成 ==========

  private generateTypeScriptTypes(): string {
    const types = new Set<string>();
    const typeDefinitions: string[] = [];

    for (const endpoint of this.endpoints) {
      if (endpoint.requestBody && !types.has(endpoint.requestBody.name)) {
        types.add(endpoint.requestBody.name);
        typeDefinitions.push(this.generateTypeScriptInterface(endpoint.requestBody));
      }
      if (!types.has(endpoint.response.name)) {
        types.add(endpoint.response.name);
        typeDefinitions.push(this.generateTypeScriptInterface(endpoint.response));
      }
    }

    return `/**
 * Decision OS SDK Types
 * Generated automatically - Do not edit
 */

${typeDefinitions.join('\n\n')}

export interface ClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export interface ApiError {
  message: string;
  code: string;
  status: number;
}
`;
  }

  private generateTypeScriptInterface(type: TypeDefinition): string {
    const props = type.properties.map((p) => {
      const optional = p.required ? '' : '?';
      const typeStr = this.mapToTypeScriptType(p.type);
      const comment = p.description ? `  /** ${p.description} */\n` : '';
      return `${comment}  ${p.name}${optional}: ${typeStr};`;
    });

    const description = type.description ? `/** ${type.description} */\n` : '';
    return `${description}export interface ${type.name} {\n${props.join('\n')}\n}`;
  }

  private mapToTypeScriptType(type: string): string {
    const mapping: Record<string, string> = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      object: 'Record<string, unknown>',
      array: 'unknown[]',
    };
    return mapping[type] || type;
  }

  private generateTypeScriptClient(): string {
    const methods = this.endpoints.map((e) => this.generateTypeScriptMethod(e));

    return `/**
 * Decision OS Client
 * Generated automatically - Do not edit
 */

import type { ClientConfig, ApiResponse, ApiError } from './types';
import type { ${this.getTypeImports().join(', ')} } from './types';

export class DecisionOSClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string>;
    }
  ): Promise<ApiResponse<T>> {
    const url = new URL(path, this.baseUrl);

    if (options?.query) {
      Object.entries(options.query).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, value);
        }
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = \`Bearer \${this.apiKey}\`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
          message: response.statusText,
          code: 'UNKNOWN_ERROR',
          status: response.status,
        }));
        throw error;
      }

      const data = await response.json();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return { data, status: response.status, headers: responseHeaders };
    } finally {
      clearTimeout(timeoutId);
    }
  }

${methods.join('\n\n')}
}
`;
  }

  private generateTypeScriptMethod(endpoint: ApiEndpoint): string {
    const params: string[] = [];
    const pathParams = endpoint.parameters.filter((p) => p.in === 'path');
    const queryParams = endpoint.parameters.filter((p) => p.in === 'query');

    for (const p of pathParams) {
      params.push(`${p.name}: ${this.mapToTypeScriptType(p.type)}`);
    }

    if (endpoint.requestBody) {
      params.push(`body: ${endpoint.requestBody.name}`);
    }

    if (queryParams.length > 0) {
      const queryType = queryParams
        .map((p) => `${p.name}${p.required ? '' : '?'}: ${this.mapToTypeScriptType(p.type)}`)
        .join('; ');
      params.push(`query?: { ${queryType} }`);
    }

    let path = endpoint.path;
    for (const p of pathParams) {
      path = path.replace(`{${p.name}}`, `\${${p.name}}`);
    }

    const bodyArg = endpoint.requestBody ? ', body' : '';
    const queryArg = queryParams.length > 0 ? ', query' : '';
    const options = endpoint.requestBody || queryParams.length > 0
      ? `, { body${bodyArg ? '' : ': undefined'}${queryArg ? ', query' : ''} }`
      : '';

    return `  /**
   * ${endpoint.description}
   */
  async ${endpoint.name}(${params.join(', ')}): Promise<ApiResponse<${endpoint.response.name}>> {
    return this.request<${endpoint.response.name}>('${endpoint.method}', \`${path}\`${options});
  }`;
  }

  private getTypeImports(): string[] {
    const types = new Set<string>();
    for (const endpoint of this.endpoints) {
      if (endpoint.requestBody) {
        types.add(endpoint.requestBody.name);
      }
      types.add(endpoint.response.name);
    }
    return Array.from(types);
  }

  private generateTypeScriptIndex(): string {
    return `export { DecisionOSClient } from './client';
export type * from './types';
`;
  }

  private generateTypeScriptPackageJson(): string {
    return JSON.stringify({
      name: this.config.name,
      version: this.config.version,
      description: this.config.description,
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      scripts: {
        build: 'tsc',
        prepublishOnly: 'npm run build',
      },
      author: this.config.author,
      license: this.config.license,
      devDependencies: {
        typescript: '^5.0.0',
      },
    }, null, 2);
  }

  private generateTsConfig(): string {
    return JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020', 'DOM'],
        declaration: true,
        strict: true,
        outDir: './dist',
        rootDir: './src',
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist'],
    }, null, 2);
  }

  private generateTypeScriptReadme(): string {
    return `# ${this.config.name}

${this.config.description}

## Installation

\`\`\`bash
npm install ${this.config.name}
\`\`\`

## Usage

\`\`\`typescript
import { DecisionOSClient } from '${this.config.name}';

const client = new DecisionOSClient({
  baseUrl: '${this.config.baseUrl}',
  apiKey: 'your-api-key',
});

// Create a decision
const result = await client.createDecision({
  userId: 'user-123',
  tripId: 'trip-456',
  context: { location: 'tokyo' },
});

console.log(result.data);
\`\`\`

## API Reference

${this.endpoints.map((e) => `### ${e.name}\n\n${e.description}\n`).join('\n')}

## License

${this.config.license}
`;
  }

  // ========== Python 生成 ==========

  private generatePythonInit(): string {
    return `"""Decision OS Python SDK"""

from .client import DecisionOSClient
from .types import *

__version__ = "${this.config.version}"
__all__ = ["DecisionOSClient"]
`;
  }

  private generatePythonClient(): string {
    const methods = this.endpoints.map((e) => this.generatePythonMethod(e));

    return `"""Decision OS Client"""

import requests
from typing import Optional, Dict, Any
from .types import *


class DecisionOSClient:
    """Decision OS API Client"""

    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        timeout: int = 30
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.session = requests.Session()

        if api_key:
            self.session.headers["Authorization"] = f"Bearer {api_key}"
        self.session.headers["Content-Type"] = "application/json"

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"

        response = self.session.request(
            method=method,
            url=url,
            json=body,
            params=params,
            timeout=self.timeout
        )

        response.raise_for_status()
        return response.json()

${methods.join('\n\n')}
`;
  }

  private generatePythonMethod(endpoint: ApiEndpoint): string {
    const params: string[] = ['self'];
    const pathParams = endpoint.parameters.filter((p) => p.in === 'path');
    const queryParams = endpoint.parameters.filter((p) => p.in === 'query');

    for (const p of pathParams) {
      params.push(`${this.toSnakeCase(p.name)}: str`);
    }

    if (endpoint.requestBody) {
      for (const prop of endpoint.requestBody.properties) {
        const pyType = this.mapToPythonType(prop.type);
        const optional = prop.required ? '' : ' = None';
        params.push(`${this.toSnakeCase(prop.name)}: ${prop.required ? pyType : `Optional[${pyType}]`}${optional}`);
      }
    }

    for (const p of queryParams) {
      params.push(`${this.toSnakeCase(p.name)}: Optional[str] = None`);
    }

    let path = endpoint.path;
    for (const p of pathParams) {
      path = path.replace(`{${p.name}}`, `{${this.toSnakeCase(p.name)}}`);
    }

    const bodyDict = endpoint.requestBody
      ? `{\n${endpoint.requestBody.properties.map((p) => `            "${p.name}": ${this.toSnakeCase(p.name)}`).join(',\n')}\n        }`
      : 'None';

    const paramsDict = queryParams.length > 0
      ? `{\n${queryParams.map((p) => `            "${p.name}": ${this.toSnakeCase(p.name)}`).join(',\n')}\n        }`
      : 'None';

    return `    def ${this.toSnakeCase(endpoint.name)}(${params.join(', ')}) -> Dict[str, Any]:
        """${endpoint.description}"""
        return self._request(
            method="${endpoint.method}",
            path=f"${path}",
            body=${bodyDict},
            params=${paramsDict}
        )`;
  }

  private generatePythonTypes(): string {
    const types = new Set<string>();
    const typeDefinitions: string[] = [];

    for (const endpoint of this.endpoints) {
      if (endpoint.requestBody && !types.has(endpoint.requestBody.name)) {
        types.add(endpoint.requestBody.name);
        typeDefinitions.push(this.generatePythonDataclass(endpoint.requestBody));
      }
      if (!types.has(endpoint.response.name)) {
        types.add(endpoint.response.name);
        typeDefinitions.push(this.generatePythonDataclass(endpoint.response));
      }
    }

    return `"""Decision OS Types"""

from dataclasses import dataclass
from typing import Optional, List, Dict, Any


${typeDefinitions.join('\n\n')}
`;
  }

  private generatePythonDataclass(type: TypeDefinition): string {
    const props = type.properties.map((p) => {
      const pyType = this.mapToPythonType(p.type);
      const optional = p.required ? '' : ' = None';
      return `    ${this.toSnakeCase(p.name)}: ${p.required ? pyType : `Optional[${pyType}]`}${optional}`;
    });

    return `@dataclass
class ${type.name}:
    """${type.description || type.name}"""
${props.join('\n')}`;
  }

  private mapToPythonType(type: string): string {
    const mapping: Record<string, string> = {
      string: 'str',
      number: 'float',
      boolean: 'bool',
      object: 'Dict[str, Any]',
      array: 'List[Any]',
    };
    return mapping[type] || 'Any';
  }

  private toSnakeCase(str: string): string {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  }

  private generatePythonSetup(): string {
    return `from setuptools import setup, find_packages

setup(
    name="${this.config.name.replace(/-/g, '_')}",
    version="${this.config.version}",
    description="${this.config.description}",
    author="${this.config.author}",
    license="${this.config.license}",
    packages=find_packages(),
    install_requires=[
        "requests>=2.28.0",
        "pydantic>=2.0.0",
    ],
    python_requires=">=3.8",
)
`;
  }

  private generatePythonReadme(): string {
    return `# ${this.config.name}

${this.config.description}

## Installation

\`\`\`bash
pip install ${this.config.name.replace(/-/g, '_')}
\`\`\`

## Usage

\`\`\`python
from decision_os import DecisionOSClient

client = DecisionOSClient(
    base_url="${this.config.baseUrl}",
    api_key="your-api-key"
)

# Create a decision
result = client.create_decision(
    user_id="user-123",
    trip_id="trip-456",
    context={"location": "tokyo"}
)

print(result)
\`\`\`

## API Reference

${this.endpoints.map((e) => `### ${this.toSnakeCase(e.name)}\n\n${e.description}\n`).join('\n')}

## License

${this.config.license}
`;
  }

  // ========== OpenAPI 生成 ==========

  private generateOpenAPIPaths(): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {};

    for (const endpoint of this.endpoints) {
      if (!paths[endpoint.path]) {
        paths[endpoint.path] = {};
      }

      const operation: Record<string, unknown> = {
        summary: endpoint.name,
        description: endpoint.description,
        tags: endpoint.tags,
        operationId: endpoint.name,
        parameters: endpoint.parameters.map((p) => ({
          name: p.name,
          in: p.in,
          required: p.required,
          schema: { type: p.type },
          description: p.description,
        })),
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${endpoint.response.name}` },
              },
            },
          },
        },
      };

      if (endpoint.requestBody) {
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${endpoint.requestBody.name}` },
            },
          },
        };
      }

      paths[endpoint.path][endpoint.method.toLowerCase()] = operation;
    }

    return paths;
  }

  private generateOpenAPISchemas(): Record<string, unknown> {
    const schemas: Record<string, unknown> = {};
    const types = new Set<string>();

    for (const endpoint of this.endpoints) {
      if (endpoint.requestBody && !types.has(endpoint.requestBody.name)) {
        types.add(endpoint.requestBody.name);
        schemas[endpoint.requestBody.name] = this.typeToOpenAPISchema(endpoint.requestBody);
      }
      if (!types.has(endpoint.response.name)) {
        types.add(endpoint.response.name);
        schemas[endpoint.response.name] = this.typeToOpenAPISchema(endpoint.response);
      }
    }

    return schemas;
  }

  private typeToOpenAPISchema(type: TypeDefinition): Record<string, unknown> {
    const required = type.properties.filter((p) => p.required).map((p) => p.name);

    return {
      type: 'object',
      description: type.description,
      required: required.length > 0 ? required : undefined,
      properties: type.properties.reduce((acc, p) => {
        acc[p.name] = {
          type: this.mapToOpenAPIType(p.type),
          description: p.description,
          default: p.default,
          enum: p.enum,
        };
        return acc;
      }, {} as Record<string, unknown>),
    };
  }

  private mapToOpenAPIType(type: string): string {
    const mapping: Record<string, string> = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      object: 'object',
      array: 'array',
    };
    return mapping[type] || 'string';
  }
}
