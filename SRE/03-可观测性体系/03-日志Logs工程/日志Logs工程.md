# 日志 Logs 工程八股文

---

## 一、日志工程基础

### 1. 结构化日志和非结构化日志有什么区别？

**答：**

```
非结构化日志：
2024-01-15 10:30:00 ERROR PaymentService - Payment failed for order ORD-001, timeout after 30s

结构化日志（JSON）：
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "ERROR",
  "service": "payment-service",
  "message": "Payment failed",
  "order_id": "ORD-001",
  "error": "timeout",
  "duration_ms": 30000,
  "trace_id": "abc123"
}
```

| 对比 | 非结构化 | 结构化 |
|------|---------|--------|
| 可读性 | 人类友好 | 需要工具 |
| 搜索 | 正则匹配 | 精确字段查询 |
| 分析 | 困难 | 聚合/统计容易 |
| 关联 | 手动 | 自动（trace_id） |
| **推荐** | 仅开发调试 | **✅ 生产环境** |

### 2. 日志应该记录什么？不应该记录什么？

**答：**

| ✅ 应该记录 | ❌ 不应该记录 |
|------------|-------------|
| 请求入口和出口 | 密码、Token、密钥 |
| 错误和异常堆栈 | 完整信用卡号 |
| 关键业务操作 | 敏感个人信息（需脱敏） |
| 外部调用结果 | 循环内每次迭代 |
| trace_id/span_id | 大量二进制数据 |
| 状态变更 | 正常流程的每一步 |

### 3. 日志级别在生产环境中如何配置？

**答：**

```
生产环境推荐配置：

应用日志级别：INFO
  - TRACE/DEBUG：关闭（仅排查时临时开启）
  - INFO：记录关键操作（请求入口、业务事件）
  - WARN：记录异常但不影响功能的情况
  - ERROR：记录明确的错误
  - FATAL：记录导致服务终止的错误

动态日志级别：
  支持不重启修改级别 → 排查时临时开 DEBUG
  通过 HTTP 接口或配置中心动态调整
```

---

## 二、日志架构设计

### 4. 经典的日志架构有哪些？

**答：**

**ELK/EFK 架构**：

```
应用 → Filebeat/Fluentd → Kafka(缓冲) → Logstash → Elasticsearch → Kibana
                                                          │
                                                     索引生命周期管理
                                                     (ILM: hot→warm→cold→delete)
```

**Loki 架构（轻量级）**：

```
应用 → Promtail → Loki → Grafana
                    │
              只索引标签
              原文压缩存储
              成本远低于 ES
```

| 对比 | ELK | Loki |
|------|-----|------|
| 全文索引 | ✅ | ❌（只索引标签） |
| 存储成本 | 高 | 低（10x 差异） |
| 查询能力 | 强（全文搜索） | 中（标签+正则） |
| 运维复杂度 | 高 | 低 |
| 适用规模 | 大规模 | 中小规模 |

### 5. 日志采集的几种方式及其优缺点？

**答：**

| 方式 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **Sidecar** | 每个 Pod 一个日志采集容器 | 隔离好、配置灵活 | 资源开销大 |
| **DaemonSet** | 每个 Node 一个采集 Agent | 资源效率高 | 配置统一，灵活性低 |
| **直接推送** | 应用直接写入日志系统 | 最简单 | 应用和日志系统耦合 |
| **文件采集** | 写入文件后由 Agent 采集 | 解耦、可靠 | 需要管理文件轮转 |

---

## 三、日志最佳实践

### 6. 如何实现日志与 Metrics、Traces 的关联？

**答：**

```
关联核心：trace_id

1. 请求入口生成 trace_id
   trace_id = "abc-123-def-456"

2. trace_id 传播到所有下游服务
   HTTP Header: X-Trace-Id: abc-123-def-456

3. 每条日志记录 trace_id
   {"trace_id": "abc-123-def-456", "message": "..."}

4. Metrics 使用 Exemplar 关联
   http_request_duration_seconds{...} = 5.2
   # Exemplar: trace_id=abc-123-def-456

使用场景：
  Grafana Metrics 图表 → 点击异常点
  → 跳转到 trace_id 对应的 Trace 视图
  → 点击某个 Span → 跳转到对应的日志
```

### 7. 日志量太大怎么办？如何控制日志成本？

**答：**

| 策略 | 描述 | 效果 |
|------|------|------|
| **级别控制** | 生产环境不低于 INFO | 减少 50-80% 日志量 |
| **采样** | 正常请求日志 1% 采样 | 减少 90%+ |
| **保留策略** | 热数据 7 天 → 温数据 30 天 → 删除 | 降低存储成本 |
| **压缩** | 存储压缩（Loki 压缩率 ~10:1） | 存储减少 90% |
| **按需索引** | 只索引关键字段 | 减少索引开销 |

```yaml
# Elasticsearch ILM 策略示例
PUT _ilm/policy/logs-policy
{
  "policy": {
    "phases": {
      "hot":  { "actions": { "rollover": { "max_size": "50GB", "max_age": "1d" }}},
      "warm": { "min_age": "7d", "actions": { "shrink": { "number_of_shards": 1 }}},
      "cold": { "min_age": "30d", "actions": { "freeze": {} }},
      "delete": { "min_age": "90d", "actions": { "delete": {} }}
    }
  }
}
```

### 8. 日志脱敏怎么做？

**答：**

```python
# 常见脱敏规则
import re

def sanitize_log(message):
    # 手机号脱敏
    message = re.sub(r'1[3-9]\d{9}', '1****', message)
    # 邮箱脱敏  
    message = re.sub(r'(\w{2})\w+@', r'\1***@', message)
    # 身份证脱敏
    message = re.sub(r'(\d{6})\d{8}(\d{4})', r'\1********\2', message)
    # Token/密钥脱敏
    message = re.sub(r'(token|key|secret|password)[=:]\s*\S+', 
                     r'\1=***REDACTED***', message, flags=re.I)
    return message
```

---

## 四、面试高频题

### 9. 面试题：ELK 和 Loki 怎么选？

**答：**

```
选 ELK 当：
  - 需要全文搜索（如安全审计）
  - 日志分析是核心业务
  - 团队有 ES 运维经验
  - 预算充足

选 Loki 当：
  - 已有 Prometheus + Grafana 生态
  - 日志主要用于排查（非分析）
  - 成本敏感
  - 运维人力有限
```

### 10. 面试题：如何排查日志丢失问题？

**答：**

```
日志丢失排查清单：

1. 应用层
   - 日志是否正确输出？（检查日志级别配置）
   - 是否有缓冲区溢出丢弃？

2. 采集层
   - Agent 是否正常运行？
   - 是否有采集延迟或积压？
   - 文件轮转是否导致丢失？

3. 传输层
   - Kafka 是否有积压？
   - 网络是否有丢包？

4. 存储层
   - ES 集群是否正常？写入是否有拒绝？
   - 索引是否达到分片限制？

5. 查询层
   - 时间范围是否正确？
   - 查询条件是否太严格？
```
