import { reactive } from 'vue';

// 会话状态：Bearer 仅内存，不落 storage；服务器地址是唯一可持久化项。
export interface SessionUser {
  id: string;
  username: string;
  display_name: string;
  is_admin: boolean;
}

// baseUrl 只有一种约定：存「主机根地址」（如 http://192.168.1.9:8080）。
// 业务路径在调用处统一拼 /api/v1；这里幂等规范化，用户粘完整 /api/v1 地址也能用。
export function normalizeBaseUrl(input: string): string {
  return input
    .trim()
    .replace(/\/+$/, '') // 去尾部斜杠
    .replace(/\/api\/v1$/i, '') // 去已有 /api/v1 前缀
    .replace(/\/+$/, '');
}

export const session = reactive({
  baseUrl: normalizeBaseUrl(localStorage.getItem('klm.baseUrl') ?? ''), // 兼容旧版本存过的 /api/v1 地址
  token: '',
  user: null as SessionUser | null,
  instanceId: '',
  initialized: false,
});

export function setBaseUrl(url: string) {
  session.baseUrl = normalizeBaseUrl(url);
  localStorage.setItem('klm.baseUrl', session.baseUrl);
}

export function clearSession() {
  session.token = '';
  session.user = null;
}
