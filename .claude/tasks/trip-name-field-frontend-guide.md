# 行程名称字段 - 前端修改说明书

## 📋 概述

本文档指导前端开发团队如何在前端应用中集成行程名称字段功能。

**功能说明**：为行程（Trip）添加可自定义的名称字段，提升用户体验和行程管理效率。

**API 变更**：
- `POST /api/trips` - 创建行程时支持 `name` 字段（可选）
- `PUT /api/trips/:id` - 更新行程时支持 `name` 字段（可选）
- `GET /api/trips/:id` - 返回数据包含 `name` 字段
- `GET /api/trips/user/:userId` - 列表数据包含 `name` 字段

---

## 🎯 需要修改的页面

### 1. 创建行程页面

**页面路径**：`/trips/create` 或类似路径

**修改内容**：

#### 1.1 添加名称输入框

在"目的地"字段下方添加"行程名称"输入框：

```tsx
// 示例代码（React + TypeScript）
import { Input } from 'antd'; // 或其他 UI 组件库

interface CreateTripFormData {
  destination: string;
  startDate: string;
  endDate: string;
  totalBudget: number;
  travelers: Traveler[];
  name?: string; // 新增字段
}

function CreateTripPage() {
  const [formData, setFormData] = useState<CreateTripFormData>({
    // ... 其他字段
    name: '', // 可选，默认为空
  });

  return (
    <Form>
      {/* 目的地字段 */}
      <Form.Item label="目的地" name="destination" rules={[...]}>
        <Select>...</Select>
      </Form.Item>

      {/* 🆕 新增：行程名称字段 */}
      <Form.Item 
        label="行程名称" 
        name="name"
        help="为你的行程起个名字吧（可选，如不填写将自动生成）"
        rules={[
          { max: 200, message: '行程名称不能超过 200 字符' },
        ]}
      >
        <Input 
          placeholder="例如：冰岛环岛游"
          maxLength={200}
          showCount
        />
      </Form.Item>

      {/* 其他字段... */}
    </Form>
  );
}
```

#### 1.2 提交表单

提交时包含 `name` 字段（如果用户填写了）：

```tsx
const handleSubmit = async (values: CreateTripFormData) => {
  const payload = {
    destination: values.destination,
    startDate: values.startDate,
    endDate: values.endDate,
    totalBudget: values.totalBudget,
    travelers: values.travelers,
    // 🆕 如果用户填写了名称，则包含在请求中
    ...(values.name?.trim() && { name: values.name.trim() }),
  };

  const response = await fetch('/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const trip = await response.json();
  // trip.data.name 包含用户填写的名称或系统生成的默认名称
};
```

---

### 2. 编辑行程页面

**页面路径**：`/trips/:id/edit` 或类似路径

**修改内容**：

#### 2.1 显示并编辑名称

```tsx
function EditTripPage({ tripId }: { tripId: string }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [formData, setFormData] = useState<Partial<Trip>>({});

  useEffect(() => {
    // 获取行程数据
    fetch(`/api/trips/${tripId}`)
      .then(res => res.json())
      .then(data => {
        setTrip(data.data);
        setFormData({
          name: data.data.name, // 🆕 包含名称字段
          destination: data.data.destination,
          // ... 其他字段
        });
      });
  }, [tripId]);

  const handleUpdate = async () => {
    await fetch(`/api/trips/${tripId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.name?.trim() || undefined, // 🆕 更新名称
        // ... 其他字段
      }),
    });
  };

  return (
    <Form>
      {/* 🆕 行程名称编辑框 */}
      <Form.Item label="行程名称" name="name">
        <Input 
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="例如：冰岛环岛游"
          maxLength={200}
          showCount
        />
      </Form.Item>

      {/* 其他字段... */}
    </Form>
  );
}
```

---

### 3. 行程列表页面

**页面路径**：`/trips` 或 `/trips/my-trips` 或类似路径

**修改内容**：

#### 3.1 显示行程名称

```tsx
interface TripListItem {
  id: string;
  name?: string; // 🆕 新增字段
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
}

function TripListPage() {
  const [trips, setTrips] = useState<TripListItem[]>([]);

  useEffect(() => {
    fetch('/api/trips/user/current-user-id')
      .then(res => res.json())
      .then(data => {
        setTrips(data.data); // data.data 是行程数组
      });
  }, []);

  return (
    <List
      dataSource={trips}
      renderItem={(trip) => (
        <List.Item>
          <Card>
            {/* 🆕 显示行程名称（如果有）或显示默认名称 */}
            <h3>{trip.name || `${getDestinationName(trip.destination)} ${formatDate(trip.startDate)}`}</h3>
            
            {/* 副标题：目的地和日期 */}
            <p>
              {getDestinationName(trip.destination)} · 
              {formatDate(trip.startDate)} - {formatDate(trip.endDate)}
            </p>
            
            {/* 状态标签 */}
            <Tag>{trip.status}</Tag>
          </Card>
        </List.Item>
      )}
    />
  );
}

// 辅助函数：获取目的地名称（如果后端没有返回，前端需要自己映射）
function getDestinationName(countryCode: string): string {
  const map: Record<string, string> = {
    'IS': '冰岛',
    'JP': '日本',
    // ... 其他映射
  };
  return map[countryCode] || countryCode;
}
```

#### 3.2 列表项布局建议

**推荐布局**：
```
┌─────────────────────────────────────┐
│ 冰岛环岛游                          │  ← 行程名称（大标题）
│ 冰岛 · 2025-06-01 - 2025-06-10     │  ← 目的地和日期（副标题）
│ [PLANNING]                          │  ← 状态标签
└─────────────────────────────────────┘
```

**如果名称为空或未命名**：
```
┌─────────────────────────────────────┐
│ 冰岛 2025-06-01                     │  ← 显示默认名称格式
│ 冰岛 · 2025-06-01 - 2025-06-10     │
│ [PLANNING]                          │
└─────────────────────────────────────┘
```

---

### 4. 行程详情页面

**页面路径**：`/trips/:id` 或类似路径

**修改内容**：

#### 4.1 页面标题显示名称

```tsx
function TripDetailPage({ tripId }: { tripId: string }) {
  const [trip, setTrip] = useState<Trip | null>(null);

  useEffect(() => {
    fetch(`/api/trips/${tripId}`)
      .then(res => res.json())
      .then(data => setTrip(data.data));
  }, [tripId]);

  if (!trip) return <Loading />;

  return (
    <div>
      {/* 🆕 页面标题：显示行程名称 */}
      <h1>{trip.name || `${getDestinationName(trip.destination)} ${formatDate(trip.startDate)}`}</h1>
      
      {/* 副标题：目的地和日期范围 */}
      <p className="subtitle">
        {getDestinationName(trip.destination)} · 
        {formatDate(trip.startDate)} - {formatDate(trip.endDate)}
      </p>

      {/* 🆕 内联编辑名称（可选功能） */}
      <Button 
        type="link" 
        icon={<EditOutlined />}
        onClick={() => setEditingName(true)}
      >
        编辑名称
      </Button>

      {/* 其他内容... */}
    </div>
  );
}
```

#### 4.2 内联编辑名称（可选）

```tsx
function TripDetailPage({ tripId }: { tripId: string }) {
  const [editingName, setEditingName] = useState(false);
  const [tripName, setTripName] = useState('');

  const handleSaveName = async () => {
    await fetch(`/api/trips/${tripId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tripName.trim() }),
    });
    setEditingName(false);
    // 刷新行程数据
  };

  return (
    <div>
      {editingName ? (
        <Input.Group compact>
          <Input
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            placeholder="输入行程名称"
            maxLength={200}
            style={{ width: '300px' }}
          />
          <Button type="primary" onClick={handleSaveName}>保存</Button>
          <Button onClick={() => setEditingName(false)}>取消</Button>
        </Input.Group>
      ) : (
        <h1>
          {trip.name || `${getDestinationName(trip.destination)} ${formatDate(trip.startDate)}`}
          <Button type="link" icon={<EditOutlined />} onClick={() => {
            setTripName(trip.name || '');
            setEditingName(true);
          }}>
            编辑
          </Button>
        </h1>
      )}
    </div>
  );
}
```

---

## 📝 TypeScript 类型定义

### 更新 Trip 接口

```typescript
// types/trip.ts 或类似文件

export interface Trip {
  id: string;
  name?: string; // 🆕 新增：行程名称（可选）
  destination: string;
  startDate: string; // ISO 8601 格式
  endDate: string; // ISO 8601 格式
  status: 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  budgetConfig?: {
    totalBudget: number;
    currency: string;
    // ... 其他预算配置
  };
  pacingConfig?: {
    // ... 节奏配置
  };
  createdAt: string;
  updatedAt: string;
  // ... 其他字段
}

// 创建行程请求
export interface CreateTripRequest {
  destination: string;
  startDate: string;
  endDate: string;
  totalBudget: number;
  travelers: Traveler[];
  name?: string; // 🆕 新增：可选字段
  // ... 其他可选字段
}

// 更新行程请求
export interface UpdateTripRequest {
  name?: string; // 🆕 新增：可选字段
  destination?: string;
  startDate?: string;
  endDate?: string;
  // ... 其他可选字段
}
```

---

## 🎨 UI/UX 设计建议

### 1. 创建行程页面

**布局建议**：
```
┌─────────────────────────────────────┐
│ 创建行程                            │
├─────────────────────────────────────┤
│ 目的地 *                            │
│ [选择目的地 ▼]                      │
│                                     │
│ 🆕 行程名称（可选）                  │
│ [输入行程名称...]                    │
│ 💡 为你的行程起个名字吧（可选，如不填│
│    写将自动生成）                    │
│                                     │
│ 开始日期 *                          │
│ [选择日期]                          │
│ ...                                 │
└─────────────────────────────────────┘
```

**交互建议**：
- 名称输入框显示字符计数（0/200）
- 占位符提示：`"例如：冰岛环岛游"`
- 帮助文本说明：`"为你的行程起个名字吧（可选，如不填写将自动生成）"`

### 2. 行程列表页面

**卡片布局**：
```
┌─────────────────────────────────────┐
│ 冰岛环岛游                    [···] │ ← 名称 + 操作菜单
│                                     │
│ 冰岛 · 2025-06-01 - 2025-06-10     │ ← 目的地和日期
│                                     │
│ [PLANNING]  [编辑]  [删除]          │ ← 状态和操作
└─────────────────────────────────────┘
```

**空状态处理**：
- 如果 `name` 为空或 `undefined`，显示默认格式：`"{目的地} {开始日期}"`
- 可以考虑显示"未命名行程"标签（可选）

### 3. 行程详情页面

**页面标题区域**：
```
┌─────────────────────────────────────┐
│ 冰岛环岛游                    [编辑] │ ← 名称 + 编辑按钮
│                                     │
│ 冰岛 · 2025-06-01 - 2025-06-10     │ ← 副标题
│                                     │
│ [PLANNING]                          │ ← 状态
└─────────────────────────────────────┘
```

---

## 🔧 API 调用示例

### 1. 创建行程（带名称）

```typescript
// 方法1：使用 fetch
const createTripWithName = async () => {
  const response = await fetch('/api/trips', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      destination: 'IS',
      startDate: '2025-06-01',
      endDate: '2025-06-10',
      totalBudget: 50000,
      travelers: [
        { type: 'ADULT', mobilityTag: 'CITY_POTATO' },
      ],
      name: '冰岛环岛游', // 🆕 可选字段
    }),
  });

  const result = await response.json();
  console.log('创建的行程:', result.data);
  console.log('行程名称:', result.data.name); // 用户填写的名称或默认名称
};

// 方法2：使用 axios
import axios from 'axios';

const createTripWithName = async () => {
  const response = await axios.post('/api/trips', {
    destination: 'IS',
    startDate: '2025-06-01',
    endDate: '2025-06-10',
    totalBudget: 50000,
    travelers: [
      { type: 'ADULT', mobilityTag: 'CITY_POTATO' },
    ],
    name: '冰岛环岛游', // 🆕 可选字段
  });

  console.log('创建的行程:', response.data.data);
  console.log('行程名称:', response.data.data.name);
};
```

### 2. 创建行程（不填写名称，使用默认）

```typescript
const createTripWithoutName = async () => {
  const response = await fetch('/api/trips', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      destination: 'IS',
      startDate: '2025-06-01',
      endDate: '2025-06-10',
      totalBudget: 50000,
      travelers: [
        { type: 'ADULT', mobilityTag: 'CITY_POTATO' },
      ],
      // 不包含 name 字段，后端会自动生成默认名称
    }),
  });

  const result = await response.json();
  console.log('默认名称:', result.data.name); // 例如："冰岛 2025-06-01"
};
```

### 3. 更新行程名称

```typescript
const updateTripName = async (tripId: string, newName: string) => {
  const response = await fetch(`/api/trips/${tripId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: newName.trim(), // 🆕 更新名称
    }),
  });

  const result = await response.json();
  console.log('更新后的行程:', result.data);
  console.log('新名称:', result.data.name);
};
```

### 4. 获取行程详情

```typescript
const getTripDetail = async (tripId: string) => {
  const response = await fetch(`/api/trips/${tripId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const result = await response.json();
  const trip = result.data;
  
  console.log('行程名称:', trip.name); // 🆕 包含名称字段
  console.log('目的地:', trip.destination);
  // ... 其他字段
};
```

### 5. 获取用户行程列表

```typescript
const getUserTrips = async (userId: string) => {
  const response = await fetch(`/api/trips/user/${userId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const result = await response.json();
  const trips = result.data; // 数组

  trips.forEach((trip: Trip) => {
    console.log('行程名称:', trip.name); // 🆕 每个行程都包含名称字段
    console.log('目的地:', trip.destination);
  });
};
```

---

## ✅ 验证清单

### 功能验证
- [ ] 创建行程时可以填写名称
- [ ] 创建行程时可以不填写名称（后端自动生成默认名称）
- [ ] 创建行程后，返回的数据包含 `name` 字段
- [ ] 编辑行程时可以修改名称
- [ ] 更新名称后，页面正确显示新名称
- [ ] 行程列表页面显示行程名称
- [ ] 行程详情页面显示行程名称（页面标题）
- [ ] 名称长度限制：最多 200 字符
- [ ] 名称为空时显示默认格式（`{目的地} {日期}`）

### UI/UX 验证
- [ ] 名称输入框有字符计数显示
- [ ] 占位符文本清晰易懂
- [ ] 帮助文本说明名称是可选的
- [ ] 列表页面名称显示清晰
- [ ] 详情页面名称显示突出
- [ ] 编辑名称交互流畅

### 兼容性验证
- [ ] 旧数据（没有名称的行程）正常显示
- [ ] API 返回 `name: null` 时前端正确处理
- [ ] 向后兼容：不传 `name` 字段时 API 正常工作

---

## 🐛 常见问题

### Q1: API 返回的 `name` 字段为 `null` 怎么办？

**A**: 前端应该处理这种情况，显示默认格式：
```typescript
const displayName = trip.name || `${getDestinationName(trip.destination)} ${formatDate(trip.startDate)}`;
```

### Q2: 用户输入的名称过长怎么办？

**A**: 前端应该：
1. 输入时限制最大长度（200 字符）
2. 显示字符计数
3. 提交前验证长度
4. 如果后端返回 400 错误，显示错误提示

### Q3: 如何判断名称是用户填写的还是系统生成的？

**A**: 前端无法直接判断，但可以：
- 如果名称格式为 `"{目的地} {日期}"`，可能是默认名称
- 如果名称包含其他内容，可能是用户自定义的
- 或者后端可以在 `metadata` 中标记（可选功能）

### Q4: 名称支持 emoji 吗？

**A**: 支持。`name` 字段是 UTF-8 字符串，支持 emoji 和特殊字符。前端不需要特殊处理。

---

## 📚 相关文档

- **PRD 文档**：`.claude/tasks/trip-name-field-prd.md`
- **API 文档**：查看 Swagger UI（`/api/docs`）
- **后端实施总结**：`.claude/tasks/trip-name-field-implementation-summary.md`

---

## 🎯 开发优先级

### P0（必须）
1. ✅ 创建行程页面：添加名称输入框
2. ✅ 行程列表页面：显示名称
3. ✅ 行程详情页面：显示名称

### P1（重要）
1. ⏸️ 编辑行程页面：支持修改名称
2. ⏸️ 详情页面：内联编辑名称

### P2（可选）
1. ⏸️ 名称搜索功能
2. ⏸️ 名称智能建议
3. ⏸️ 名称历史记录

---

**文档版本**：v1.0  
**创建日期**：2025-02-04  
**适用版本**：后端 API v1.0+
