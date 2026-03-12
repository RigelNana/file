# Python工程实践

---

## 1. Python项目的标准目录结构是怎样的？

**回答：**

```
┌──────── 推荐项目结构 ────────┐
│                              │
│  my_project/                 │
│  ├── src/                    │
│  │   └── my_package/         │
│  │       ├── __init__.py     │
│  │       ├── core/           │
│  │       │   ├── __init__.py │
│  │       │   └── models.py   │
│  │       ├── api/            │
│  │       │   ├── __init__.py │
│  │       │   └── routes.py   │
│  │       ├── utils/          │
│  │       │   └── helpers.py  │
│  │       └── config.py       │
│  ├── tests/                  │
│  │   ├── __init__.py         │
│  │   ├── conftest.py         │
│  │   ├── test_core.py        │
│  │   └── test_api.py         │
│  ├── docs/                   │
│  ├── scripts/                │
│  ├── pyproject.toml          │
│  ├── Makefile                │
│  ├── Dockerfile              │
│  ├── .gitignore              │
│  ├── .env.example            │
│  └── README.md               │
└──────────────────────────────┘
```

```toml
# pyproject.toml（PEP 621，推荐的项目配置）
[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "my-package"
version = "1.0.0"
description = "My awesome project"
requires-python = ">=3.10"
dependencies = [
    "fastapi>=0.100.0",
    "sqlalchemy>=2.0",
    "pydantic>=2.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0",
    "pytest-cov>=4.0",
    "mypy>=1.0",
    "ruff>=0.1.0",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-v --cov=src"

[tool.mypy]
strict = true

[tool.ruff]
line-length = 88
target-version = "py310"
```

**src layout vs flat layout**：推荐 src layout，避免测试时意外导入本地源码而非安装包。

---

## 2. 虚拟环境管理和依赖管理工具对比？

**回答：**

```
┌──────── 依赖管理工具对比 ────────┐
│ 工具     │ 特点                   │
├─────────┼───────────────────────┤
│ venv     │ 内置，仅虚拟环境       │
│ pip      │ 内置包管理器           │
│ Poetry   │ 依赖管理+打包+发布     │
│ PDM      │ PEP标准，现代化        │
│ Pipenv   │ pip+virtualenv结合     │
│ uv       │ Rust实现，极快速       │
│ conda    │ 跨语言，科学计算首选   │
│ pixi     │ conda生态，现代化      │
└─────────┴───────────────────────┘
```

```bash
# venv + pip（基础方案）
python -m venv .venv
source .venv/bin/activate    # Linux/Mac
.venv\Scripts\activate       # Windows
pip install -r requirements.txt
pip freeze > requirements.txt

# Poetry（推荐方案）
pip install poetry
poetry new my-project
poetry add fastapi uvicorn
poetry add --group dev pytest mypy
poetry install
poetry shell                 # 进入虚拟环境
poetry lock                  # 锁定依赖版本
poetry export -f requirements.txt  # 导出

# uv（新一代，极速）
pip install uv
uv venv
uv pip install fastapi
uv pip compile requirements.in -o requirements.txt
uv pip sync requirements.txt

# PDM（PEP标准）
pip install pdm
pdm init
pdm add fastapi
pdm install
```

```python
# requirements.txt 最佳实践
# requirements.in（直接依赖）
fastapi>=0.100.0
sqlalchemy>=2.0
pydantic>=2.0

# requirements.txt（锁定版本，pip-compile生成）
# pip install pip-tools
# pip-compile requirements.in
fastapi==0.104.1
sqlalchemy==2.0.23
pydantic==2.5.2
# ... 所有间接依赖的精确版本
```

---

## 3. 类型提示(Type Hints)和静态类型检查的最佳实践？

**回答：**

```python
from typing import Optional, Protocol
from dataclasses import dataclass

# 1. 基本类型标注
def calculate_price(
    base: float,
    quantity: int,
    discount: float = 0.0,
) -> float:
    return base * quantity * (1 - discount)

# 2. 复杂类型（Python 3.10+ 语法）
def process(data: str | bytes) -> dict[str, list[int]]:
    ...

# 3. Protocol（结构化子类型）
class Serializable(Protocol):
    def to_dict(self) -> dict: ...
    def to_json(self) -> str: ...

def save(obj: Serializable) -> None:
    data = obj.to_dict()
    # 任何有 to_dict 和 to_json 方法的对象都可以

# 4. TypedDict（精确字典类型）
from typing import TypedDict

class UserDict(TypedDict):
    name: str
    age: int
    email: str | None

# 5. 泛型
from typing import TypeVar, Generic

T = TypeVar('T')

class Repository(Generic[T]):
    def get(self, id: int) -> T | None: ...
    def save(self, entity: T) -> T: ...

class UserRepo(Repository['User']):
    ...
```

```bash
# mypy 静态类型检查
pip install mypy
mypy src/ --strict

# pyproject.toml 配置
# [tool.mypy]
# strict = true
# ignore_missing_imports = true
# disallow_untyped_defs = true
```

```
┌──── 类型提示最佳实践 ────┐
│                          │
│ ✅ 公共API必须有类型标注  │
│ ✅ 使用严格模式mypy检查  │
│ ✅ Protocol代替ABC       │
│ ✅ 3.10+ 用 X | Y 语法  │
│ ❌ 不要过度标注私有方法   │
│ ❌ 不要用Any逃避检查     │
└──────────────────────────┘
```

---

## 4. pytest测试框架的核心特性和实践？

**回答：**

```python
import pytest
from unittest.mock import MagicMock, patch

# 基本测试
def test_add():
    assert 1 + 1 == 2

# fixture 依赖注入
@pytest.fixture
def db_session():
    session = create_test_session()
    yield session               # yield 之后是清理代码
    session.rollback()
    session.close()

@pytest.fixture(scope="module")  # 模块级共享
def app_client():
    app = create_app("testing")
    with app.test_client() as client:
        yield client

def test_create_user(db_session):
    user = User(name="Alice")
    db_session.add(user)
    db_session.commit()
    assert user.id is not None

# 参数化测试
@pytest.mark.parametrize("input,expected", [
    ("hello", 5),
    ("", 0),
    ("hi", 2),
])
def test_string_length(input, expected):
    assert len(input) == expected

# 异常测试
def test_divide_by_zero():
    with pytest.raises(ZeroDivisionError, match="division by zero"):
        1 / 0

# Mock
def test_api_call():
    with patch('mymodule.requests.get') as mock_get:
        mock_get.return_value = MagicMock(
            status_code=200,
            json=lambda: {"name": "Alice"}
        )
        result = fetch_user(1)
        assert result["name"] == "Alice"
        mock_get.assert_called_once()

# conftest.py（共享fixture）
# tests/conftest.py
@pytest.fixture(autouse=True)
def reset_db():
    """每个测试自动重置数据库"""
    setup_test_db()
    yield
    cleanup_test_db()
```

```bash
# 运行测试
pytest                           # 运行所有测试
pytest tests/test_api.py         # 运行单个文件
pytest -k "test_create"          # 按名称匹配
pytest -m "slow"                 # 按标记运行
pytest --cov=src --cov-report=html  # 覆盖率报告
pytest -x                       # 遇到失败立即停止
pytest -v                       # 详细输出
pytest --tb=short                # 简短错误信息
```

---

## 5. 代码质量工具和Linter配置？

**回答：**

```
┌──────── 代码质量工具链 ────────┐
│                                │
│  Ruff:   极速Linter+Formatter  │
│  (替代 flake8, isort, black)   │
│                                │
│  mypy:   静态类型检查           │
│  pylint: 深度代码检查           │
│  black:  代码格式化             │
│  isort:  import排序             │
│  bandit: 安全检查               │
└────────────────────────────────┘
```

```toml
# pyproject.toml 推荐配置

[tool.ruff]
line-length = 88
target-version = "py310"

[tool.ruff.lint]
select = [
    "E",    # pycodestyle
    "F",    # pyflakes
    "I",    # isort
    "N",    # pep8-naming
    "UP",   # pyupgrade
    "B",    # bugbear
    "SIM",  # simplify
    "S",    # bandit (安全)
]

[tool.ruff.format]
quote-style = "double"

[tool.mypy]
strict = true
python_version = "3.10"

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-v --strict-markers --cov=src"
```

```bash
# 使用 Ruff（推荐，Rust实现，极速）
pip install ruff
ruff check src/          # 检查
ruff check --fix src/    # 自动修复
ruff format src/         # 格式化

# pre-commit 自动检查
pip install pre-commit
```

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.1.6
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.7.0
    hooks:
      - id: mypy
```

---

## 6. Python CI/CD流水线的最佳实践？

**回答：**

```yaml
# .github/workflows/ci.yml (GitHub Actions)
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.10", "3.11", "3.12"]

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -e ".[dev]"

      - name: Lint
        run: |
          ruff check src/
          ruff format --check src/

      - name: Type check
        run: mypy src/

      - name: Test
        run: pytest --cov=src --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: coverage.xml
```

```makefile
# Makefile - 项目任务自动化
.PHONY: install test lint format clean

install:
	pip install -e ".[dev]"

test:
	pytest --cov=src --cov-report=html

lint:
	ruff check src/ tests/
	mypy src/

format:
	ruff format src/ tests/
	ruff check --fix src/ tests/

clean:
	rm -rf .pytest_cache .mypy_cache htmlcov dist build *.egg-info
	find . -type d -name __pycache__ -exec rm -rf {} +

docker-build:
	docker build -t myapp .

docker-run:
	docker run -p 8000:8000 myapp
```

---

## 7. Python包的打包和发布流程？

**回答：**

```toml
# pyproject.toml 打包配置
[build-system]
requires = ["setuptools>=68.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "my-package"
version = "1.0.0"
description = "A great Python package"
readme = "README.md"
license = {text = "MIT"}
requires-python = ">=3.10"
authors = [{name = "Author", email = "author@example.com"}]
classifiers = [
    "Programming Language :: Python :: 3",
    "License :: OSI Approved :: MIT License",
]
dependencies = ["requests>=2.28"]

[project.scripts]
my-cli = "my_package.cli:main"

[project.urls]
Homepage = "https://github.com/user/my-package"

[tool.setuptools.packages.find]
where = ["src"]
```

```bash
# 构建
pip install build
python -m build        # 生成 dist/my-package-1.0.0.tar.gz
                       #      dist/my_package-1.0.0-py3-none-any.whl

# 发布到 PyPI
pip install twine
twine check dist/*                          # 检查
twine upload --repository testpypi dist/*   # 测试发布
twine upload dist/*                          # 正式发布

# 使用 Poetry 发布（更简单）
poetry build
poetry publish
```

```
┌──────── 打包流程 ────────┐
│                          │
│ 1. 编写 pyproject.toml   │
│ 2. python -m build       │
│ 3. twine check dist/*    │
│ 4. twine upload dist/*   │
│                          │
│ 包格式:                   │
│ • sdist (.tar.gz) 源码包 │
│ • wheel (.whl) 二进制包  │
│   → 安装更快，无需编译    │
└──────────────────────────┘
```

---

## 8. Python项目的Docker化最佳实践？

**回答：**

```dockerfile
# Dockerfile - 多阶段构建
# 阶段1: 构建
FROM python:3.12-slim AS builder

WORKDIR /app

# 先复制依赖文件（利用缓存层）
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# 阶段2: 运行
FROM python:3.12-slim

# 安全: 不使用root
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# 从builder阶段复制安装的包
COPY --from=builder /install /usr/local

# 复制源码
COPY src/ src/

# 切换到非root用户
USER appuser

EXPOSE 8000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```
┌──── Docker 最佳实践 ────┐
│                          │
│ ✅ 多阶段构建减小镜像    │
│ ✅ 使用slim/alpine基础镜像│
│ ✅ 先COPY依赖文件利用缓存│
│ ✅ 非root用户运行        │
│ ✅ .dockerignore排除文件 │
│ ✅ 健康检查              │
│ ❌ 不要COPY .env文件     │
│ ❌ 不要安装不必要的包     │
└──────────────────────────┘
```

```
# .dockerignore
.git
.venv
__pycache__
*.pyc
.env
.mypy_cache
.pytest_cache
htmlcov
dist
build
```

---

## 9. 环境变量和配置管理的最佳实践？

**回答：**

```python
# 1. pydantic-settings 管理配置（推荐）
from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    # 从环境变量或.env文件读取
    app_name: str = "MyApp"
    debug: bool = False
    database_url: str = Field(..., alias="DATABASE_URL")
    redis_url: str = "redis://localhost:6379"
    secret_key: str = Field(..., min_length=32)
    allowed_hosts: list[str] = ["localhost"]

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }

# 使用
settings = Settings()  # 自动从环境变量和.env读取
print(settings.database_url)

# 2. 多环境配置
class DevSettings(Settings):
    debug: bool = True

class ProdSettings(Settings):
    debug: bool = False

def get_settings():
    env = os.getenv("ENV", "dev")
    if env == "prod":
        return ProdSettings()
    return DevSettings()
```

```bash
# .env 文件（不要提交到版本控制）
DATABASE_URL=postgresql://user:pass@localhost/mydb
SECRET_KEY=your-secret-key-at-least-32-chars-long
REDIS_URL=redis://localhost:6379
DEBUG=false
```

```
┌──── 配置管理原则 ────┐
│                      │
│ 1. 12-Factor App     │
│    配置存在环境变量中 │
│                      │
│ 2. 敏感信息不入库    │
│    .env + .gitignore │
│                      │
│ 3. 提供 .env.example │
│    记录需要的变量     │
│                      │
│ 4. 分环境配置        │
│    dev/staging/prod  │
│                      │
│ 5. 类型验证          │
│    pydantic-settings │
└──────────────────────┘
```

---

## 10. Python工程实践面试速答？

**回答：**

```
Q: Python项目应该用什么目录结构？
A: 推荐src layout：src/包名/下放源码，tests/放测试，pyproject.toml做配置。

Q: venv、Poetry、conda怎么选？
A: 通用项目用Poetry或uv，科学计算用conda/pixi，简单项目用venv+pip。

Q: pyproject.toml和setup.py的关系？
A: pyproject.toml是PEP 621标准，是setup.py的现代替代。新项目应使用pyproject.toml。

Q: 如何管理不同环境的配置？
A: 使用环境变量+pydantic-settings，遵循12-Factor原则。不同环境用不同的.env文件。

Q: pytest的fixture是什么？
A: 依赖注入机制，提供测试所需的资源（数据库连接、测试数据等），支持setup/teardown和作用域。

Q: 什么是代码覆盖率？多少合适？
A: 测试覆盖了多少比例的代码。一般目标80%+，关键业务逻辑应接近100%。使用pytest-cov。

Q: pre-commit的作用是什么？
A: Git提交前自动运行检查（lint、format、type check），防止不规范代码入库。

Q: Python包发布到哪里？
A: PyPI（Python Package Index）。用twine upload或poetry publish命令发布。

Q: Docker化Python应用要注意什么？
A: 多阶段构建、slim基础镜像、非root运行、先COPY依赖利用缓存层、.dockerignore排除文件。

Q: 推荐的Python Linter是什么？
A: Ruff（Rust实现，极速，集成了flake8/isort/black等功能）。配合mypy做类型检查。
```
