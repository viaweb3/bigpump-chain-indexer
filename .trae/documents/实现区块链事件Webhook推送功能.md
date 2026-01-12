# 实现独立的区块链事件Webhook推送服务

## 1. 需求分析

- 基于数据库的数据和新数据状态来实现事件推送
- 作为独立的程序运行，不依赖于blockchain_scanner_service.ts
- 支持推送pool和trade事件到外部webhook接口
- 确保事件推送的可靠性和及时性

## 2. 实现方案

### 2.1 设计思路

- 创建独立的WebhookSender服务，定期检查数据库中的新事件
- 为Pool和Trade模型添加`webhook_sent`字段，用于跟踪已推送的事件
- 支持配置推送频率、重试机制、超时时间等
- 实现详细的日志记录和错误处理

### 2.2 核心组件

#### 2.2.1 WebhookSenderService

- 独立的服务类，负责定期检查数据库中的新事件
- 实现事件推送逻辑，包括HTTP请求发送、重试机制等
- 支持配置多个webhook URL
- 添加详细的日志记录

#### 2.2.2 数据库模型扩展

- 为Pool和Trade模型添加`webhook_sent`布尔字段，用于跟踪事件是否已推送
- 默认为false，推送成功后更新为true

#### 2.2.3 配置支持

- 在`.env.example`中添加webhook相关配置项
- 支持配置推送频率、重试次数、重试间隔、超时时间等
- 支持配置多个webhook URL

#### 2.2.4 独立的命令脚本

- 创建独立的命令脚本，放在commands目录中
- 用于启动WebhookSender服务
- 支持使用PM2进行进程管理

## 3. 技术细节

### 3.1 WebhookSenderService设计

- 使用Node.js内置的`fetch` API发送HTTP请求
- 支持配置请求超时、重试次数、重试间隔
- 支持发送JSON格式的事件数据
- 添加详细的日志记录，包括请求状态、响应时间等
- 使用定期轮询的方式检查数据库中的新事件

### 3.2 事件跟踪机制

- 为Pool和Trade模型添加`webhook_sent`布尔字段，默认为false
- 每次检查时，只处理`webhook_sent`为false的事件
- 推送成功后，将`webhook_sent`更新为true
- 支持重试机制，避免因临时网络问题导致事件丢失

### 3.3 事件数据格式

- Pool事件：包含完整的pool信息，如poolId、creator、tokenAddress等
- Trade事件：包含完整的交易信息，如trader、tokenAddress、quoteAmount等
- 事件数据格式与数据库模型保持一致

### 3.4 错误处理

- Webhook调用失败时记录详细错误信息
- 支持配置重试机制，避免因临时网络问题导致事件丢失
- 重试失败后记录错误，不影响后续事件推送

## 4. 实现步骤

1. **创建WebhookSenderService**
   - 创建`app/services/webhook_sender_service.ts`文件
   - 实现WebhookSenderService类，包括事件检查、推送逻辑、重试机制等

2. **扩展数据库模型**
   - 为Pool和Trade模型添加`webhook_sent`布尔字段
   - 创建数据库迁移文件，更新现有表结构

3. **创建命令脚本**
   - 创建`commands/send_webhooks.ts`文件，用于启动WebhookSender服务
   - 支持使用AdonisJS的命令行框架

4. **添加配置支持**
   - 在`.env.example`中添加webhook相关配置项
   - 支持配置推送频率、重试次数、重试间隔、超时时间等
   - 支持配置多个webhook URL

5. **测试和验证**
   - 测试事件推送的完整性和及时性
   - 测试错误处理和重试机制
   - 确保独立运行的稳定性

## 5. 预期结果

- WebhookSender服务独立运行，定期检查数据库中的新事件
- 当有新的pool事件时，webhook服务会收到包含完整pool信息的POST请求
- 当有新的trade事件时，webhook服务会收到包含完整trade信息的POST请求
- Webhook调用失败时会自动重试，重试失败后记录错误日志
- 支持配置多个webhook URL，实现事件的多端推送
- 服务稳定可靠，不影响区块链扫描服务的运行

## 6. 风险评估

- **性能风险**：定期查询数据库可能会影响数据库性能。解决方案：合理设置查询频率，使用索引优化查询
- **可靠性风险**：webhook调用失败可能导致事件丢失。解决方案：实现可靠的事件跟踪机制和重试机制
- **一致性风险**：数据库和webhook服务之间可能出现数据不一致。解决方案：使用事务或最终一致性机制

## 7. 优势

- **分离关注点**：区块链扫描服务和webhook推送服务相互独立，便于维护和扩展
- **提高可靠性**：独立的服务设计避免了单点故障，提高了系统的可靠性
- **灵活配置**：支持配置多个webhook URL，实现事件的多端推送
- **易于扩展**：可以方便地添加新的事件类型和推送逻辑

## 8. 后续优化建议

- 实现基于事件驱动的推送机制，替代定期轮询
- 添加webhook签名验证，提高安全性
- 实现事件推送的监控和告警机制
- 支持推送历史记录查询和管理
