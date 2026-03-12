# gRPC与Protobuf

---

## 1. gRPC核心概念？

**回答：**

```
  gRPC = Google Remote Procedure Call
  基于HTTP/2 + Protobuf

  特点：
  ┌──────────────────┬──────────────────────────────┐
  │ 特点              │ 说明                         │
  ├──────────────────┼──────────────────────────────┤
  │ 高性能            │ HTTP/2多路复用 + 二进制序列化│
  │ 强类型            │ Protobuf IDL定义接口         │
  │ 流式通信          │ 支持双向流                   │
  │ 多语言            │ 自动生成各语言代码           │
  │ 内置特性          │ 拦截器/重试/负载均衡         │
  └──────────────────┴──────────────────────────────┘

  四种通信模式：
  1. Unary（一元）：请求-响应（最常用）
  2. Server Streaming：服务端流（如实时日志）
  3. Client Streaming：客户端流（如文件上传）
  4. Bidirectional Streaming：双向流（如聊天）

  vs REST：
  gRPC: 二进制 HTTP/2 快5-10x 适合内部通信
  REST: JSON HTTP/1.1 人类可读 适合外部API
```

---

## 2. Protobuf定义与使用？

**回答：**

```
  Protobuf = Protocol Buffers 二进制序列化

  .proto文件定义：
  syntax = "proto3";
  package user;
  
  option go_package = "pb/user";
  
  // 消息定义
  message User {
    int64 id = 1;          // 字段编号（不能改）
    string name = 2;
    string email = 3;
    Role role = 4;
    repeated string tags = 5;       // 数组
    optional string phone = 6;      // 可选
    google.protobuf.Timestamp created_at = 7;
  }
  
  enum Role {
    ROLE_UNSPECIFIED = 0;   // 必须有0值
    ROLE_ADMIN = 1;
    ROLE_USER = 2;
  }
  
  // 服务定义
  service UserService {
    rpc GetUser(GetUserRequest) returns (GetUserResponse);
    rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
    rpc CreateUser(CreateUserRequest) returns (CreateUserResponse);
    rpc WatchUsers(WatchUsersRequest) returns (stream UserEvent); // 服务端流
  }
  
  message GetUserRequest {
    int64 id = 1;
  }
  
  message GetUserResponse {
    User user = 1;
  }

  生成代码：
  protoc --go_out=. --go-grpc_out=. user.proto

  编号规则：
  1-15 → 1字节编码（常用字段用这些编号）
  16-2047 → 2字节
  编号一旦使用不可更改
```

---

## 3. Go gRPC服务端实现？

**回答：**

```
  实现接口：
  type userServer struct {
      pb.UnimplementedUserServiceServer
      db *sql.DB
  }
  
  func (s *userServer) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.GetUserResponse, error) {
      user, err := s.db.GetUser(ctx, req.Id)
      if err != nil {
          return nil, status.Errorf(codes.NotFound, "user %d not found", req.Id)
      }
      return &pb.GetUserResponse{
          User: &pb.User{
              Id:    user.ID,
              Name:  user.Name,
              Email: user.Email,
          },
      }, nil
  }
  
  func (s *userServer) ListUsers(ctx context.Context, req *pb.ListUsersRequest) (*pb.ListUsersResponse, error) {
      users, err := s.db.ListUsers(ctx, int(req.Page), int(req.PageSize))
      if err != nil {
          return nil, status.Errorf(codes.Internal, "failed to list users: %v", err)
      }
      
      pbUsers := make([]*pb.User, len(users))
      for i, u := range users {
          pbUsers[i] = &pb.User{Id: u.ID, Name: u.Name, Email: u.Email}
      }
      return &pb.ListUsersResponse{Users: pbUsers}, nil
  }

  启动服务：
  func main() {
      lis, _ := net.Listen("tcp", ":50051")
      
      s := grpc.NewServer(
          grpc.UnaryInterceptor(loggingInterceptor),
      )
      pb.RegisterUserServiceServer(s, &userServer{db: db})
      
      // 注册反射（方便调试）
      reflection.Register(s)
      
      log.Println("gRPC server on :50051")
      s.Serve(lis)
  }
```

---

## 4. gRPC拦截器？

**回答：**

```
  拦截器 = gRPC中间件

  一元拦截器：
  func loggingInterceptor(
      ctx context.Context,
      req interface{},
      info *grpc.UnaryServerInfo,
      handler grpc.UnaryHandler,
  ) (interface{}, error) {
      start := time.Now()
      
      // 调用实际处理器
      resp, err := handler(ctx, req)
      
      // 记录日志
      log.Printf("method=%s duration=%v err=%v",
          info.FullMethod, time.Since(start), err)
      
      return resp, err
  }

  认证拦截器：
  func authInterceptor(
      ctx context.Context,
      req interface{},
      info *grpc.UnaryServerInfo,
      handler grpc.UnaryHandler,
  ) (interface{}, error) {
      // 跳过不需要认证的方法
      if info.FullMethod == "/user.UserService/Health" {
          return handler(ctx, req)
      }
      
      md, ok := metadata.FromIncomingContext(ctx)
      if !ok {
          return nil, status.Error(codes.Unauthenticated, "no metadata")
      }
      
      tokens := md.Get("authorization")
      if len(tokens) == 0 {
          return nil, status.Error(codes.Unauthenticated, "no token")
      }
      
      claims, err := validateToken(tokens[0])
      if err != nil {
          return nil, status.Error(codes.Unauthenticated, "invalid token")
      }
      
      ctx = context.WithValue(ctx, "user", claims)
      return handler(ctx, req)
  }

  链式拦截器：
  s := grpc.NewServer(
      grpc.ChainUnaryInterceptor(
          recoveryInterceptor,
          loggingInterceptor,
          authInterceptor,
      ),
  )
```

---

## 5. gRPC流式通信？

**回答：**

```
  服务端流（Server Streaming）：
  // Proto
  rpc WatchOrders(WatchRequest) returns (stream OrderEvent);
  
  // 实现
  func (s *server) WatchOrders(req *pb.WatchRequest, stream pb.OrderService_WatchOrdersServer) error {
      ch := s.orderEvents.Subscribe(req.UserId)
      defer s.orderEvents.Unsubscribe(ch)
      
      for {
          select {
          case event := <-ch:
              if err := stream.Send(event); err != nil {
                  return err
              }
          case <-stream.Context().Done():
              return nil
          }
      }
  }

  客户端流（Client Streaming）：
  // Proto
  rpc UploadFile(stream FileChunk) returns (UploadResponse);
  
  // 实现
  func (s *server) UploadFile(stream pb.FileService_UploadFileServer) error {
      var totalSize int64
      for {
          chunk, err := stream.Recv()
          if err == io.EOF {
              return stream.SendAndClose(&pb.UploadResponse{
                  Size: totalSize,
              })
          }
          if err != nil { return err }
          
          totalSize += int64(len(chunk.Data))
          // 写入存储...
      }
  }

  双向流（Bidirectional Streaming）：
  // Proto
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
  
  // 客户端发送和接收并行
  // 适合聊天/实时协作场景
```

---

## 6. gRPC错误处理？

**回答：**

```
  gRPC状态码：
  ┌──────────────────┬──────────┬──────────────────┐
  │ 状态码            │ HTTP对应  │ 含义             │
  ├──────────────────┼──────────┼──────────────────┤
  │ OK                │ 200      │ 成功             │
  │ InvalidArgument   │ 400      │ 参数错误         │
  │ Unauthenticated   │ 401      │ 未认证           │
  │ PermissionDenied  │ 403      │ 无权限           │
  │ NotFound          │ 404      │ 不存在           │
  │ AlreadyExists     │ 409      │ 已存在           │
  │ ResourceExhausted │ 429      │ 限流             │
  │ Internal          │ 500      │ 内部错误         │
  │ Unavailable       │ 503      │ 不可用           │
  │ DeadlineExceeded  │ 504      │ 超时             │
  └──────────────────┴──────────┴──────────────────┘

  返回错误：
  import "google.golang.org/grpc/status"
  import "google.golang.org/grpc/codes"
  
  // 简单错误
  return nil, status.Errorf(codes.NotFound, "user %d not found", id)
  
  // 带详细信息的错误
  st := status.New(codes.InvalidArgument, "validation failed")
  st, _ = st.WithDetails(&errdetails.BadRequest{
      FieldViolations: []*errdetails.BadRequest_FieldViolation{
          {Field: "email", Description: "invalid format"},
      },
  })
  return nil, st.Err()

  客户端处理：
  resp, err := client.GetUser(ctx, req)
  if err != nil {
      st, ok := status.FromError(err)
      if ok {
          switch st.Code() {
          case codes.NotFound:
              // 处理未找到
          case codes.InvalidArgument:
              for _, detail := range st.Details() {
                  // 处理详细错误
              }
          }
      }
  }
```

---

## 7. gRPC与REST互通？

**回答：**

```
  gRPC-Gateway：自动生成REST代理

  Proto注解：
  import "google/api/annotations.proto";
  
  service UserService {
    rpc GetUser(GetUserRequest) returns (GetUserResponse) {
      option (google.api.http) = {
        get: "/v1/users/{id}"
      };
    }
    rpc CreateUser(CreateUserRequest) returns (CreateUserResponse) {
      option (google.api.http) = {
        post: "/v1/users"
        body: "*"
      };
    }
  }

  生成Gateway代码：
  protoc --grpc-gateway_out=. user.proto

  启动双协议服务：
  // gRPC服务
  go func() {
      lis, _ := net.Listen("tcp", ":50051")
      grpcServer := grpc.NewServer()
      pb.RegisterUserServiceServer(grpcServer, &server{})
      grpcServer.Serve(lis)
  }()
  
  // REST Gateway
  ctx := context.Background()
  mux := runtime.NewServeMux()
  opts := []grpc.DialOption{grpc.WithInsecure()}
  pb.RegisterUserServiceHandlerFromEndpoint(ctx, mux, "localhost:50051", opts)
  
  http.ListenAndServe(":8080", mux)

  效果：
  gRPC客户端 → :50051（原生gRPC）
  REST客户端 → :8080/v1/users（HTTP JSON）
  同一套代码 两种协议
```

---

## 8. Protobuf演进与兼容？

**回答：**

```
  兼容性规则：
  ✅ 新增字段（新编号）
  ✅ 删除字段（保留编号 reserved）
  ✅ 重命名字段（编号不变）
  ❌ 修改字段编号
  ❌ 修改字段类型（大部分场景）
  ❌ 复用已删除的编号

  reserved使用：
  message User {
    int64 id = 1;
    string name = 2;
    // string old_field = 3; 已删除
    reserved 3, 8 to 10;
    reserved "old_field";
    string email = 4;
  }

  optional vs required：
  proto3中所有字段都是可选的
  有默认值（int=0, string="", bool=false）
  用optional关键字区分"未设置"和"零值"
  
  message UpdateUserRequest {
    int64 id = 1;
    optional string name = 2;  // 可以检查是否设置
    optional string email = 3;
  }
  
  // Go中
  if req.Name != nil {
      user.Name = *req.Name
  }

  oneof（互斥字段）：
  message Notification {
    string title = 1;
    oneof content {
      string text = 2;
      bytes image = 3;
      string video_url = 4;
    }
  }
```

---

## 9. gRPC生产实践？

**回答：**

```
  健康检查：
  import "google.golang.org/grpc/health"
  import healthpb "google.golang.org/grpc/health/grpc_health_v1"
  
  healthServer := health.NewServer()
  healthpb.RegisterHealthServer(grpcServer, healthServer)
  healthServer.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)

  超时与重试：
  // 客户端超时
  ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
  defer cancel()
  resp, err := client.GetUser(ctx, req)
  
  // 重试配置
  retryPolicy := `{
    "methodConfig": [{
      "name": [{"service": "user.UserService"}],
      "retryPolicy": {
        "maxAttempts": 3,
        "initialBackoff": "0.1s",
        "maxBackoff": "1s",
        "backoffMultiplier": 2,
        "retryableStatusCodes": ["UNAVAILABLE"]
      }
    }]
  }`
  conn, _ := grpc.Dial(addr, grpc.WithDefaultServiceConfig(retryPolicy))

  负载均衡：
  // 客户端负载均衡
  conn, _ := grpc.Dial(
      "dns:///my-service:50051",
      grpc.WithDefaultServiceConfig(`{"loadBalancingPolicy":"round_robin"}`),
  )

  Keepalive：
  s := grpc.NewServer(
      grpc.KeepaliveParams(keepalive.ServerParameters{
          MaxConnectionIdle: 5 * time.Minute,
          Time:              2 * time.Hour,
          Timeout:           20 * time.Second,
      }),
  )

  监控（Prometheus）：
  import grpc_prometheus "github.com/grpc-ecosystem/go-grpc-prometheus"
  s := grpc.NewServer(
      grpc.ChainUnaryInterceptor(grpc_prometheus.UnaryServerInterceptor),
  )
```

---

## 10. gRPC面试速答？

**回答：**

```
Q: gRPC和REST区别？
A: gRPC: HTTP/2+Protobuf 高性能 适合内部通信
   REST: HTTP/1.1+JSON 人可读 适合外部API

Q: gRPC四种通信模式？
A: Unary/Server Stream/Client Stream/Bidi Stream
   最常用Unary 实时用Bidi Stream

Q: Protobuf字段编号有什么规则？
A: 一旦使用不能修改
   删除字段用reserved保留编号
   1-15用1字节（放常用字段）

Q: gRPC怎么做认证？
A: 拦截器（Interceptor）
   从metadata提取Token验证

Q: gRPC错误处理？
A: status.Errorf(codes.NotFound, ...)
   有标准状态码对应HTTP状态码

Q: 怎么让gRPC支持REST？
A: gRPC-Gateway
   Proto加google.api.http注解 自动生成REST代理

Q: gRPC怎么做负载均衡？
A: 客户端负载均衡(round_robin)
   或通过Service Mesh/代理

Q: Protobuf怎么演进？
A: 新字段用新编号 删字段用reserved
   不改编号不改类型
```
