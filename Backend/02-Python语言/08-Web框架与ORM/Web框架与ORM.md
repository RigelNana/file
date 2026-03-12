# Web框架与ORM

---

## 1. Flask的核心概念和工作原理？

**回答：**

Flask 是一个轻量级 WSGI Web 框架，核心只有路由和请求处理，其他功能通过扩展实现。

```python
from flask import Flask, request, jsonify, g

app = Flask(__name__)

# 路由和视图函数
@app.route('/api/users', methods=['GET'])
def get_users():
    page = request.args.get('page', 1, type=int)
    users = User.query.paginate(page=page, per_page=20)
    return jsonify([u.to_dict() for u in users.items])

@app.route('/api/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
    user = User.query.get_or_404(user_id)
    return jsonify(user.to_dict())

@app.route('/api/users', methods=['POST'])
def create_user():
    data = request.get_json()
    user = User(name=data['name'], email=data['email'])
    db.session.add(user)
    db.session.commit()
    return jsonify(user.to_dict()), 201

# 请求钩子
@app.before_request
def before_request():
    g.start_time = time.time()

@app.after_request
def after_request(response):
    duration = time.time() - g.start_time
    response.headers['X-Response-Time'] = str(duration)
    return response

# 错误处理
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

# 蓝图（模块化）
from flask import Blueprint
api = Blueprint('api', __name__, url_prefix='/api')

@api.route('/health')
def health():
    return jsonify({'status': 'ok'})

app.register_blueprint(api)
```

```
┌──────── Flask 请求处理流程 ────────┐
│                                    │
│  Client Request                    │
│       ↓                            │
│  WSGI Server (Gunicorn等)          │
│       ↓                            │
│  Flask App                         │
│       ↓                            │
│  before_request 钩子               │
│       ↓                            │
│  URL路由匹配 → 视图函数             │
│       ↓                            │
│  after_request 钩子                │
│       ↓                            │
│  Response → Client                 │
└────────────────────────────────────┘
```

---

## 2. Django的MTV架构和核心组件？

**回答：**

Django 是全栈框架，遵循 **MTV**（Model-Template-View）架构，对应 MVC 中的 Model-View-Controller。

```
┌──────── Django MTV 架构 ────────┐
│                                  │
│  URL配置 (urls.py)               │
│       ↓                          │
│  View 视图 (views.py)            │
│  ├── 处理业务逻辑                │
│  ├── 调用 Model 操作数据         │
│  └── 返回 Template 渲染结果      │
│       ↓              ↓           │
│  Model 模型       Template 模板  │
│  (models.py)       (*.html)      │
│  ORM操作数据库     渲染页面        │
└──────────────────────────────────┘
```

```python
# models.py - 数据模型
from django.db import models

class Article(models.Model):
    title = models.CharField(max_length=200)
    content = models.TextField()
    author = models.ForeignKey('User', on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    tags = models.ManyToManyField('Tag')

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['created_at'])]

    def __str__(self):
        return self.title

# views.py - 视图（CBV类视图）
from django.views.generic import ListView, DetailView

class ArticleListView(ListView):
    model = Article
    template_name = 'articles/list.html'
    paginate_by = 20

# views.py - DRF API视图
from rest_framework import viewsets, serializers

class ArticleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Article
        fields = '__all__'

class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.all()
    serializer_class = ArticleSerializer

# urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register('articles', ArticleViewSet)

urlpatterns = [
    path('api/', include(router.urls)),
]
```

**Django 核心组件**：ORM、Admin、Auth、Forms、Middleware、Signals、Cache、Management Commands。

---

## 3. FastAPI的核心特性和优势？

**回答：**

FastAPI 是基于 Starlette 和 Pydantic 的现代异步 Web 框架，核心优势是**类型驱动 + 自动文档**。

```python
from fastapi import FastAPI, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional

app = FastAPI(title="My API", version="1.0.0")

# Pydantic 模型（自动验证和文档）
class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    email: str = Field(..., pattern=r'^[\w.]+@[\w.]+$')
    age: Optional[int] = Field(None, ge=0, le=150)

class UserResponse(BaseModel):
    id: int
    name: str
    email: str

    class Config:
        from_attributes = True  # 支持ORM模型转换

# 路由
@app.get("/users", response_model=list[UserResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
):
    return await User.find().skip(skip).limit(limit).to_list()

@app.post("/users", response_model=UserResponse, status_code=201)
async def create_user(user: UserCreate):
    db_user = User(**user.model_dump())
    await db_user.save()
    return db_user

# 依赖注入
async def get_current_user(token: str = Depends(oauth2_scheme)):
    user = await verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

@app.get("/me")
async def read_me(user: User = Depends(get_current_user)):
    return user

# 后台任务
from fastapi import BackgroundTasks

@app.post("/send-email")
async def send_email(bg: BackgroundTasks):
    bg.add_task(send_email_task, "user@example.com")
    return {"message": "Email queued"}
```

```
┌──────── FastAPI 优势 ────────┐
│                              │
│ ✅ 自动生成 OpenAPI 文档      │
│ ✅ 自动请求验证（Pydantic）   │
│ ✅ 原生异步支持               │
│ ✅ 依赖注入系统               │
│ ✅ 类型提示驱动               │
│ ✅ 高性能（与Go/Node.js接近） │
│ ✅ 学习曲线低                 │
└──────────────────────────────┘
```

---

## 4. WSGI和ASGI协议的区别？

**回答：**

```
┌──────── WSGI vs ASGI ────────┐
│                               │
│  WSGI (Web Server Gateway     │
│        Interface):             │
│  • PEP 3333                   │
│  • 同步协议                    │
│  • 一个请求一个线程             │
│  • Flask, Django (传统)       │
│  • Gunicorn, uWSGI            │
│                               │
│  ASGI (Asynchronous Server    │
│        Gateway Interface):     │
│  • 异步协议                    │
│  • 支持 WebSocket, HTTP/2     │
│  • 支持长连接                  │
│  • FastAPI, Django 3.0+       │
│  • Uvicorn, Daphne            │
└───────────────────────────────┘
```

```python
# WSGI 应用接口
def wsgi_app(environ, start_response):
    status = '200 OK'
    headers = [('Content-Type', 'text/plain')]
    start_response(status, headers)
    return [b'Hello, World!']

# ASGI 应用接口
async def asgi_app(scope, receive, send):
    if scope['type'] == 'http':
        await send({
            'type': 'http.response.start',
            'status': 200,
            'headers': [[b'content-type', b'text/plain']],
        })
        await send({
            'type': 'http.response.body',
            'body': b'Hello, World!',
        })
```

**部署建议**：
- WSGI 应用：`gunicorn -w 4 app:app`
- ASGI 应用：`uvicorn app:app --workers 4`

---

## 5. SQLAlchemy ORM的核心概念和使用？

**回答：**

SQLAlchemy 是 Python 最强大的 ORM，分为 **Core**（SQL 表达式）和 **ORM**（对象关系映射）两层。

```python
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey
from sqlalchemy.orm import (
    DeclarativeBase, Session, relationship,
    sessionmaker, Mapped, mapped_column
)

# 现代声明式（2.0风格）
class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    email: Mapped[str] = mapped_column(String(100), unique=True)

    # 关系
    posts: Mapped[list["Post"]] = relationship(back_populates="author")

class Post(Base):
    __tablename__ = 'posts'

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))

    author: Mapped["User"] = relationship(back_populates="posts")

# 引擎和会话
engine = create_engine("sqlite:///app.db", echo=True)
Base.metadata.create_all(engine)
SessionLocal = sessionmaker(bind=engine)

# CRUD 操作
with Session(engine) as session:
    # Create
    user = User(name="Alice", email="alice@example.com")
    session.add(user)
    session.commit()

    # Read
    user = session.query(User).filter_by(name="Alice").first()
    users = session.query(User).filter(User.age > 18).all()

    # 2.0风格查询
    from sqlalchemy import select
    stmt = select(User).where(User.name == "Alice")
    user = session.execute(stmt).scalar_one()

    # Update
    user.name = "Bob"
    session.commit()

    # Delete
    session.delete(user)
    session.commit()
```

---

## 6. Web中间件的作用和实现？

**回答：**

中间件是在请求和响应之间执行的处理层，用于横切关注点（日志、认证、CORS等）。

```python
# Flask 中间件（使用钩子）
@app.before_request
def auth_middleware():
    if request.path.startswith('/api/'):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Unauthorized'}), 401

# Django 中间件
class TimingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        import time
        start = time.time()
        response = self.get_response(request)
        duration = time.time() - start
        response['X-Response-Time'] = f"{duration:.4f}s"
        return response

# FastAPI 中间件
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        logger.info(f"Request: {request.method} {request.url}")
        response = await call_next(request)
        logger.info(f"Response: {response.status_code}")
        return response

app.add_middleware(LoggingMiddleware)

# CORS 中间件
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

```
┌──────── 中间件执行顺序 ────────┐
│                                │
│  Request → M1 → M2 → M3 → View │
│  Response ← M1 ← M2 ← M3 ←    │
│                                │
│  类似洋葱模型，请求从外到内，    │
│  响应从内到外                   │
└────────────────────────────────┘
```

---

## 7. RESTful API设计原则和最佳实践？

**回答：**

```
┌──────── RESTful 设计规范 ────────┐
│                                  │
│  资源命名:                        │
│  GET    /api/users       列表    │
│  GET    /api/users/123   详情    │
│  POST   /api/users       创建    │
│  PUT    /api/users/123   全量更新 │
│  PATCH  /api/users/123   部分更新 │
│  DELETE /api/users/123   删除    │
│                                  │
│  状态码:                          │
│  200 成功  201 已创建             │
│  204 无内容 301 永久重定向        │
│  400 请求错误 401 未认证          │
│  403 禁止  404 未找到             │
│  409 冲突  422 验证失败           │
│  500 服务器错误                   │
└──────────────────────────────────┘
```

```python
# 统一响应格式
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Generic, TypeVar, Optional

T = TypeVar('T')

class ResponseModel(BaseModel, Generic[T]):
    code: int = 200
    message: str = "success"
    data: Optional[T] = None

# 分页
@app.get("/api/users")
async def list_users(
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "created_at",
    order: str = "desc",
):
    total = await User.count()
    users = await User.find().skip((page-1)*page_size).limit(page_size)
    return {
        "data": users,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
        }
    }

# 版本控制
# /api/v1/users
# /api/v2/users

# 过滤、搜索、排序
# GET /api/users?status=active&search=alice&sort=-created_at
```

---

## 8. Django ORM和SQLAlchemy的对比？

**回答：**

```
┌──── Django ORM vs SQLAlchemy ────┐
│ 特性        │ Django ORM │ SQLAlchemy  │
├────────────┼───────────┼────────────┤
│ 学习曲线    │ 低         │ 中高        │
│ 灵活性      │ 中         │ 高          │
│ 查询能力    │ 中         │ 强          │
│ 迁移工具    │ 内置       │ Alembic     │
│ 异步支持    │ 有限       │ 2.0+完善    │
│ 多数据库    │ 支持       │ 支持更多    │
│ 独立使用    │ 依赖Django │ 独立使用    │
│ Raw SQL    │ 支持       │ 更灵活      │
│ 适用框架    │ Django     │ 任意框架    │
└────────────┴───────────┴────────────┘
```

```python
# Django ORM 查询
users = User.objects.filter(
    age__gte=18,
    name__startswith='A'
).select_related('profile').order_by('-created_at')[:10]

# 聚合
from django.db.models import Avg, Count, Q
User.objects.aggregate(avg_age=Avg('age'))
User.objects.annotate(post_count=Count('posts'))

# 复杂查询
User.objects.filter(Q(age__gt=18) | Q(is_vip=True))

# N+1 问题解决
User.objects.select_related('profile')      # ForeignKey
User.objects.prefetch_related('posts')       # ManyToMany/Reverse FK


# SQLAlchemy 等价查询
from sqlalchemy import select, func

stmt = (
    select(User)
    .where(User.age >= 18)
    .where(User.name.startswith('A'))
    .options(joinedload(User.profile))
    .order_by(User.created_at.desc())
    .limit(10)
)

# 聚合
session.query(func.avg(User.age)).scalar()

# N+1 解决
stmt = select(User).options(
    joinedload(User.profile),      # JOIN 加载
    subqueryload(User.posts)       # 子查询加载
)
```

---

## 9. Web安全常见问题和防护措施？

**回答：**

```python
# 1. SQL注入防护
# ❌ 危险
query = f"SELECT * FROM users WHERE name = '{user_input}'"

# ✅ 参数化查询
cursor.execute("SELECT * FROM users WHERE name = %s", (user_input,))
# ORM 自动处理参数化
User.objects.filter(name=user_input)

# 2. XSS防护
# 模板引擎默认转义HTML
# Django: {{ variable }} 自动转义
# Jinja2: {{ variable }} 自动转义
# API返回JSON，设置 Content-Type: application/json

# 3. CSRF防护
# Django 内置 CSRF middleware
# FastAPI: 使用 JWT 或 CORS 策略

# 4. 认证与授权
from fastapi.security import OAuth2PasswordBearer
from jose import jwt

SECRET_KEY = os.environ['SECRET_KEY']  # 从环境变量读取

def create_token(data: dict):
    return jwt.encode(data, SECRET_KEY, algorithm="HS256")

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload
    except jwt.JWTError:
        raise HTTPException(status_code=401)

# 5. 密码安全
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"])

hashed = pwd_context.hash("password123")
pwd_context.verify("password123", hashed)  # True

# 6. 速率限制
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)

@app.get("/api/data")
@limiter.limit("10/minute")
async def get_data():
    ...
```

```
┌──────── Web安全清单 ────────┐
│                              │
│ ✅ 参数化查询防SQL注入       │
│ ✅ 模板转义防XSS             │
│ ✅ CSRF Token防跨站请求      │
│ ✅ HTTPS加密传输              │
│ ✅ 密码bcrypt哈希存储         │
│ ✅ JWT/OAuth2认证             │
│ ✅ 速率限制防暴力破解         │
│ ✅ CORS策略限制源             │
│ ✅ 输入验证和清洗             │
│ ✅ 安全的HTTP头设置           │
└──────────────────────────────┘
```

---

## 10. Web框架与ORM面试速答？

**回答：**

```
Q: Flask和Django怎么选？
A: 小型API/微服务选Flask，全栈项目/Admin需求选Django，高性能异步API选FastAPI。

Q: WSGI是什么？
A: Web Server Gateway Interface，Python Web应用和Web服务器之间的标准接口（PEP 3333），同步协议。

Q: ASGI相比WSGI的优势？
A: 支持异步处理、WebSocket、HTTP/2和长连接。WSGI只支持同步请求-响应模式。

Q: ORM的N+1问题是什么？
A: 查询N条记录时，每条记录的关联数据各执行一次查询。解决：select_related/prefetch_related(Django)或joinedload(SQLAlchemy)。

Q: 什么是数据库迁移？
A: 将模型变更同步到数据库schema的过程。Django用makemigrations/migrate，SQLAlchemy用Alembic。

Q: RESTful API的核心原则？
A: 资源用URL表示、HTTP方法表达操作、无状态、统一接口、正确使用状态码。

Q: 什么是中间件？
A: 在请求和响应之间执行的处理层，用于日志、认证、CORS等横切关注点。

Q: FastAPI的依赖注入怎么工作？
A: 通过Depends()声明依赖，框架自动解析依赖链并注入。支持嵌套依赖和Scope管理。

Q: Gunicorn和Uvicorn的区别？
A: Gunicorn是WSGI服务器（同步），Uvicorn是ASGI服务器（异步）。可用gunicorn -k uvicorn.workers.UvicornWorker组合使用。

Q: 如何防止SQL注入？
A: 使用ORM或参数化查询，永远不要拼接SQL字符串。ORM框架自动处理参数化。
```
