import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.klm.app',
  appName: '库了么',
  webDir: 'dist',
  android: {
    // WebView 页面本身跑在 https://localhost（Capacitor 默认 scheme），
    // 而设置页明确支持填 http://<内网 IP>（受信内网）。不放开混合内容时，
    // 所有 http 请求都会被 Chromium 拦成 TypeError: Failed to fetch，
    // 用户只会看到「网络连接失败」，与产品承诺的「可选 HTTP」不符。
    allowMixedContent: true,
  },
  server: {
    // Android 9+ 默认禁止明文流量。注意：实测 npx cap sync **不会**把这一项
    // 写进 AndroidManifest.xml，清单里的 android:usesCleartextTraffic="true"
    // 必须手改（见 README「内网 HTTP 部署」），否则内网 HTTP 仍然不可达。
    cleartext: true,
  },
};

export default config;
