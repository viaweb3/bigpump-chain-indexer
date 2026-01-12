# 快速启动指南

## 前置要求

- Node.js >= 18
- PostgreSQL >= 12 with TimescaleDB extension
- BSC RPC URL (免费或付费)

## 1. 安装依赖

```bash
npm install
```

## 2. 配置数据库

### 安装 TimescaleDB

**macOS (Homebrew)**:

```bash
brew install timescaledb
```

**Ubuntu/Debian**:

```bash
# 添加 TimescaleDB 仓库
sudo sh -c "echo 'deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -c -s) main' > /etc/apt/sources.list.d/timescaledb.list"
wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | sudo apt-key add -
sudo apt update
sudo apt install timescaledb-2-postgresql-14
```

**Docker (推荐用于开发)**:

```bash
docker run -d \
  --name timescaledb \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=root \
  -e POSTGRES_USER=root \
  -e POSTGRES_DB=bigpump_indexer \
  timescale/timescaledb:latest-pg14
```

### 创建数据库

```sql
CREATE DATABASE bigpump_indexer;
\c bigpump_indexer
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
```

## 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，填写必要的配置：

```env
# 数据库配置
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=root
DB_PASSWORD=root
DB_DATABASE=bigpump_indexer

# BSC RPC URL
BSC_RPC_URL=https://bsc-dataseed1.binance.org

# 合约地址（已预设）
CREATE_POOL_ADDRESS_BSC=0x0db4b0a49b52C01c0bC8CB0b22B78836e0Ff01Bc
BONDINGCURVE_ADDRESS_BSC=0xDA267FECC963F2594E9C37AaA5d6BdE04FEc8DCD

# 扫描器配置（可选，使用默认值即可）
SCANNER_START_BLOCK=0
SCANNER_CHUNK_SIZE=1000
SCANNER_POLL_INTERVAL=5000
```

生成 APP_KEY：

```bash
node ace generate:key
```

## 4. 运行数据库迁移

```bash
node ace migration:run
```

预期输出：

```
❯ migration:run

 ❯ create_pools_table
 ❯ create_trades_table
 ❯ create_setup_timescaledbs
 ❯ create_scanner_states

Completed in 89ms
```

## 5. 启动服务

### 方式一：同时启动（推荐用于开发）

在两个终端窗口中分别运行：

**终端 1 - API 服务器**:

```bash
npm run dev
```

**终端 2 - 区块链扫描器**:

```bash
node ace scan:blockchain
```

### 方式二：生产模式

```bash
# 构建
npm run build

# 启动 API 服务（后台）
npm start &

# 启动扫描器（后台）
node ace scan:blockchain &
```

## 6. 验证运行状态

### 检查 API

```bash
# 健康检查
curl http://localhost:3333

# 查看扫描器状态
curl http://localhost:3333/api/v1/scanner-states

# 查看池列表
curl http://localhost:3333/api/v1/pools?limit=5

# 查看交易列表
curl http://localhost:3333/api/v1/trades?limit=5
```

### 检查日志

扫描器会输出类似以下日志：

```
INFO  Starting blockchain scanner
INFO  Loaded scanner state from database lastProcessedBlock=12345678
INFO  Processing blocks 12345679 to 12346000
INFO  Processed 5 trades and 2 pools
```

## 7. 常见问题

### Q: 扫描器连接 RPC 超时

**问题**: `Error in scan loop { error: 'timeout' }`

**解决**:

1. 检查网络连接
2. 尝试更换 RPC URL
3. 降低 `SCANNER_CHUNK_SIZE` (例如设为 100)
4. 增加 `SCANNER_POLL_INTERVAL` (例如设为 10000)

### Q: 数据库连接失败

**问题**: `DB_HOST refused connection`

**解决**:

1. 确认 PostgreSQL 正在运行: `pg_isready`
2. 检查 `.env` 中的数据库配置
3. 确认数据库存在: `psql -l`
4. 检查 TimescaleDB 扩展: `\dx` (在 psql 中)

### Q: 速率限制错误

**问题**: `429 Too Many Requests`

**解决**:

```env
# 使用免费 RPC 时的配置
SCANNER_CHUNK_SIZE=100
SCANNER_POLL_INTERVAL=10000
```

或者使用付费 RPC 服务：

- QuickNode: https://www.quicknode.com/
- Alchemy: https://www.alchemy.com/
- Ankr: https://www.ankr.com/

### Q: 内存不足

**解决**:

```env
# 降低批处理大小
SCANNER_CHUNK_SIZE=500
```

## 8. 性能优化

根据你的 RPC 提供商调整配置：

### 免费公共 RPC

```env
BSC_RPC_URL=https://bsc-dataseed1.binance.org
SCANNER_CHUNK_SIZE=100
SCANNER_POLL_INTERVAL=10000
SCANNER_BLOCK_CONFIRMATIONS=12
```

### 付费 RPC (QuickNode/Alchemy)

```env
BSC_RPC_URL=https://your-paid-rpc-url
SCANNER_CHUNK_SIZE=2000
SCANNER_POLL_INTERVAL=3000
SCANNER_BLOCK_CONFIRMATIONS=12
```

### 带归档节点

```env
BSC_RPC_URL=https://regular-rpc-url
BSC_ARCHIVE_RPC_URL=https://archive-rpc-url
SCANNER_CHUNK_SIZE=1000
SCANNER_ARCHIVE_THRESHOLD=128
```

## 9. 监控和维护

### 查看扫描器状态

```bash
curl http://localhost:3333/api/v1/scanner-states | jq
```

### 查看统计信息

```bash
# 池统计
curl "http://localhost:3333/api/v1/pools/stats?chain_id=56" | jq

# 交易统计
curl "http://localhost:3333/api/v1/trades/stats?chain_id=56" | jq
```

### 检查数据库

```sql
-- 查看扫描进度
SELECT * FROM scanner_states;

-- 查看最近的池
SELECT * FROM pools ORDER BY block_timestamp DESC LIMIT 10;

-- 查看最近的交易
SELECT * FROM trades ORDER BY block_timestamp DESC LIMIT 10;
```

## 10. 停止服务

```bash
# 停止扫描器（Ctrl+C）
# 停止 API 服务（Ctrl+C）

# 或者如果在后台运行
pkill -f "scan:blockchain"
pkill -f "node.*server.js"
```

## 下一步

- 查看 [README.md](./README.md) 了解完整功能
- 查看 [API 文档](#api-端点) 了解所有端点
- 配置监控和告警
- 设置数据备份
