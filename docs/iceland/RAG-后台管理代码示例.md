# RAG 后台管理代码示例

**最后更新**: 2026-01-23  
**适用框架**: React + TypeScript + Ant Design  
**Base URL**: `http://localhost:3000/api/rag`

---

## 📋 目录

- [类型定义](#类型定义)
- [API 客户端](#api-客户端)
- [管理组件示例](#管理组件示例)

---

## 🔷 类型定义

### `src/types/rag-admin.ts`

```typescript
// 后台管理相关类型定义

// 文档信息
export interface Document {
  id: string;
  title: string;
  content: string;
  contentPreview: string;
  collection: string;
  countryCode?: string;
  tags: string[];
  source?: string;
  createdAt?: string;
  updatedAt?: string;
}

// 文档列表响应
export interface DocumentListResponse {
  documents: Document[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

// 添加文档请求
export interface AddDocumentRequest {
  collection: string;
  title: string;
  content: string;
  countryCode?: string;
  tags?: string[];
  source?: string;
  metadata?: Record<string, any>;
}

// 更新文档请求
export interface UpdateDocumentRequest {
  title?: string;
  content?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

// 索引状态
export interface IndexStatus {
  totalFiles: number;
  totalChunks: number;
  chunksWithEmbedding: number;
  chunksWithoutEmbedding: number;
  byCategory: Record<string, {
    files: number;
    chunks: number;
  }>;
}

// 评估结果
export interface EvaluationResult {
  recallAtK: number;
  mrr: number;
  ndcg: number;
  precision: number;
  query: string;
  retrievedDocuments: string[];
  groundTruthDocuments: string[];
}
```

---

## 🔧 API 客户端

### `src/services/ragAdminApi.ts`

```typescript
import axios, { AxiosInstance } from 'axios';
import type {
  Document,
  DocumentListResponse,
  AddDocumentRequest,
  UpdateDocumentRequest,
  IndexStatus,
  EvaluationResult,
} from '@/types/rag-admin';

class RagAdminApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = '/api/rag') {
    this.client = axios.create({
      baseURL,
      timeout: 300000, // 5分钟超时（重建索引需要较长时间）
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 请求拦截器：添加管理员认证token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('admin_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器：统一错误处理
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          if (status === 401) {
            // 未授权，跳转到登录页
            window.location.href = '/admin/login';
          }
          console.error(`API Error [${status}]:`, data);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * 获取文档列表
   */
  async getDocuments(params: {
    collection?: string;
    countryCode?: string;
    tags?: string;
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<DocumentListResponse> {
    const queryParams = new URLSearchParams();
    if (params.collection) queryParams.append('collection', params.collection);
    if (params.countryCode) queryParams.append('countryCode', params.countryCode);
    if (params.tags) queryParams.append('tags', params.tags);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params.search) queryParams.append('search', params.search);

    const response = await this.client.get<{ success: boolean; data: DocumentListResponse }>(
      `/documents?${queryParams.toString()}`
    );

    if (!response.data.success) {
      throw new Error('获取文档列表失败');
    }

    return response.data.data!;
  }

  /**
   * 获取文档详情
   */
  async getDocument(id: string): Promise<Document> {
    const response = await this.client.get<{ success: boolean; data: Document }>(
      `/documents/${id}`
    );

    if (!response.data.success) {
      throw new Error('获取文档详情失败');
    }

    return response.data.data!;
  }

  /**
   * 添加文档
   */
  async addDocument(data: AddDocumentRequest): Promise<string> {
    const response = await this.client.post<{ success: boolean; data: { id: string } }>(
      '/index',
      data
    );

    if (!response.data.success) {
      throw new Error('添加文档失败');
    }

    return response.data.data!.id;
  }

  /**
   * 批量添加文档
   */
  async batchAddDocuments(documents: AddDocumentRequest[]): Promise<string[]> {
    const response = await this.client.post<{ success: boolean; data: { ids: string[] } }>(
      '/index/batch',
      documents
    );

    if (!response.data.success) {
      throw new Error('批量添加文档失败');
    }

    return response.data.data!.ids;
  }

  /**
   * 更新文档
   */
  async updateDocument(id: string, data: UpdateDocumentRequest): Promise<void> {
    const response = await this.client.put<{ success: boolean }>(
      `/documents/${id}`,
      data
    );

    if (!response.data.success) {
      throw new Error('更新文档失败');
    }
  }

  /**
   * 删除文档
   */
  async deleteDocument(id: string): Promise<void> {
    const response = await this.client.delete<{ success: boolean }>(
      `/documents/${id}`
    );

    if (!response.data.success) {
      throw new Error('删除文档失败');
    }
  }

  /**
   * 重建索引
   */
  async rebuildIndex(): Promise<{ message: string }> {
    const response = await this.client.post<{ success: boolean; data: { message: string } }>(
      '/knowledge-base/rebuild-index'
    );

    if (!response.data.success) {
      throw new Error('重建索引失败');
    }

    return response.data.data!;
  }

  /**
   * 清空索引
   */
  async clearIndex(): Promise<void> {
    const response = await this.client.post<{ success: boolean }>(
      '/knowledge-base/clear-index'
    );

    if (!response.data.success) {
      throw new Error('清空索引失败');
    }
  }

  /**
   * 获取索引状态
   */
  async getIndexStatus(): Promise<IndexStatus> {
    const response = await this.client.get<{ success: boolean; data: IndexStatus }>(
      '/stats'
    );

    if (!response.data.success) {
      throw new Error('获取索引状态失败');
    }

    return response.data.data!;
  }

  /**
   * 刷新合规规则缓存
   */
  async refreshComplianceCache(): Promise<void> {
    const response = await this.client.post<{ success: boolean }>(
      '/compliance/refresh'
    );

    if (!response.data.success) {
      throw new Error('刷新合规规则缓存失败');
    }
  }

  /**
   * 刷新当地洞察缓存
   */
  async refreshLocalInsightCache(params: {
    countryCode: string;
    tags: string[];
    region?: string;
  }): Promise<void> {
    const response = await this.client.post<{ success: boolean }>(
      '/local-insight/refresh',
      params
    );

    if (!response.data.success) {
      throw new Error('刷新当地洞察缓存失败');
    }
  }

  /**
   * 评估检索质量
   */
  async evaluateRetrieval(params: {
    query: string;
    params: Record<string, any>;
    groundTruthDocumentIds: string[];
  }): Promise<EvaluationResult> {
    const response = await this.client.post<{ success: boolean; data: EvaluationResult }>(
      '/evaluation/evaluate',
      params
    );

    if (!response.data.success) {
      throw new Error('评估检索质量失败');
    }

    return response.data.data!;
  }
}

export const ragAdminApi = new RagAdminApiClient();
```

---

## 🎨 管理组件示例

### 示例 1: 文档管理页面

```typescript
// src/pages/admin/RagDocumentManagement.tsx
import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Input,
  Select,
  Space,
  Modal,
  message,
  Popconfirm,
  Tag,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { ragAdminApi } from '@/services/ragAdminApi';
import type { Document } from '@/types/rag-admin';
import { DocumentForm } from './components/DocumentForm';

const { Search } = Input;
const { Option } = Select;

export function RagDocumentManagement() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const [filters, setFilters] = useState({
    collection: '',
    search: '',
  });
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [formVisible, setFormVisible] = useState(false);

  // 加载文档列表
  const loadDocuments = async () => {
    setLoading(true);
    try {
      const response = await ragAdminApi.getDocuments({
        collection: filters.collection || undefined,
        search: filters.search || undefined,
        page: pagination.current,
        pageSize: pagination.pageSize,
      });
      
      setDocuments(response.documents);
      setPagination({
        ...pagination,
        total: response.pagination.total,
      });
    } catch (error: any) {
      message.error(`加载文档列表失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [pagination.current, filters]);

  // 删除文档
  const handleDelete = async (id: string) => {
    try {
      await ragAdminApi.deleteDocument(id);
      message.success('删除成功');
      loadDocuments();
    } catch (error: any) {
      message.error(`删除失败: ${error.message}`);
    }
  };

  // 编辑文档
  const handleEdit = async (document: Document) => {
    const fullDocument = await ragAdminApi.getDocument(document.id);
    setEditingDocument(fullDocument);
    setFormVisible(true);
  };

  // 保存文档
  const handleSave = async (values: any) => {
    try {
      if (editingDocument) {
        await ragAdminApi.updateDocument(editingDocument.id, values);
        message.success('更新成功');
      } else {
        await ragAdminApi.addDocument(values);
        message.success('添加成功');
      }
      setFormVisible(false);
      setEditingDocument(null);
      loadDocuments();
    } catch (error: any) {
      message.error(`保存失败: ${error.message}`);
    }
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: '集合',
      dataIndex: 'collection',
      key: 'collection',
      width: 120,
    },
    {
      title: '国家',
      dataIndex: 'countryCode',
      key: 'countryCode',
      width: 100,
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 200,
      render: (tags: string[]) => (
        <Space>
          {tags.map(tag => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '内容预览',
      dataIndex: 'contentPreview',
      key: 'contentPreview',
      ellipsis: true,
      width: 300,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: Document) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个文档吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="rag-document-management">
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <Space>
          <Search
            placeholder="搜索文档..."
            allowClear
            style={{ width: 300 }}
            onSearch={(value) => {
              setFilters({ ...filters, search: value });
              setPagination({ ...pagination, current: 1 });
            }}
          />
          <Select
            placeholder="选择集合"
            style={{ width: 200 }}
            allowClear
            onChange={(value) => {
              setFilters({ ...filters, collection: value || '' });
              setPagination({ ...pagination, current: 1 });
            }}
          >
            <Option value="travel_guides">旅行指南</Option>
            <Option value="compliance_rules">合规规则</Option>
            <Option value="local_insights">当地洞察</Option>
          </Select>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingDocument(null);
              setFormVisible(true);
            }}
          >
            添加文档
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={documents}
        loading={loading}
        rowKey="id"
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
        }}
        onChange={(pagination) => {
          setPagination({
            current: pagination.current || 1,
            pageSize: pagination.pageSize || 20,
            total: pagination.total || 0,
          });
        }}
      />

      <Modal
        title={editingDocument ? '编辑文档' : '添加文档'}
        open={formVisible}
        onCancel={() => {
          setFormVisible(false);
          setEditingDocument(null);
        }}
        footer={null}
        width={800}
      >
        <DocumentForm
          initialValues={editingDocument || undefined}
          onSave={handleSave}
          onCancel={() => {
            setFormVisible(false);
            setEditingDocument(null);
          }}
        />
      </Modal>
    </div>
  );
}
```

### 示例 2: 文档表单组件

```typescript
// src/pages/admin/components/DocumentForm.tsx
import React from 'react';
import { Form, Input, Select, Button, Space } from 'antd';
import type { Document, AddDocumentRequest } from '@/types/rag-admin';

const { TextArea } = Input;
const { Option } = Select;

interface DocumentFormProps {
  initialValues?: Document;
  onSave: (values: AddDocumentRequest) => Promise<void>;
  onCancel: () => void;
}

export function DocumentForm({ initialValues, onSave, onCancel }: DocumentFormProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await onSave(values);
    } catch (error) {
      console.error('Validation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initialValues}
      onFinish={handleSubmit}
    >
      <Form.Item
        name="collection"
        label="集合"
        rules={[{ required: true, message: '请选择集合' }]}
      >
        <Select placeholder="选择集合">
          <Option value="travel_guides">旅行指南</Option>
          <Option value="compliance_rules">合规规则</Option>
          <Option value="local_insights">当地洞察</Option>
        </Select>
      </Form.Item>

      <Form.Item
        name="title"
        label="标题"
        rules={[{ required: true, message: '请输入标题' }]}
      >
        <Input placeholder="文档标题" />
      </Form.Item>

      <Form.Item
        name="content"
        label="内容"
        rules={[{ required: true, message: '请输入内容' }]}
      >
        <TextArea
          rows={10}
          placeholder="文档内容（更新内容会自动重新生成embedding）"
        />
      </Form.Item>

      <Form.Item name="countryCode" label="国家代码">
        <Input placeholder="如: IS" />
      </Form.Item>

      <Form.Item name="tags" label="标签">
        <Select
          mode="tags"
          placeholder="输入标签后按回车"
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item name="source" label="来源">
        <Input placeholder="数据来源" />
      </Form.Item>

      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={loading}>
            保存
          </Button>
          <Button onClick={onCancel}>取消</Button>
        </Space>
      </Form.Item>
    </Form>
  );
}
```

### 示例 3: 索引管理页面

```typescript
// src/pages/admin/RagIndexManagement.tsx
import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Statistic,
  Row,
  Col,
  Modal,
  message,
  Progress,
  Descriptions,
  Space,
} from 'antd';
import {
  ReloadOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { ragAdminApi } from '@/services/ragAdminApi';
import type { IndexStatus } from '@/types/rag-admin';

export function RagIndexManagement() {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildProgress, setRebuildProgress] = useState(0);

  // 加载索引状态
  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await ragAdminApi.getIndexStatus();
      setStatus(data);
    } catch (error: any) {
      message.error(`加载索引状态失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // 每30秒刷新一次状态
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // 重建索引
  const handleRebuild = () => {
    Modal.confirm({
      title: '确认重建索引',
      content: (
        <div>
          <p>此操作将：</p>
          <ul>
            <li>清空现有索引</li>
            <li>重新扫描所有文件</li>
            <li>重新生成所有embedding向量</li>
            <li>预计耗时 10-20 分钟</li>
          </ul>
          <p style={{ color: 'red' }}>确定要继续吗？</p>
        </div>
      ),
      okText: '确定',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        setRebuilding(true);
        setRebuildProgress(0);
        
        try {
          // 模拟进度更新（实际应该通过WebSocket或轮询获取）
          const progressInterval = setInterval(() => {
            setRebuildProgress((prev) => {
              if (prev >= 90) {
                clearInterval(progressInterval);
                return 90;
              }
              return prev + 5;
            });
          }, 30000); // 每30秒更新5%

          await ragAdminApi.rebuildIndex();
          
          clearInterval(progressInterval);
          setRebuildProgress(100);
          message.success('索引重建成功');
          
          // 重新加载状态
          setTimeout(() => {
            loadStatus();
            setRebuilding(false);
            setRebuildProgress(0);
          }, 2000);
        } catch (error: any) {
          message.error(`重建索引失败: ${error.message}`);
          setRebuilding(false);
          setRebuildProgress(0);
        }
      },
    });
  };

  // 清空索引
  const handleClear = () => {
    Modal.confirm({
      title: '确认清空索引',
      content: (
        <div>
          <p style={{ color: 'red', fontWeight: 'bold' }}>
            此操作将删除所有知识库数据，且不可恢复！
          </p>
          <p>确定要继续吗？</p>
        </div>
      ),
      okText: '确定',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          await ragAdminApi.clearIndex();
          message.success('索引已清空');
          loadStatus();
        } catch (error: any) {
          message.error(`清空索引失败: ${error.message}`);
        }
      },
    });
  };

  // 刷新缓存
  const handleRefreshCache = async (type: 'compliance' | 'localInsight') => {
    try {
      if (type === 'compliance') {
        await ragAdminApi.refreshComplianceCache();
        message.success('合规规则缓存已刷新');
      } else {
        await ragAdminApi.refreshLocalInsightCache({
          countryCode: 'IS',
          tags: ['culture', 'tips'],
        });
        message.success('当地洞察缓存已刷新');
      }
    } catch (error: any) {
      message.error(`刷新缓存失败: ${error.message}`);
    }
  };

  return (
    <div className="rag-index-management">
      <Card title="索引状态" loading={loading}>
        {status && (
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="文件总数"
                value={status.totalFiles}
                prefix={<CheckCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="分块总数"
                value={status.totalChunks}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="有向量"
                value={status.chunksWithEmbedding}
                valueStyle={{ color: '#3f8600' }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="无向量"
                value={status.chunksWithoutEmbedding}
                valueStyle={{ color: '#cf1322' }}
              />
            </Col>
          </Row>
        )}

        {status && (
          <Descriptions
            title="按分类统计"
            bordered
            style={{ marginTop: 24 }}
            column={2}
          >
            {Object.entries(status.byCategory).map(([category, data]) => (
              <Descriptions.Item key={category} label={category}>
                文件: {data.files}, 分块: {data.chunks}
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Card>

      <Card title="索引操作" style={{ marginTop: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {rebuilding && (
            <div>
              <p>正在重建索引...</p>
              <Progress percent={rebuildProgress} status="active" />
              <p style={{ color: '#666', fontSize: 12 }}>
                预计还需要 {Math.ceil((100 - rebuildProgress) / 5) * 0.5} 分钟
              </p>
            </div>
          )}

          <Space>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={handleRebuild}
              disabled={rebuilding}
              danger
            >
              重建索引
            </Button>
            <Button
              icon={<DeleteOutlined />}
              onClick={handleClear}
              disabled={rebuilding}
              danger
            >
              清空索引
            </Button>
            <Button onClick={loadStatus} loading={loading}>
              刷新状态
            </Button>
          </Space>
        </Space>
      </Card>

      <Card title="缓存管理" style={{ marginTop: 16 }}>
        <Space>
          <Button onClick={() => handleRefreshCache('compliance')}>
            刷新合规规则缓存
          </Button>
          <Button onClick={() => handleRefreshCache('localInsight')}>
            刷新当地洞察缓存
          </Button>
        </Space>
      </Card>
    </div>
  );
}
```

---

## 📝 使用建议

### 1. 权限控制
- 所有管理接口应该添加管理员认证
- 使用角色验证确保只有管理员可以访问

### 2. 操作确认
- 危险操作（重建索引、清空索引）需要二次确认
- 显示操作影响和预计时间

### 3. 进度提示
- 长时间操作显示进度条
- 使用WebSocket或轮询获取实时进度

### 4. 错误处理
- 友好的错误提示
- 记录操作日志
- 支持错误重试

---

**维护者**: 请保持此文档与代码同步更新  
**最后验证**: 2026-01-23
