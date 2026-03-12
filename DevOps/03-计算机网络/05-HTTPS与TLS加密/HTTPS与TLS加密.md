# HTTPS 与 TLS 加密

---

## 1. HTTPS 的工作原理？与 HTTP 的区别？

**回答：**

### HTTPS = HTTP + TLS/SSL

```
HTTP:   应用层 (HTTP) → 传输层 (TCP) → ...
HTTPS:  应用层 (HTTP) → 安全层 (TLS) → 传输层 (TCP) → ...

HTTP 默认端口: 80
HTTPS 默认端口: 443
```

### 核心区别

| 特性 | HTTP | HTTPS |
|------|------|-------|
| 端口 | 80 | 443 |
| 加密 | 明文传输 | TLS 加密 |
| 认证 | 无 | 服务器证书验证 |
| 完整性 | 无（可被篡改） | MAC 校验（防篡改） |
| 性能 | 快 | 多 1-2 RTT 握手 |
| SEO | — | Google 加权 |

### 为什么需要 HTTPS？

```
HTTP 的三大安全隐患：
  1. 窃听（Eavesdropping）：数据明文传输，任何中间节点都能看到
  2. 篡改（Tampering）：运营商/中间人插入广告、修改内容
  3. 冒充（Impersonation）：无法验证服务器身份（钓鱼网站）

HTTPS 对应的三重保护：
  1. 机密性：TLS 加密 → 无法窃听
  2. 完整性：MAC 校验 → 无法篡改
  3. 身份认证：CA 证书 → 无法冒充
```

---

## 2. TLS 握手过程（TLS 1.2）？

**回答：**

### 完整握手流程

```
客户端                                        服务器
  |                                              |
  |  1. ClientHello                              |
  |─────────────────────────────────────────────>|
  |  · TLS 版本 (TLS 1.2)                        |
  |  · 客户端随机数 (Client Random)               |
  |  · 支持的加密套件列表                          |
  |  · 支持的压缩方法                              |
  |  · SNI (Server Name Indication)              |
  |                                              |
  |  2. ServerHello                              |
  |<─────────────────────────────────────────────|
  |  · 选择的 TLS 版本                            |
  |  · 服务器随机数 (Server Random)               |
  |  · 选择的加密套件                              |
  |                                              |
  |  3. Certificate                              |
  |<─────────────────────────────────────────────|
  |  · 服务器证书（含公钥）                        |
  |  · 证书链                                     |
  |                                              |
  |  4. ServerKeyExchange (如果是 DHE/ECDHE)     |
  |<─────────────────────────────────────────────|
  |  · DH 参数                                    |
  |                                              |
  |  5. ServerHelloDone                          |
  |<─────────────────────────────────────────────|
  |                                              |
  |  6. 客户端验证证书                             |
  |  · 验证 CA 签名链                              |
  |  · 检查证书有效期                               |
  |  · 检查域名匹配                                |
  |  · 检查吊销状态 (CRL/OCSP)                    |
  |                                              |
  |  7. ClientKeyExchange                        |
  |─────────────────────────────────────────────>|
  |  · Pre-Master Secret (用服务器公钥加密)        |
  |                                              |
  |  双方用 Client Random + Server Random +       |
  |  Pre-Master Secret 计算 Master Secret         |
  |  → 派生对称密钥                                |
  |                                              |
  |  8. ChangeCipherSpec                         |
  |─────────────────────────────────────────────>|
  |  · 通知切换到加密通信                           |
  |                                              |
  |  9. Finished (加密)                          |
  |─────────────────────────────────────────────>|
  |                                              |
  |  10. ChangeCipherSpec                        |
  |<─────────────────────────────────────────────|
  |  11. Finished (加密)                         |
  |<─────────────────────────────────────────────|
  |                                              |
  |  ======= 加密通信开始（2 RTT）=======         |
```

### 密钥计算

```
Master Secret = PRF(Pre-Master Secret, "master secret",
                    Client Random + Server Random)

从 Master Secret 派生：
  · 客户端写密钥 (Client Write Key)
  · 服务器写密钥 (Server Write Key)
  · 客户端写 MAC 密钥
  · 服务器写 MAC 密钥
  · 客户端写 IV
  · 服务器写 IV
```

---

## 3. TLS 1.3 相比 TLS 1.2 有什么改进？

**回答：**

### 核心改进

| 特性 | TLS 1.2 | TLS 1.3 |
|------|---------|---------|
| 握手 RTT | 2 RTT | 1 RTT (首次), 0 RTT (恢复) |
| 密钥交换 | RSA/DHE/ECDHE | 仅 ECDHE/DHE（禁用 RSA） |
| 对称加密 | AES-CBC/AES-GCM等 | 仅 AEAD (AES-GCM, ChaCha20) |
| 废弃算法 | 支持 RC4, 3DES 等 | 移除所有不安全算法 |
| 前向保密 | 可选 | 强制（因为只允许 DHE/ECDHE） |
| 0-RTT | 不支持 | 支持（恢复连接） |

### TLS 1.3 握手（1-RTT）

```
客户端                                  服务器
  |                                        |
  |  ClientHello + KeyShare               |
  |────────────────────────────────────── >|  客户端直接发送密钥参数
  |                                        |
  |  ServerHello + KeyShare               |
  |  + EncryptedExtensions                |
  |  + Certificate                        |
  |  + CertificateVerify                  |
  |  + Finished                           |
  |< ──────────────────────────────────── |  服务器一次返回所有信息
  |                                        |  （已加密！）
  |  Finished                             |
  |────────────────────────────────────── >|
  |                                        |
  |  ======= 1 RTT 完成握手 ========      |
```

### 0-RTT 恢复

```
客户端之前连接过 → 缓存了 PSK (Pre-Shared Key)

  ClientHello + KeyShare + PSK + 0-RTT数据
  ─────────────────────────────────────────→
  服务器用 PSK 立即解密，处理 0-RTT 数据

  注意：0-RTT 数据不具备前向保密，且可能被重放
  → 只适合幂等的 GET 请求
```

---

## 4. 对称加密和非对称加密？为什么 HTTPS 两者都用？

**回答：**

### 对比

| 特性 | 对称加密 | 非对称加密 |
|------|---------|-----------|
| 密钥 | 加解密用同一个密钥 | 公钥加密，私钥解密 |
| 速度 | 快（硬件加速） | 慢（100-1000 倍） |
| 密钥分发 | 困难（如何安全传递？） | 简单（公钥公开） |
| 典型算法 | AES, ChaCha20 | RSA, ECDSA, Ed25519 |
| 适用 | 大量数据加密 | 密钥交换、数字签名 |

### HTTPS 的混合加密

```
为什么两者都用？
  - 非对称加密解决密钥分发问题（但太慢，不能加密全部数据）
  - 对称加密解决高效传输问题（但密钥如何安全传递？）
  → 结合：用非对称加密交换对称密钥，用对称密钥加密数据

流程：
  1. TLS 握手：ECDHE 密钥交换 → 双方协商出对称密钥
     （非对称加密只用在这一步）
  2. 数据传输：用对称密钥 + AES-256-GCM 加密所有 HTTP 数据
     （高效！）
```

### 常见加密套件

```
TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
│    │      │        │     │    │
│    │      │        │     │    └─ 哈希算法（PRF）
│    │      │        │     └────── 认证加密模式
│    │      │        └──────────── 对称加密算法
│    │      └───────────────────── 认证算法（证书签名）
│    └──────────────────────────── 密钥交换算法
└───────────────────────────────── 协议

ECDHE: 密钥交换（前向保密）
RSA:   证书签名验证
AES_128_GCM: 对称加密（数据传输）
SHA256: 哈希
```

---

## 5. 什么是前向保密（Perfect Forward Secrecy）？

**回答：**

### 定义

```
前向保密 = 即使服务器私钥将来被泄露，过去的通信内容仍然安全

RSA 密钥交换（无前向保密）：
  客户端用服务器公钥加密 Pre-Master Secret → 服务器用私钥解密
  问题：攻击者记录了所有加密流量
        → 将来获取服务器私钥
        → 可以解密 Pre-Master Secret
        → 可以解密所有历史通信！

ECDHE 密钥交换（有前向保密）：
  每次连接生成临时 DH 密钥对
  双方交换公开参数 → 独立计算相同的共享密钥
  临时密钥用完即销毁
  → 即使服务器私钥泄露，也无法还原每次的临时密钥
  → 历史通信仍然安全
```

### Diffie-Hellman 密钥交换原理（简化）

```
               公开参数: p(大素数), g(生成元)

Alice                                        Bob
  生成私钥 a                                   生成私钥 b
  计算公钥 A = g^a mod p                       计算公钥 B = g^b mod p
      |                                         |
      |──────── 交换公钥 A, B ─────────────────|
      |                                         |
  计算共享密钥:                              计算共享密钥:
  K = B^a mod p                             K = A^b mod p
    = (g^b)^a mod p                           = (g^a)^b mod p
    = g^(ab) mod p                            = g^(ab) mod p
                        K 相同！

观察者即使知道 A, B, p, g，也无法（在合理时间内）计算出 K
→ 这就是离散对数问题的难度
```

### 配置前向保密

```nginx
# Nginx 配置优先使用 ECDHE
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
ssl_prefer_server_ciphers on;
```

---

## 6. 数字证书和 CA（证书颁发机构）？

**回答：**

### 证书的作用

```
问题：客户端如何确认服务器的公钥是真的？
  → 中间人可以替换服务器公钥（MITM 攻击）

解决：使用受信任的第三方（CA）签发证书
  → 证书 = "CA 保证这个公钥属于这个域名"
```

### 证书内容（X.509 格式）

```
┌─────────────────────────────────────┐
│  版本号: v3                          │
│  序列号: 唯一标识                     │
│  签名算法: SHA256withRSA             │
│  颁发者: Let's Encrypt Authority X3  │
│  有效期:                             │
│    Not Before: 2024-01-01            │
│    Not After:  2024-04-01            │
│  使用者: www.example.com             │
│  公钥: RSA 2048 bit                  │
│  扩展:                               │
│    Subject Alternative Name:         │
│      *.example.com, example.com      │
│    Key Usage: Digital Signature      │
│  ─────────────────────                │
│  CA 的数字签名                        │
│  (CA 用自己的私钥对上述信息签名)       │
└─────────────────────────────────────┘
```

### 证书链验证

```
浏览器验证流程：

                  根 CA 证书（预装在OS/浏览器中）
                       │ 签发
                  中间 CA 证书
                       │ 签发
                  服务器证书（example.com）

1. 收到服务器证书 + 中间证书
2. 用中间 CA 的公钥验证服务器证书的签名 → OK
3. 用根 CA 的公钥验证中间 CA 证书的签名 → OK
4. 根 CA 在信任列表中 → 信任链完整！
5. 检查域名匹配、有效期、吊销状态(OCSP/CRL)
```

### 证书类型

| 类型 | 验证级别 | 适用场景 |
|------|---------|---------|
| DV (Domain Validation) | 只验证域名所有权 | 个人站、API |
| OV (Organization Validation) | 验证组织身份 | 企业官网 |
| EV (Extended Validation) | 严格的组织审核 | 银行、支付 |
| 通配符 (Wildcard) | *.example.com | 多子域名 |
| SAN (多域名) | 一证书多域名 | CDN、云服务 |

---

## 7. Let's Encrypt 证书的申请和自动续期？

**回答：**

### 使用 Certbot

```bash
# 安装 Certbot
apt-get install certbot python3-certbot-nginx

# 申请证书（Nginx 插件自动配置）
certbot --nginx -d example.com -d www.example.com

# 仅申请证书（手动配置 Nginx）
certbot certonly --webroot -w /var/www/html -d example.com

# 申请通配符证书（需 DNS 验证）
certbot certonly --manual --preferred-challenges dns -d "*.example.com" -d example.com

# 证书位置
ls /etc/letsencrypt/live/example.com/
#  cert.pem       ← 服务器证书
#  chain.pem      ← 中间证书
#  fullchain.pem  ← 服务器证书 + 中间证书（Nginx 用这个）
#  privkey.pem    ← 私钥
```

### 自动续期

```bash
# 测试续期
certbot renew --dry-run

# 自动续期（certbot 安装后自动配置定时任务）
# 查看定时器
systemctl list-timers | grep certbot

# 手动配置 cron
# 每天凌晨 2 点检查并续期
0 2 * * * certbot renew --quiet --post-hook "systemctl reload nginx"

# 证书有效期 90 天，certbot 默认在到期前 30 天续期
```

### Nginx 证书配置

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # HSTS (HTTP Strict Transport Security)
    add_header Strict-Transport-Security "max-age=63072000" always;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;
}

# HTTP → HTTPS 重定向
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}
```

---

## 8. 什么是 HSTS？什么是 OCSP Stapling？

**回答：**

### HSTS (HTTP Strict Transport Security)

```
问题：用户可能通过 HTTP 访问（第一次/直接输入域名）
  → 301 重定向到 HTTPS
  → 但第一个 HTTP 请求是明文的！可被劫持

HSTS 解决：
  服务器返回：Strict-Transport-Security: max-age=31536000; includeSubDomains
  浏览器记住：这个域名接下来 1 年内直接走 HTTPS，不发 HTTP 请求

  更安全：提交到 HSTS Preload List（Chrome 内置列表）
  → 浏览器首次访问也走 HTTPS
```

### OCSP Stapling

```
问题：浏览器验证证书时需要查询 OCSP 服务器（证书是否被吊销）
  → 实时查询慢（增加延迟）
  → OCSP 服务器可能不可用
  → 隐私问题（CA 知道用户访问了哪些网站）

OCSP Stapling 解决：
  Web 服务器定期从 CA 获取 OCSP 响应（带时间戳签名）
  TLS 握手时把 OCSP 响应"钉(staple)"在证书后面一起发
  → 浏览器直接验证，不用联系 CA
  → 更快、更可靠、更隐私

配置（Nginx）：
  ssl_stapling on;
  ssl_stapling_verify on;
  ssl_trusted_certificate /path/to/chain.pem;
  resolver 8.8.8.8 valid=300s;

验证：
  openssl s_client -connect example.com:443 -status
  # 看到 "OCSP Response Status: successful" 表示启用成功
```

---

## 9. SSL/TLS 常见的安全漏洞和最佳实践？

**回答：**

### 已知漏洞

| 漏洞名 | 年份 | 影响 | 解决 |
|--------|------|------|------|
| POODLE | 2014 | SSL 3.0 | 禁用 SSL 3.0 |
| BEAST | 2011 | TLS 1.0 CBC | 升级到 TLS 1.2+ |
| Heartbleed | 2014 | OpenSSL 内存泄露 | 升级 OpenSSL |
| FREAK | 2015 | 降级到出口级加密 | 禁用 RSA_EXPORT |
| Logjam | 2015 | DH 弱参数 | 使用 2048+ bit DH |
| CRIME/BREACH | 2012/13 | TLS 压缩泄露数据 | 禁用 TLS 压缩 |
| Lucky13 | 2013 | CBC 时序攻击 | 使用 GCM 模式 |

### 最佳实践

```bash
# 1. 只启用安全的协议版本
ssl_protocols TLSv1.2 TLSv1.3;
# 禁用 SSLv2, SSLv3, TLSv1.0, TLSv1.1

# 2. 使用安全的加密套件
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';

# 3. 强制前向保密
# 只用 ECDHE 密钥交换

# 4. 使用强 DH 参数
openssl dhparam -out /etc/nginx/dhparam.pem 2048
ssl_dhparam /etc/nginx/dhparam.pem;

# 5. 启用 HSTS
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

# 6. 启用 OCSP Stapling
ssl_stapling on;

# 7. 安全头部
add_header X-Content-Type-Options nosniff;
add_header X-Frame-Options SAMEORIGIN;
add_header X-XSS-Protection "1; mode=block";

# 8. 定期检查证书到期
echo | openssl s_client -connect example.com:443 2>/dev/null | openssl x509 -noout -dates
```

### 检测工具

```bash
# SSL Labs 测试（在线）
# https://www.ssllabs.com/ssltest/

# 命令行测试
nmap --script ssl-enum-ciphers -p 443 example.com

# testssl.sh（全面检测）
./testssl.sh example.com

# 查看证书信息
openssl s_client -connect example.com:443 -servername example.com < /dev/null 2>/dev/null | openssl x509 -text -noout
```

---

## 10. 什么是 SNI（Server Name Indication）？

**回答：**

### 问题背景

```
一台服务器（一个 IP）托管多个 HTTPS 网站时：
  TLS 握手发生在 HTTP 请求之前
  → 服务器不知道客户端要访问哪个域名
  → 不知道用哪个证书！

HTTP 虚拟主机用 Host 头区分 → 但 Host 在 HTTP 层，TLS 握手时还没到
```

### SNI 解决方案

```
SNI: TLS ClientHello 中包含目标域名

客户端:
  ClientHello {
    server_name: "www.example.com"    ← SNI 字段
    ...
  }

服务器:
  根据 SNI 选择对应域名的证书 → 返回正确证书

注意：
  - SNI 是明文的（TLS 1.2 中）
  - TLS 1.3 的 ECH (Encrypted Client Hello) 加密了 SNI
  - 极少数老客户端不支持 SNI（IE on Win XP, Android 2.x）
```

### Nginx 多域名 HTTPS

```nginx
# 域名 1
server {
    listen 443 ssl;
    server_name a.example.com;
    ssl_certificate /etc/ssl/a.example.com.pem;
    ssl_certificate_key /etc/ssl/a.example.com.key;
}

# 域名 2
server {
    listen 443 ssl;
    server_name b.example.com;
    ssl_certificate /etc/ssl/b.example.com.pem;
    ssl_certificate_key /etc/ssl/b.example.com.key;
}

# Nginx 自动根据 SNI 选择证书
```

---

## 11. 什么是双向 TLS（mTLS）？

**回答：**

### 单向 vs 双向 TLS

```
单向 TLS（标准 HTTPS）：
  只验证服务器身份（客户端验证服务器证书）
  客户端不需要证书

双向 TLS（mTLS, Mutual TLS）：
  同时验证服务器和客户端身份
  客户端也需要出示证书

用途：
  - 微服务间通信（Service Mesh: Istio）
  - API 网关认证
  - IoT 设备认证
  - 企业内部系统
```

### mTLS 握手流程

```
标准 TLS 握手 +

  服务器 → 客户端: CertificateRequest（请求客户端证书）
  客户端 → 服务器: Certificate（客户端证书）
  客户端 → 服务器: CertificateVerify（用私钥签名证明持有）
  服务器验证客户端证书（签名、CA链、吊销状态）
```

### Nginx 配置 mTLS

```nginx
server {
    listen 443 ssl;

    # 服务器证书
    ssl_certificate /etc/ssl/server.pem;
    ssl_certificate_key /etc/ssl/server.key;

    # 客户端证书验证
    ssl_client_certificate /etc/ssl/ca.pem;   # 签发客户端证书的 CA
    ssl_verify_client on;                      # 必须提供客户端证书
    # ssl_verify_client optional;              # 可选
    ssl_verify_depth 2;                         # 证书链深度

    location / {
        # 可以获取客户端证书信息
        proxy_set_header X-Client-Cert-DN $ssl_client_s_dn;
        proxy_pass http://backend;
    }
}
```

---

## 12. 常用的 OpenSSL/证书运维命令？

**回答：**

```bash
# ===== 查看证书信息 =====

# 查看证书内容
openssl x509 -in cert.pem -text -noout

# 查看证书到期时间
openssl x509 -in cert.pem -noout -dates

# 查看远程服务器证书
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -text -noout

# 查看证书链
openssl s_client -connect example.com:443 -showcerts

# 查看证书指纹
openssl x509 -in cert.pem -fingerprint -sha256 -noout

# ===== 生成密钥和证书 =====

# 生成 RSA 私钥
openssl genrsa -out server.key 2048

# 生成 ECDSA 私钥
openssl ecparam -genkey -name prime256v1 -out server.key

# 生成 CSR（证书签名请求）
openssl req -new -key server.key -out server.csr -subj "/CN=example.com"

# 自签名证书（测试环境）
openssl req -x509 -newkey rsa:2048 -keyout server.key -out server.crt -days 365 -nodes -subj "/CN=localhost"

# ===== 转换格式 =====

# PEM → DER
openssl x509 -in cert.pem -outform DER -out cert.der

# PEM → PKCS12 (pfx)
openssl pkcs12 -export -out cert.pfx -inkey key.pem -in cert.pem -certfile chain.pem

# PKCS12 → PEM
openssl pkcs12 -in cert.pfx -out cert.pem -nodes

# ===== 验证 =====

# 验证证书与私钥是否匹配
openssl x509 -noout -modulus -in cert.pem | openssl md5
openssl rsa -noout -modulus -in key.pem | openssl md5
# 输出的 MD5 应该相同

# 验证证书链
openssl verify -CAfile ca-chain.pem cert.pem

# 测试 TLS 连接
openssl s_client -connect example.com:443 -tls1_2
openssl s_client -connect example.com:443 -tls1_3

# ===== 监控脚本 =====

# 检查证书剩余天数
days_left=$(( ($(date -d "$(openssl x509 -enddate -noout -in cert.pem | cut -d= -f2)" +%s) - $(date +%s)) / 86400 ))
echo "证书剩余 $days_left 天"
```
