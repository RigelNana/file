# HTTPS与TLS

---

## 1. HTTPS 工作原理？

**回答：**

```
HTTPS = HTTP + TLS（加密层）

  ┌──────────┐     ┌──────────┐
  │ HTTP     │     │ HTTP     │
  ├──────────┤     ├──────────┤
  │          │     │ TLS      │ ← 加密层
  ├──────────┤     ├──────────┤
  │ TCP      │     │ TCP      │
  └──────────┘     └──────────┘
    HTTP             HTTPS

提供三大安全保证：
  机密性：加密传输，防窃听
  完整性：MAC 校验，防篡改
  身份验证：证书验证，防冒充

端口：HTTP 80 / HTTPS 443
```

---

## 2. TLS 1.2 握手过程？

**回答：**

```
TLS 1.2 完整握手（2-RTT）：

客户端                           服务端
  │                                │
  │── ClientHello ────────────────→│ 1. 支持的加密套件
  │   随机数A                      │    TLS 版本
  │                                │
  │←── ServerHello ───────────────│ 2. 选定加密套件
  │    随机数B                     │    返回证书
  │    Certificate                │    (RSA 公钥)
  │    ServerHelloDone            │
  │                                │
  │── ClientKeyExchange ─────────→│ 3. 预主密钥
  │   (用公钥加密预主密钥)          │    (RSA) 或
  │   ChangeCipherSpec            │    DH 公钥
  │   Finished                    │
  │                                │
  │←── ChangeCipherSpec ─────────│ 4. 切换到加密
  │    Finished                   │
  │                                │
  │══ 加密通信 ══════════════════│

密钥计算：
  预主密钥 + 随机数A + 随机数B
  → 主密钥 (Master Secret)
  → 会话密钥（对称加密密钥）
```

---

## 3. TLS 1.3 改进？

**回答：**

```
TLS 1.3 握手（1-RTT）：

客户端                           服务端
  │                                │
  │── ClientHello ────────────────→│ 支持的套件
  │   随机数 + DH 公钥             │ + DH 公钥
  │                                │
  │←── ServerHello ───────────────│ 选定套件
  │    DH 公钥 + 证书 + Finished  │ + DH 公钥
  │                                │
  │── Finished ──────────────────→│
  │                                │
  │══ 加密通信 ══════════════════│

TLS 1.3 vs 1.2：
  ┌──────────────┬──────────────┬──────────────┐
  │ 特性          │ TLS 1.2      │ TLS 1.3      │
  ├──────────────┼──────────────┼──────────────┤
  │ 握手 RTT      │ 2            │ 1（0-RTT恢复）│
  │ 密钥交换      │ RSA/ECDHE   │ 仅 ECDHE     │
  │ 前向保密      │ 可选         │ 强制          │
  │ 对称加密      │ CBC/GCM 等  │ 仅 AEAD      │
  │ 废弃算法      │ —           │ RC4/3DES/SHA1│
  └──────────────┴──────────────┴──────────────┘

0-RTT 恢复（PSK）：
  使用之前的会话密钥直接加密数据
  第一个包就携带应用数据
  风险：可能重放攻击（需应用层幂等保护）
```

---

## 4. 证书与 CA？

**回答：**

```
数字证书内容：
  域名 / 公钥 / CA 签名 / 有效期 / 序列号

证书链验证：
  服务器证书 ← 中间 CA 签发
  中间 CA ← 根 CA 签发
  根 CA → 预装在浏览器/操作系统

  ┌──────────┐
  │ 根 CA    │ 自签名（预装信任）
  └────┬─────┘
       │ 签发
  ┌────┴─────┐
  │ 中间 CA  │
  └────┬─────┘
       │ 签发
  ┌────┴─────┐
  │ 服务器证书│ 绑定域名+公钥
  └──────────┘

验证过程：
  1. 检查证书有效期
  2. 检查域名匹配
  3. 用上级 CA 公钥验证签名
  4. 逐级验证直到根 CA
  5. 检查吊销状态（CRL/OCSP）

证书类型：
  DV（域名验证）：只验证域名所有权
  OV（组织验证）：验证组织身份
  EV（扩展验证）：最严格验证

Let's Encrypt：免费自动化 DV 证书
```

---

## 5. 对称加密与非对称加密？

**回答：**

```
对称加密（共享密钥）：
  加密解密用同一密钥
  速度快（AES 硬件加速可达 GB/s）

  常用算法：
  AES-128/256-GCM → 主流推荐
  ChaCha20-Poly1305 → 移动端友好

非对称加密（公钥/私钥）：
  公钥加密，私钥解密（或反过来签名）
  速度慢（比对称慢 100-1000 倍）

  常用算法：
  RSA 2048/4096 → 经典但性能差
  ECDSA → 椭圆曲线，密钥短性能好
  Ed25519 → 新一代签名算法

AEAD（认证加密）：
  同时提供加密 + 完整性验证
  AES-GCM / ChaCha20-Poly1305
  TLS 1.3 强制使用 AEAD

HTTPS 中的配合：
  非对称加密 → 密钥交换（ECDHE）
  对称加密 → 数据传输（AES-GCM）
  数字签名 → 身份验证（RSA/ECDSA）
  哈希 → 完整性（SHA-256）
```

---

## 6. 密钥交换算法？

**回答：**

```
RSA 密钥交换（TLS 1.2，已废弃于 1.3）：
  客户端生成预主密钥
  用服务端 RSA 公钥加密发送
  缺点：私钥泄露可解密历史流量（无前向保密）

ECDHE 密钥交换（推荐）：
  双方各生成临时 DH 密钥对
  交换公钥后独立计算共享密钥
  每次连接不同密钥 → 前向保密

  ┌──────────┐                 ┌──────────┐
  │ 客户端    │                 │ 服务端    │
  │ 私钥 a   │                 │ 私钥 b   │
  │ 公钥 A=aG│────A────────→  │          │
  │          │←───B───────── │ 公钥 B=bG│
  │ 共享密钥  │                 │ 共享密钥  │
  │ S = aB   │                 │ S = bA   │
  │ = abG    │                 │ = abG    │
  └──────────┘                 └──────────┘
  双方得到相同的 S，中间人无法计算

前向保密 (PFS)：
  临时密钥用完销毁
  即使长期私钥泄露
  历史加密流量仍然安全
```

---

## 7. HTTPS 性能优化？

**回答：**

```
握手优化：
  TLS 1.3：1-RTT 握手
  Session Resumption：复用之前的对称密钥
  0-RTT（TLS 1.3 PSK）：首包即传数据
  OCSP Stapling：服务器代查证书吊销状态

证书优化：
  ECDSA 证书（比 RSA 小且快）
  证书链要完整但不要过长

加密算法选择：
  AES-128-GCM（有 AES-NI 硬件加速时）
  ChaCha20-Poly1305（无硬件加速时）

连接复用：
  HTTP/2 多路复用（一个 TLS 连接）
  连接池复用长连接

硬件加速：
  AES-NI 指令集（现代 CPU 都支持）
  SSL 卸载到负载均衡器/专用硬件

实际影响：
  首次握手增加 1-2 RTT（TLS 1.3 仅 1 RTT）
  对称加密开销 <1%（有硬件加速）
  总体性能损失 <5%
```

---

## 8. 中间人攻击与防御？

**回答：**

```
中间人攻击 (MITM)：
  攻击者在客户端和服务端之间截获通信

  客户端 ←→ 攻击者 ←→ 服务端
  客户端以为在和服务端通信
  实际和攻击者通信

攻击方式：
  1. ARP 欺骗（局域网）
  2. DNS 劫持（解析到恶意 IP）
  3. 伪造 CA 证书
  4. SSL 剥离（HTTPS 降为 HTTP）

防御措施：
  证书验证：验证证书链直到受信根 CA
  证书固定（Certificate Pinning）：
    APP 内置服务器证书指纹
  HSTS：强制浏览器用 HTTPS
    Strict-Transport-Security: max-age=31536000
  CT（Certificate Transparency）：
    证书透明日志，检测恶意签发

HSTS 头部：
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  → 告诉浏览器此域名必须 HTTPS
  → 防止 SSL 剥离攻击
```

---

## 9. mTLS 双向认证？

**回答：**

```
标准 TLS：只验证服务端证书
mTLS：客户端和服务端互相验证证书

  ┌──────────┐  验证服务端证书  ┌──────────┐
  │ 客户端    │←──────────────│ 服务端    │
  │          │──────────────→│          │
  │ 客户端证书│  验证客户端证书  │          │
  └──────────┘                └──────────┘

使用场景：
  微服务间通信（Service Mesh/Istio）
  API 网关认证
  金融系统/支付接口
  IoT 设备认证
```

```go
// Go mTLS 服务端
func main() {
    caCert, _ := os.ReadFile("ca.pem")
    caCertPool := x509.NewCertPool()
    caCertPool.AppendCertsFromPEM(caCert)

    cert, _ := tls.LoadX509KeyPair("server.pem", "server-key.pem")

    tlsConfig := &tls.Config{
        Certificates: []tls.Certificate{cert},
        ClientAuth:   tls.RequireAndVerifyClientCert,
        ClientCAs:    caCertPool,
    }

    server := &http.Server{
        Addr:      ":443",
        TLSConfig: tlsConfig,
    }
    server.ListenAndServeTLS("", "")
}
```

---

## 10. HTTPS与TLS面试速答？

**回答：**

```
Q: HTTPS 和 HTTP 区别？
A: HTTPS = HTTP + TLS 加密层
   提供加密、完整性、身份验证

Q: TLS 握手过程？
A: 交换随机数→服务端发证书→密钥交换
   →计算会话密钥→加密通信
   TLS 1.3 只需 1-RTT

Q: 对称加密 vs 非对称加密？
A: 对称快用于数据传输（AES）
   非对称慢用于密钥交换（ECDHE）

Q: 什么是前向保密？
A: 用临时密钥（ECDHE），用完销毁
   私钥泄露不影响历史通信

Q: 证书如何验证？
A: 沿证书链逐级验证签名
   直到预装的根 CA

Q: TLS 1.3 vs 1.2？
A: 1.3：1-RTT握手、仅ECDHE、强制前向保密
   废弃RSA密钥交换和不安全算法

Q: 中间人攻击防御？
A: 证书验证 + HSTS + 证书固定 + CT日志

Q: mTLS 是什么？
A: 双向证书认证
   微服务间通信安全（Istio/Service Mesh）

Q: HTTPS 性能影响？
A: TLS 1.3 仅多 1-RTT
   对称加密有硬件加速 <1% 开销
   总体 <5%
```
