# BigPump Chain Indexer

区块链事件扫描系统，用于索引 BNB Chain 上的 BigPump 合约事件。

## 功能特性

- **事件扫描**: 自动扫描和索引区块链事件
  - `Trade` 事件 (BondingCurve 合约)
  - `NewPool` 事件 (CreatePool 合约)
- **TimescaleDB**: 使用 TimescaleDB 进行时间序列数据存储和查询
- **持久化状态**: 扫描器状态保存在数据库中，支持断点续扫
- **归档节点支持**: 智能切换普通 RPC 和归档 RPC，优化历史数据查询
- **错误处理**: 自动重连和错误恢复机制
- **RESTful API**: 完整的查询 API，包括 K线图生成
- **可配置**: 灵活的配置选项

## 技术栈

- **AdonisJS v6**: Node.js 框架
- **ethers.js**: 区块链交互库
- **TimescaleDB**: 时间序列数据库
- **PostgreSQL**: 关系型数据库
- **TypeScript**: 类型安全

## 安装

1. 安装依赖:

```bash
npm install
```

2. 配置环境变量:

```bash
cp .env.example .env
```

编辑 `.env` 文件:

```env
# 数据库配置
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=your_user
DB_PASSWORD=your_password
DB_DATABASE=bigpump_indexer

# 区块链配置
BSC_RPC_URL=https://bsc-dataseed1.binance.org
CREATE_POOL_ADDRESS_BSC=0x0db4b0a49b52C01c0bC8CB0b22B78836e0Ff01Bc
BONDINGCURVE_ADDRESS_BSC=0xDA267FECC963F2594E9C37AaA5d6BdE04FEc8DCD

# 扫描器配置
SCANNER_START_BLOCK=0           # 起始区块（留空从当前区块开始）
SCANNER_BLOCK_CONFIRMATIONS=12  # 区块确认数
SCANNER_POLL_INTERVAL=5000      # 轮询间隔（毫秒）
SCANNER_CHUNK_SIZE=1000         # 每次处理的区块数量
SCANNER_ARCHIVE_THRESHOLD=128   # 归档节点阈值
```

3. 设置 TimescaleDB:

确保你的 PostgreSQL 数据库已安装 TimescaleDB 扩展:

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
```

4. 运行数据库迁移:

```bash
node ace migration:run
```

## 使用

### 启动 API 服务器

开发模式:

```bash
npm run dev
```

生产模式:

```bash
npm run build
npm start
```

API 服务将在 `http://localhost:3333` 启动。

### 启动扫描器

在另一个终端窗口中运行:

```bash
node ace scan:blockchain
```

可选参数:

- `--chain`: 指定链（默认: bsc）

扫描器会自动从数据库中读取上次的进度，支持断点续扫。

## 数据库架构

### Pools 表

存储池创建事件:

- `chain_id`: 链 ID (56 for BSC)
- `pool_id`: 池 ID
- `creator`: 创建者地址
- `token_address`: 代币地址
- `nft_name`, `nft_ticker`: NFT 信息
- `token_supply`, `eth_balance`: 池状态
- `block_timestamp`: 区块时间戳（用于 hypertable）

### Trades 表

存储交易事件:

- `chain_id`: 链 ID
- `pool_id`: 池 ID
- `trader`: 交易者地址
- `side`: 交易方向 (1=买, 2=卖)
- `quote_amount`, `base_amount`: 交易金额
- `block_timestamp`: 区块时间戳（用于 hypertable）

### Scanner States 表

存储扫描器状态:

- `chain_id`: 链 ID
- `scanner_name`: 扫描器名称
- `last_processed_block`: 最后处理的区块
- `is_running`: 是否正在运行
- `total_blocks_processed`: 已处理区块总数
- `total_events_processed`: 已处理事件总数

## API 端点

所有 API 端点都在 `/api/v1` 前缀下。

### Pools (池)

- `GET /api/v1/pools` - 获取所有池（分页）
  - 查询参数: `page`, `limit`, `chain_id`, `creator`
- `GET /api/v1/pools/:id` - 获取单个池
- `GET /api/v1/pools/by-pool-id?pool_id=123&chain_id=56` - 根据 pool_id 查询
- `GET /api/v1/pools/time-range` - 时间范围查询
  - 查询参数: `start_timestamp`/`start_time`, `end_timestamp`/`end_time`, `chain_id`
  - 支持 Unix timestamp (毫秒) 或 ISO 8601 字符串
- `GET /api/v1/pools/stats` - 池统计信息
  - 查询参数: `chain_id`

### Trades (交易)

- `GET /api/v1/trades` - 获取所有交易（分页）
  - 查询参数: `page`, `limit`, `chain_id`, `pool_id`, `trader`, `side`
- `GET /api/v1/trades/:id` - 获取单个交易
- `GET /api/v1/trades/time-range` - 时间范围查询
  - 查询参数: `start_timestamp`/`start_time`, `end_timestamp`/`end_time`, `chain_id`, `pool_id`
  - 支持 Unix timestamp (毫秒) 或 ISO 8601 字符串
- `GET /api/v1/trades/kline` - K线图数据
  - 查询参数: `pool_id` (必需), `interval` (1m/5m/15m/1h/4h/1d), `start_timestamp`/`start_time`, `end_timestamp`/`end_time`, `chain_id`
  - 支持 Unix timestamp (毫秒) 或 ISO 8601 字符串
- `GET /api/v1/trades/stats` - 交易统计
  - 查询参数: `chain_id`, `pool_id`

### Scanner States (扫描器状态)

- `GET /api/v1/scanner-states` - 获取所有扫描器状态
- `GET /api/v1/scanner-states/show?chain_id=56&scanner_name=bsc-main` - 获取特定扫描器状态

### 示例请求

```bash
# 获取最近的池
curl "http://localhost:3333/api/v1/pools?limit=10"

# 获取特定池的交易
curl "http://localhost:3333/api/v1/trades?pool_id=1&limit=20"

# 获取 K线数据（使用 Unix timestamp，推荐）
NOW=$(date +%s)000
DAY_AGO=$((NOW - 86400000))
curl "http://localhost:3333/api/v1/trades/kline?pool_id=1&interval=1h&start_timestamp=${DAY_AGO}&end_timestamp=${NOW}"

# 获取 K线数据（使用 ISO 字符串，也支持）
curl "http://localhost:3333/api/v1/trades/kline?pool_id=1&interval=1h&start_time=2024-01-01T00:00:00Z&end_time=2024-01-02T00:00:00Z"

# 时间范围查询交易（使用 timestamp）
curl "http://localhost:3333/api/v1/trades/time-range?start_timestamp=1704067200000&end_timestamp=1704153600000&pool_id=1"

# 获取扫描器状态
curl "http://localhost:3333/api/v1/scanner-states"
```

## TimescaleDB 功能

### 时间范围查询

时间序列查询已通过 API 端点支持。推荐使用 Unix timestamp (毫秒):

```bash
# 使用 timestamp（推荐，前端更方便）
curl "http://localhost:3333/api/v1/trades/time-range?start_timestamp=1704067200000&end_timestamp=1704153600000&pool_id=1"

# 使用 ISO 字符串（也支持）
curl "http://localhost:3333/api/v1/trades/time-range?start_time=2024-01-01T00:00:00Z&end_time=2024-01-02T00:00:00Z&pool_id=1"
```

**前端示例 (JavaScript)**:

```javascript
// 获取最近24小时的数据
const endTime = Date.now()
const startTime = endTime - 24 * 60 * 60 * 1000

fetch(
  `/api/v1/trades/kline?pool_id=1&interval=1h&start_timestamp=${startTime}&end_timestamp=${endTime}`
)
  .then((res) => res.json())
  .then((data) => console.log(data))
```

### K线数据

K线数据通过 `/api/v1/trades/kline` 端点提供，支持多种时间周期。

## 高级功能

### 持久化状态

扫描器状态保存在 `scanner_states` 表中，包括:

- 最后处理的区块号
- 运行状态
- 处理统计
- 错误信息

重启扫描器时会自动从上次中断的位置继续。

### 归档节点支持

系统支持两种 RPC 配置:

- **普通 RPC**: 用于查询最近的区块（快速但历史有限）
- **归档 RPC**: 用于查询历史区块（完整历史但较慢）

扫描器会根据区块年龄自动选择合适的 RPC:

- 最近 128 个区块: 使用普通 RPC
- 更早的区块: 使用归档 RPC（如果配置）

配置归档节点:

```env
BSC_ARCHIVE_RPC_URL=https://your-archive-node-url
SCANNER_ARCHIVE_THRESHOLD=128
```

推荐的归档节点服务:

- [QuickNode](https://www.quicknode.com/)
- [Alchemy](https://www.alchemy.com/)
- [Ankr](https://www.ankr.com/)

### 性能调优

扫描器提供多个配置参数用于性能优化:

**批处理大小** (`SCANNER_CHUNK_SIZE`)

- 默认值: 1000 区块
- 说明: 每次从 RPC 节点获取的区块范围
- 调优建议:
  - 免费 RPC: 100-500（避免速率限制）
  - 付费 RPC: 1000-2000（更高吞吐量）
  - 归档节点: 500-1000（历史数据查询较慢）

**轮询间隔** (`SCANNER_POLL_INTERVAL`)

- 默认值: 5000ms
- 说明: 检查新区块的时间间隔
- 调优建议:
  - BSC 出块时间 ~3s，建议 3000-5000ms
  - 降低延迟: 2000-3000ms（更频繁检查）
  - 节省资源: 10000ms（降低 RPC 压力）

**区块确认数** (`SCANNER_BLOCK_CONFIRMATIONS`)

- 默认值: 12
- 说明: 等待的区块确认数，防止分叉
- 调优建议:
  - 高安全: 20-30 确认（约 1 分钟）
  - 平衡: 12 确认（约 36 秒）
  - 快速: 6 确认（约 18 秒，风险较高）

### 错误处理

扫描器包含自动错误恢复机制:

- **自动重连**: RPC 连接失败时自动重连（最多 10 次）
- **指数退避**: 重连延迟采用指数退避策略
- **区块确认**: 等待配置的区块确认数以避免分叉
- **状态持久化**: 错误信息和时间戳保存到数据库
- **批处理**: 分批处理区块，避免单次查询过大

## 日志

日志级别可在 `.env` 中配置:

```env
LOG_LEVEL=info  # 可选: fatal, error, warn, info, debug, trace
```

## 性能优化建议

### RPC 提供商选择

**免费 RPC 节点**:

- BSC 官方: `https://bsc-dataseed1.binance.org`
- 限制: 速率限制严格，建议 `SCANNER_CHUNK_SIZE=100-200`
- 适用: 测试和小规模使用

**付费 RPC 节点**:

- QuickNode, Alchemy, Ankr 等
- 优势: 更高速率限制，更稳定
- 推荐配置: `SCANNER_CHUNK_SIZE=1000-2000`

**归档节点配置**:

```env
# 普通节点处理最近区块
BSC_RPC_URL=https://bsc-dataseed1.binance.org

# 归档节点处理历史区块（可选）
BSC_ARCHIVE_RPC_URL=https://your-archive-node-url
SCANNER_ARCHIVE_THRESHOLD=128

# 归档节点通常较慢，建议较小的 chunk size
SCANNER_CHUNK_SIZE=500
```

### 常见场景配置

**快速追赶历史数据**:

```env
SCANNER_CHUNK_SIZE=2000
SCANNER_POLL_INTERVAL=1000
SCANNER_BLOCK_CONFIRMATIONS=6
```

**稳定生产环境**:

```env
SCANNER_CHUNK_SIZE=1000
SCANNER_POLL_INTERVAL=5000
SCANNER_BLOCK_CONFIRMATIONS=12
```

**免费 RPC 节点**:

```env
SCANNER_CHUNK_SIZE=100
SCANNER_POLL_INTERVAL=10000
SCANNER_BLOCK_CONFIRMATIONS=12
```

## 开发

### 项目结构

```
├── app/
│   ├── models/          # 数据库模型
│   │   ├── pool.ts
│   │   └── trade.ts
│   ├── services/        # 业务逻辑
│   │   └── blockchain_scanner_service.ts
│   └── contracts/       # 智能合约 ABI
│       ├── bonding_curve_abi.ts
│       └── create_pool_abi.ts
├── commands/            # CLI 命令
│   └── scan_blockchain.ts
├── database/
│   └── migrations/      # 数据库迁移
└── config/              # 配置文件
```

### 添加新的链

1. 在 `.env` 中添加配置
2. 在 `blockchain_scanner_service.ts` 中添加工厂函数
3. 在 `scan_blockchain.ts` 命令中添加 case

## License

UNLICENSED
