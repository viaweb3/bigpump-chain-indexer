# PM2 部署指南

使用 PM2 管理 BigPump Chain Indexer 的生产环境部署。

## 安装 PM2

```bash
npm install -g pm2
```

## 配置说明

`ecosystem.config.js` 配置了两个应用：

### 1. bigpump-api

- **作用**: RESTful API 服务器
- **端口**: 3333
- **内存限制**: 1GB
- **日志**: `./logs/api-*.log`

### 2. bigpump-scanner-bsc

- **作用**: BSC 区块链扫描器
- **命令**: `node ace scan:blockchain --chain=bsc`
- **内存限制**: 512MB
- **重启策略**: 最多重启10次，每次延迟5秒
- **最小运行时间**: 10秒
- **日志**: `./logs/scanner-bsc-*.log`

## 使用方法

### 启动所有服务

```bash
# 首先构建项目
npm run build

# 启动所有服务
pm2 start ecosystem.config.js
```

### 启动单个服务

```bash
# 只启动 API
pm2 start ecosystem.config.js --only bigpump-api

# 只启动扫描器
pm2 start ecosystem.config.js --only bigpump-scanner-bsc
```

### 查看状态

```bash
# 查看所有进程
pm2 list

# 查看详细信息
pm2 show bigpump-scanner-bsc
pm2 show bigpump-api
```

### 查看日志

```bash
# 实时查看所有日志
pm2 logs

# 查看特定服务的日志
pm2 logs bigpump-scanner-bsc
pm2 logs bigpump-api

# 查看历史日志
pm2 logs --lines 100

# 清空日志
pm2 flush
```

### 监控

```bash
# 实时监控（CPU、内存）
pm2 monit

# Web 面板（需要 PM2 Plus）
pm2 plus
```

### 重启服务

```bash
# 重启所有
pm2 restart all

# 重启特定服务
pm2 restart bigpump-scanner-bsc

# 优雅重启（0秒停机）
pm2 reload all
```

### 停止服务

```bash
# 停止所有
pm2 stop all

# 停止特定服务
pm2 stop bigpump-scanner-bsc

# 删除进程
pm2 delete bigpump-scanner-bsc
pm2 delete all
```

### 更新应用

```bash
# 拉取最新代码
git pull

# 安装依赖
npm install

# 重新构建
npm run build

# 优雅重启
pm2 reload ecosystem.config.js
```

## 开机自启动

### 配置自启动

```bash
# 保存当前进程列表
pm2 save

# 生成启动脚本
pm2 startup

# 执行上一步输出的命令（需要 sudo）
# 例如：sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u your-user --hp /home/your-user
```

### 取消自启动

```bash
pm2 unstartup systemd
```

## 日志管理

### 日志轮转

安装 PM2 日志轮转模块：

```bash
pm2 install pm2-logrotate
```

配置日志轮转：

```bash
# 设置最大日志大小（默认 10MB）
pm2 set pm2-logrotate:max_size 10M

# 保留日志文件数量（默认 10）
pm2 set pm2-logrotate:retain 7

# 压缩旧日志
pm2 set pm2-logrotate:compress true

# 日志轮转间隔（默认每天）
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
```

### 查看日志文件

```bash
# 直接查看日志文件
tail -f logs/scanner-bsc-out.log
tail -f logs/scanner-bsc-error.log
tail -f logs/api-out.log
tail -f logs/api-error.log
```

## 监控告警

### CPU/内存告警

```bash
# 安装监控模块
pm2 install pm2-auto-pull

# 设置内存告警阈值（MB）
pm2 set pm2-auto-pull:max_memory 1024
```

### 集成监控服务

PM2 支持集成多种监控服务：

- **PM2 Plus**: PM2 官方监控服务
- **Keymetrics**: 高级监控和分析
- **自定义**: 通过 PM2 API 集成到自己的监控系统

## 性能优化

### 集群模式（仅 API）

如果 API 负载较高，可以使用集群模式：

```javascript
// ecosystem.config.js
{
  name: 'bigpump-api',
  script: './build/bin/server.js',
  instances: 'max', // 或者指定数字，如 4
  exec_mode: 'cluster',
  // ...其他配置
}
```

**注意**: 扫描器必须使用 `fork` 模式（单实例），避免重复扫描。

### 内存优化

如果遇到内存问题：

```javascript
// 调整内存限制
max_memory_restart: '256M', // 扫描器
max_memory_restart: '512M', // API
```

## 故障排查

### 服务无法启动

```bash
# 查看错误日志
pm2 logs bigpump-scanner-bsc --err --lines 50

# 查看进程详细信息
pm2 describe bigpump-scanner-bsc

# 手动运行测试
node ace scan:blockchain --chain=bsc
```

### 频繁重启

```bash
# 检查重启次数
pm2 list

# 查看错误日志
pm2 logs bigpump-scanner-bsc --err

# 增加最小运行时间
pm2 restart bigpump-scanner-bsc --min-uptime 30000
```

### 内存泄漏

```bash
# 实时监控内存
pm2 monit

# 设置自动重启
pm2 restart bigpump-scanner-bsc --max-memory-restart 300M
```

## 备份和恢复

### 备份进程配置

```bash
# 保存当前所有进程
pm2 save

# 导出进程列表
pm2 dump
```

### 恢复进程

```bash
# 恢复之前保存的进程
pm2 resurrect
```

## 最佳实践

1. **定期检查日志**: 使用 `pm2 logs` 监控运行状态
2. **监控内存使用**: 使用 `pm2 monit` 实时查看
3. **日志轮转**: 安装并配置 `pm2-logrotate`
4. **自动重启**: 配置合理的重启策略
5. **开机自启**: 生产环境必须配置自启动
6. **分离环境**: 开发和生产使用不同的配置文件
7. **数据库备份**: 定期备份 PostgreSQL 数据

## 参考资源

- [PM2 官方文档](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [PM2 集群模式](https://pm2.keymetrics.io/docs/usage/cluster-mode/)
- [PM2 日志管理](https://pm2.keymetrics.io/docs/usage/log-management/)
