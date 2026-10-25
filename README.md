# 库了么 · Android 客户端

「库了么」私有实物库管理系统的 Android 客户端，同时也是这个仓库的完整源码工程。Vue 3 + Vite + TypeScript + Vant，Capacitor 8 打包成 APK。

服务端与 Web 管理后台在 [Dalizz22/kuleme](https://github.com/Dalizz22/kuleme)。本仓库可独立构建、独立发布，不依赖那棵源码树的 npm workspace。

## 直接装 APK

不想自己构建时，用 `releases/` 里的成品包：

```bash
adb install -r releases/kuleme-android-1.0-debug.apk   # 手机已开「USB 调试」
shasum -a 256 -c releases/SHA256SUMS.txt
```

装好后进 App 的「设置」页填服务端地址：**只填主机根地址**（例如 `http://192.168.1.10:8080`，不要带 `/api/v1`，路径由客户端拼）。首次没有地址时 App 会自动落到设置页，这是设计行为。

> 这是 **debug 签名**的包，仅供自己安装使用，不要对外分发；正式分发需要自己的签名密钥。

## 开发

```bash
npm install
npm run dev            # vite，/api/v1 代理到 http://localhost:18081
npm run build          # 只出 web 产物 dist/（base './'）
npm run typecheck      # vue-tsc
npm run build:android  # web 产物 + 同步进原生工程 + 编译 APK
```

## 打包 APK

```bash
JAVA_HOME=$(/usr/libexec/java_home -v 21) GRADLE_USER_HOME=/tmp/klm-gradle \
  npm run build:android
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

**为什么必须走 `build:android`**：`npm run build` 只产出 `dist/`，不会更新 `android/app/src/main/assets/public`；只跑 `gradlew assembleDebug` 会把上一次 `cap sync` 的旧 web 包装进 APK（实测过 dist 22:46、assets/public 04:53，装到手机上还是旧页面）。

环境硬要求（都实测踩过）：

- **JAVA_HOME 必须是 JDK 21**（Capacitor 8 编译目标 21）。Temurin 25 → `Unsupported class file major version 69`；Temurin 17 → `错误: 无效的源发行版：21`。
- **受限环境下 `GRADLE_USER_HOME` 要指到可写目录**（如 `/tmp/klm-gradle`），否则默认 `~/.gradle` 报 `Could not create parent directory for lock file .../wrapper/dists/...lck`。
- **`ANDROID_HOME` 要指到 SDK 目录**（如 `$HOME/Library/Android/sdk`），或用 `android/local.properties` 写 `sdk.dir=...`（该文件是本机路径，不进仓库）。缺了会报 `SDK location not found`。

原生工程既有配置：`android/build.gradle` 的 subprojects 统一 `buildToolsVersion "36.0.0"`、`variables.gradle` 的 `compileSdkVersion = 37` / `minSdkVersion = 26`（扫码插件要求），debug 签名用 `android/debug.keystore`。

## 内网 HTTP 部署（填 `http://<内网IP>:<port>` 必读）

APK 里的页面**跑在 `https://localhost`**（Capacitor 默认 scheme），所以连接 `http://` 的服务端属于「混合内容 + 明文流量」，Android 默认双拦，请求直接变成 `TypeError: Failed to fetch`。要支持内网 HTTP，三处必须同时成立：

1. `capacitor.config.ts`：`android.allowMixedContent = true`（允许 https 页面请求 http）与 `server.cleartext = true`。
2. `android/app/src/main/AndroidManifest.xml` 的 `<application>` 上有 `android:usesCleartextTraffic="true"`（Android 9+ 默认禁明文）。
3. **`npx cap sync` 不会把 `server.cleartext` 写进清单**，清单那行必须手改；重建后确认它还在：

```bash
grep usesCleartextTraffic android/app/src/main/AndroidManifest.xml
```

症状对照：地址填对、服务端 curl 正常、APK 里仍报「网络连接失败」或 `Failed to fetch` → 就是这条配置缺口，不要去查服务端。

## 功能与流程

首页 → 拍照入库（Capture，拍照/选图上限取服务端 `GET /ai/settings` 的 `max_images`，默认 8，第 N+1 张在选择阶段就拦）→ 逐张 `POST /files` → `POST /ai/tasks` → 审核页（候选列表、改名勾选、统一选库+位置、是否共享来源图）→ 逐候选 `POST /ai/candidates/:id/confirm` → 成功页显示编码。

AI 超时/限流/断网时页面降级到「手动建档」（一次 `POST /items` 带 `initial_location_id` / `initial_quantity`，服务端同事务落库），流程不中断。写操作都带 `Idempotency-Key`，响应丢失后按 `GET /operation-results/{key}` 恢复，不重复提交。

## 架构要点

- `src/store.ts`：会话状态。Bearer token 只存内存；只有 `klm.baseUrl`（服务器地址）落 localStorage。
- `src/api.ts`：fetch 封装，统一解析 `{data}` / `{error:{code,message}}` 信封、错误码到中文文案、写操作幂等键（`crypto.randomUUID`）、401 清内存回登录页、图片 fetch 成 blob → objectURL（令牌不进 URL）。
- `src/flow.ts`：拍照 → 审核 → 成功页的内存交接与 operation 恢复。
- 路由用 hash 模式（兼容 `file://` 与 `base './'`）。

## 与服务端契约的注意点

1. 库存操作的 `kind` 是 `initial`（另有 `move`/`scrap`/`correction`），不是 `create_initial`。
2. `POST /items` 接受 `initial_location_id` / `initial_quantity`，同事务写初始库存；手动建档一次请求完成，不要再补发库存操作。
3. 当前版本是逐件模型：库存操作的数量固定传 `"1"`。
4. 扫码用 `@capacitor/barcode-scanner@3.x`（OutSystems 的 ZXING 封装），版本号独立于 Capacitor 主版本；`CapacitorBarcodeScanner.scanBarcode` 返回 `{ScanResult}`。
5. `GET /codes/resolve` 返回 `{payload, resolved}`；`resolved.item_id` 缺失时按 `resolved.kind === 'item'` 用 `id` 兜底；`kind === 'location'` 表示位置码，只提示不跳转。
6. 会话状态用轻量 reactive 模块，没有引 Pinia（当前没有跨页复杂状态）。
