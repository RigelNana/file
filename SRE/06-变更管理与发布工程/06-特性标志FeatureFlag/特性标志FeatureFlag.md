# 特性标志 Feature Flag 八股文

---

## 一、Feature Flag 基础

### 1. 什么是 Feature Flag？有哪些类型？

**答：**

```
Feature Flag = 运行时动态控制功能开关

核心理念：部署 ≠ 发布
  代码可以部署到生产但不对用户开放
  通过开关控制功能何时、对谁可见

四种类型：
┌─────────────┬──────────────┬────────────┬──────────┐
│ 类型         │ 生命周期      │ 使用者      │ 示例      │
├─────────────┼──────────────┼────────────┼──────────┤
│ Release      │ 短期(天-周)   │ 工程团队    │ 新功能上线 │
│ Experiment   │ 中期(周-月)   │ 产品/数据   │ A/B测试   │
│ Ops          │ 长期         │ SRE/运维    │ 降级开关   │
│ Permission   │ 永久         │ 业务       │ 付费功能   │
└─────────────┴──────────────┴────────────┴──────────┘

生命周期管理：
  Release Flag:  上线完成后必须清理
  Experiment:    实验结束后清理
  Ops Flag:      长期保留，定期 Review
  Permission:    业务需要时一直保留
```

### 2. Feature Flag 的架构设计？

**答：**

```
典型架构：

┌────────┐     ┌───────────────┐     ┌──────────┐
│ 管理后台│ ──→ │ Flag 管理服务  │ ──→ │ 数据存储  │
└────────┘     └───────────────┘     └──────────┘
                       │
                       ▼
              ┌────────────────┐
              │ Flag 分发服务   │
              │ (推送/轮询)     │
              └────────────────┘
                   │       │
          ┌────────┘       └────────┐
          ▼                         ▼
   ┌──────────────┐         ┌──────────────┐
   │ 应用 SDK     │         │ 应用 SDK     │
   │ (本地缓存)   │         │ (本地缓存)   │
   └──────────────┘         └──────────────┘

关键设计：
  1. SDK 本地缓存，服务不可用时用缓存
  2. 默认值策略：服务不可用时的安全默认值
  3. 变更审计：谁在什么时候改了什么 Flag
  4. 评估性能：微秒级，不引入延迟
```

### 3. 常见的 Feature Flag 工具对比？

**答：**

| 工具 | 类型 | 特点 | 适用场景 |
|------|------|------|---------|
| LaunchDarkly | SaaS | 功能最全，SDK 丰富 | 企业级 |
| Unleash | 开源 | 战略简单，自托管 | 中小团队 |
| Flagsmith | 开源/SaaS | Feature + Remote Config | 灵活需求 |
| GrowthBook | 开源 | 实验优先，统计引擎 | A/B 测试 |
| OpenFeature | 标准 | 厂商中立 API 规范 | 避免锁定 |

---

## 二、Feature Flag 与 SRE

### 4. Feature Flag 在 SRE 运维中有哪些应用？

**答：**

```
SRE 视角的 Feature Flag 用法：

1. 优雅降级开关
   if !flag("enable_recommendations"):
       return default_recommendations
   → 高负载时关闭推荐服务

2. 熔断器开关
   if flag("circuit_break_payment_v2"):
       return legacy_payment_flow()
   → 新支付出问题时切回旧版

3. 流量控制
   if flag("rate_limit_search", rate=100):
       return rate_limited_response()
   → 动态调整限流

4. 数据库切换
   if flag("use_new_db_cluster"):
       db = new_cluster
   → 数据库迁移时灰度切换

5. 事件响应
   if flag("emergency_readonly_mode"):
       reject_writes()
   → 紧急情况下快速进入只读模式
```

### 5. Feature Flag 的风险和治理？

**答：**

```
常见风险：

1. 技术债务
   - Flag 越来越多，代码充满条件分支
   - 过期 Flag 无人清理
   - 解决：设定过期日期 + 自动告警

2. 测试复杂度爆炸
   - N 个 Flag → 2^N 种组合
   - 解决：限制同时活跃 Flag 数量
   - 只测试合理的 Flag 组合

3. 配置错误
   - 错误打开/关闭 Flag 导致故障
   - 解决：变更审批 + 灰度生效

治理实践：
┌──────────────────────────────────────┐
│ 1. Flag 必须有 Owner 和过期日期       │
│ 2. 超过过期日期自动创建清理 Ticket    │
│ 3. 活跃 Flag 数量设定上限（如 50）    │
│ 4. 代码 Review 检查 Flag 使用规范    │
│ 5. 定期 Flag 审计（月度）            │
│ 6. Flag 变更必须有审计日志           │
└──────────────────────────────────────┘
```

---

## 三、实现与面试

### 6. 如何用 OpenFeature 实现厂商中立的 Feature Flag？

**答：**

```go
// Go SDK 示例
package main

import (
    "context"
    "github.com/open-feature/go-sdk/openfeature"
    flagd "github.com/open-feature/go-sdk-contrib/providers/flagd/pkg"
)

func main() {
    // 设置 Provider（可随时切换）
    provider := flagd.NewProvider()
    openfeature.SetProvider(provider)

    client := openfeature.NewClient("payment-service")

    // 评估 Flag
    ctx := context.Background()
    evalCtx := openfeature.NewEvaluationContext(
        "user-123",
        map[string]interface{}{
            "region": "us-east",
            "plan":   "premium",
        },
    )

    enabled, _ := client.BooleanValue(
        ctx,
        "new-checkout-flow",
        false, // 默认值
        evalCtx,
    )

    if enabled {
        newCheckoutFlow()
    } else {
        legacyCheckoutFlow()
    }
}
```

### 7. 面试题：Feature Flag 与金丝雀发布的关系？

**答：**

```
Feature Flag vs 金丝雀发布：

金丝雀发布：
  - 基础设施层面控制
  - 按 Pod/实例分流
  - 适合验证性能和稳定性
  - 粒度：百分比流量

Feature Flag：
  - 应用层面控制
  - 按用户/属性分流
  - 适合验证功能和业务
  - 粒度：用户级别

最佳实践 = 两者结合：
  1. 金丝雀发布确保新代码不崩溃
  2. Feature Flag 控制新功能的开放
  3. 分离「部署」和「发布」
  
  发布流程：
    代码合并 → 金丝雀部署（验证稳定性）
    → 全量部署 → Feature Flag 灰度开放
    → 观察业务指标 → 全量开放
```
