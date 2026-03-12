# RBAC与权限模型

---

## 1. 权限模型概述？

**回答：**

```
  ┌──────┬──────────────────────────────────────┐
  │ 模型  │ 说明                                 │
  ├──────┼──────────────────────────────────────┤
  │ ACL   │ 用户→资源 直接授权 简单但不灵活       │
  │ RBAC  │ 用户→角色→权限 最常用                 │
  │ ABAC  │ 基于属性(用户/资源/环境)动态判断      │
  │ PBAC  │ 基于策略(Policy) AWS IAM风格         │
  └──────┴──────────────────────────────────────┘

  RBAC最适合大多数业务系统
  ABAC适合需要细粒度动态权限的场景
  实际中常RBAC+ABAC混合使用
```

---

## 2. RBAC模型详解？

**回答：**

```
  RBAC = Role-Based Access Control

  核心关系：
  User ──→ Role ──→ Permission
  用户    角色      权限

  RBAC层级：
  RBAC0：基础 用户-角色-权限
  RBAC1：角色继承（管理员继承普通用户权限）
  RBAC2：约束（互斥角色/最大角色数）
  RBAC3：RBAC1 + RBAC2

  数据库设计：
  users           用户表
  roles           角色表
  permissions     权限表
  user_roles      用户-角色关联
  role_permissions 角色-权限关联

  CREATE TABLE permissions (
      id          BIGINT PRIMARY KEY,
      resource    VARCHAR(64),    -- 资源 eg: orders
      action      VARCHAR(16),    -- 操作 eg: read/write/delete
      description VARCHAR(128)
  );
  
  CREATE TABLE roles (
      id   BIGINT PRIMARY KEY,
      name VARCHAR(32) UNIQUE,   -- admin/editor/viewer
      parent_id BIGINT           -- 继承（RBAC1）
  );
  
  CREATE TABLE user_roles (
      user_id BIGINT,
      role_id BIGINT,
      PRIMARY KEY (user_id, role_id)
  );
  
  CREATE TABLE role_permissions (
      role_id       BIGINT,
      permission_id BIGINT,
      PRIMARY KEY (role_id, permission_id)
  );
```

---

## 3. Go RBAC实现？

**回答：**

```
权限检查中间件：
  func RequirePermission(resource, action string) func(http.Handler) http.Handler {
      return func(next http.Handler) http.Handler {
          return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
              userID := r.Context().Value("user_id").(int64)
              
              if !hasPermission(r.Context(), userID, resource, action) {
                  http.Error(w, "forbidden", 403)
                  return
              }
              next.ServeHTTP(w, r)
          })
      }
  }

  func hasPermission(ctx context.Context, userID int64, resource, action string) bool {
      // 先查缓存
      cacheKey := fmt.Sprintf("perm:%d:%s:%s", userID, resource, action)
      if cached, ok := permCache.Get(cacheKey); ok {
          return cached.(bool)
      }
      
      // 查数据库
      var count int
      db.QueryRowContext(ctx, `
          SELECT COUNT(*) FROM user_roles ur
          JOIN role_permissions rp ON ur.role_id = rp.role_id
          JOIN permissions p ON rp.permission_id = p.id
          WHERE ur.user_id = ? AND p.resource = ? AND p.action = ?
      `, userID, resource, action).Scan(&count)
      
      result := count > 0
      permCache.Set(cacheKey, result, 5*time.Minute)
      return result
  }

路由注册：
  mux.Handle("GET /api/orders", 
      RequirePermission("orders", "read")(orderListHandler))
  mux.Handle("DELETE /api/orders/{id}", 
      RequirePermission("orders", "delete")(orderDeleteHandler))
```

---

## 4. Casbin权限框架？

**回答：**

```
  Casbin = 通用权限框架 支持多种模型

  支持模型：ACL/RBAC/ABAC等
  Go/Java/Python/Node 多语言
  策略存储：文件/数据库/Redis

  RBAC模型定义（model.conf）：
  [request_definition]
  r = sub, obj, act
  
  [policy_definition]
  p = sub, obj, act
  
  [role_definition]
  g = _, _
  
  [policy_effect]
  e = some(where (p.eft == allow))
  
  [matchers]
  m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act

  策略规则（policy.csv）：
  p, admin, orders, read
  p, admin, orders, write
  p, editor, orders, read
  g, alice, admin          # alice是admin角色
  g, bob, editor           # bob是editor角色

Go使用Casbin：
  import "github.com/casbin/casbin/v2"
  
  e, _ := casbin.NewEnforcer("model.conf", "policy.csv")
  
  // 权限检查
  ok, _ := e.Enforce("alice", "orders", "write")  // true
  ok, _ = e.Enforce("bob", "orders", "write")    // false
  
  // 动态添加策略
  e.AddPolicy("bob", "orders", "write")
  
  // 中间件
  func CasbinMiddleware(e *casbin.Enforcer) func(http.Handler) http.Handler {
      return func(next http.Handler) http.Handler {
          return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
              user := getUserFromContext(r.Context())
              ok, _ := e.Enforce(user, r.URL.Path, r.Method)
              if !ok {
                  http.Error(w, "forbidden", 403)
                  return
              }
              next.ServeHTTP(w, r)
          })
      }
  }
```

---

## 5. ABAC基于属性的访问控制？

**回答：**

```
  ABAC = Attribute-Based Access Control

  决策依据：
  主体属性：用户角色/部门/级别
  资源属性：资源类型/创建者/敏感级别
  操作属性：读/写/删
  环境属性：时间/IP/设备

  规则示例：
  一级部门经理 在工作时间 可以查看 本部门员工薪资
  
  subject.role == "manager" &&
  subject.department == resource.department &&
  environment.time.hour >= 9 && environment.time.hour <= 18

  ABAC优势：
  灵活 不需预定义角色
  支持动态复杂规则
  适合细粒度权限

  Go ABAC简单实现：
  type Policy struct {
      Condition func(subject, resource, env map[string]interface{}) bool
      Effect    string // allow / deny
  }
  
  func Evaluate(policies []Policy, subject, resource, env map[string]interface{}) bool {
      for _, p := range policies {
          if p.Condition(subject, resource, env) {
              return p.Effect == "allow"
          }
      }
      return false // 默认拒绝
  }

  实际项目：RBAC为主 + ABAC补充细粒度
  eg: RBAC控制页面/菜单 ABAC控制数据行级权限
```

---

## 6. 数据权限？

**回答：**

```
  数据权限 = 控制用户能看到哪些数据行

  和功能权限区分：
  功能权限：能不能访问订单页面
  数据权限：能看到哪些订单（本人的/本部门的/全部）

  数据权限级别：
  ┌──────────┬──────────────────────────────┐
  │ 级别      │ 说明                         │
  ├──────────┼──────────────────────────────┤
  │ 全部      │ 管理员看所有数据             │
  │ 本部门    │ 只看本部门数据               │
  │ 部门+下级 │ 本部门及子部门               │
  │ 仅本人    │ 只看自己创建的数据           │
  │ 自定义    │ 指定部门/指定人               │
  └──────────┴──────────────────────────────┘

  实现方式：SQL条件拼接
  func BuildDataScope(query string, user *User) string {
      switch user.DataScope {
      case DataScopeAll:
          return query // 不加条件
      case DataScopeDept:
          return query + fmt.Sprintf(" AND dept_id = %d", user.DeptID)
      case DataScopeSelf:
          return query + fmt.Sprintf(" AND created_by = %d", user.ID)
      }
      return query
  }

  注意事项：
  数据权限在SQL层执行 不在应用层过滤
  防止绕过（直通API/批量导出也要检查）
  和功能权限结合使用
```

---

## 7. 菜单与按钮权限？

**回答：**

```
  前端权限 = 菜单可见性 + 按钮可用性
  后端权限 = API接口访问控制

  前端权限只做展示优化 真正安全靠后端

  权限数据结构：
  type Permission struct {
      ID       int64  
      Name     string   // 显示名称
      Code     string   // 权限标识 eg: system:user:add
      Type     int      // 1菜单 2按钮 3接口
      ParentID int64    // 父权限
      Path     string   // 前端路由 /system/user
      API      string   // 后端接口 POST /api/users
  }

  权限标识设计：
  system:user:list    → 用户列表(菜单)
  system:user:add     → 新增用户(按钮)
  system:user:edit    → 编辑用户(按钮)
  system:user:delete  → 删除用户(按钮)

  登录后返回权限列表：
  {
    "menus": [
      {"path": "/orders", "name": "订单管理", "icon": "order"},
      {"path": "/users", "name": "用户管理", "icon": "user"}
    ],
    "permissions": ["order:list", "order:create", "user:list"]
  }

  前端按钮权限：
  <button v-if="hasPermission('order:create')">新建订单</button>

  后端必须同步检查：
  mux.Handle("POST /api/orders",
      RequirePermission("order", "create")(handler))
```

---

## 8. 超级管理员与权限缓存？

**回答：**

```
  超级管理员处理：
  func hasPermission(ctx context.Context, userID int64, resource, action string) bool {
      user := getUserByID(ctx, userID)
      if user.IsSuperAdmin {
          return true // 超级管理员跳过权限检查
      }
      return checkPermission(ctx, userID, resource, action)
  }

  权限缓存策略：
  用户权限不常变 适合缓存

  1. 登录时加载权限到Redis
  func OnLogin(userID int64) {
      permissions := loadPermissionsFromDB(userID)
      data, _ := json.Marshal(permissions)
      rdb.Set(ctx, fmt.Sprintf("perms:%d", userID), data, 24*time.Hour)
  }

  2. 权限变更时清除缓存
  func OnPermissionChange(userID int64) {
      rdb.Del(ctx, fmt.Sprintf("perms:%d", userID))
  }

  3. 角色变更时批量清理
  func OnRoleChange(roleID int64) {
      // 查找该角色的所有用户
      userIDs := getUsersByRole(roleID)
      keys := make([]string, len(userIDs))
      for i, uid := range userIDs {
          keys[i] = fmt.Sprintf("perms:%d", uid)
      }
      rdb.Del(ctx, keys...)
  }

  缓存注意：
  权限变更后必须清缓存
  缓存过期时间不要太长（建议1-4h）
  敏感操作不走缓存 实时查DB
```

---

## 9. 多租户权限？

**回答：**

```
  多租户 = 一套系统服务多个组织/公司

  租户隔离级别：
  ┌──────────────┬──────────────────────────────┐
  │ 级别          │ 说明                         │
  ├──────────────┼──────────────────────────────┤
  │ 独立数据库    │ 每租户独立DB 隔离最强        │
  │ 共享DB独立Schema│ 中等隔离                   │
  │ 共享表(tenant_id)│ 最常用 性能好            │
  └──────────────┴──────────────────────────────┘

  共享表方案：
  所有表加 tenant_id 字段
  查询时自动注入 WHERE tenant_id = ?

  中间件自动注入租户：
  func TenantMiddleware(next http.Handler) http.Handler {
      return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
          // 从JWT或Header获取租户ID
          tenantID := r.Header.Get("X-Tenant-ID")
          if tenantID == "" {
              http.Error(w, "tenant required", 400)
              return
          }
          ctx := context.WithValue(r.Context(), "tenant_id", tenantID)
          next.ServeHTTP(w, r.WithContext(ctx))
      })
  }

  租户权限 = 租户隔离 + 租户内RBAC
  不同租户可以有不同的角色/权限配置
  租户管理员管理自己租户的用户和角色
```

---

## 10. 权限模型面试速答？

**回答：**

```
Q: RBAC是什么？
A: 用户→角色→权限 三级结构
   最常用的权限模型

Q: RBAC四个级别？
A: RBAC0基础 RBAC1角色继承
   RBAC2约束互斥 RBAC3=1+2

Q: ABAC是什么？
A: 基于属性(用户/资源/环境)动态判断
   比RBAC更灵活 适合细粒度

Q: 数据权限怎么实现？
A: SQL层面拼接条件 按部门/个人过滤
   不在应用层过滤 防绕过

Q: 功能权限和数据权限区别？
A: 功能权限=能不能访问(菜单/按钮/API)
   数据权限=能看哪些数据(行级过滤)

Q: 前端权限可靠吗？
A: 前端只做展示优化 不可靠
   真正安全必须后端API鉴权

Q: Casbin是什么？
A: 通用权限框架 支持ACL/RBAC/ABAC
   Go实现 策略可存DB/文件

Q: 权限怎么缓存？
A: Redis缓存用户权限列表
   权限变更时清缓存 定时过期
```
