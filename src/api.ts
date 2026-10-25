import { session, clearSession } from './store';

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// 401 时由 router 注入：清内存并回登录页。
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

// 文案唯一真源在 apps/web/src/api/errors.ts（P42）；本文件必须逐字一致，改文案先改那边。
// 服务端错误码清单来自 server/internal/httpx/response.go + 各包 Code* 常量，穷尽式对齐。
// 原则：服务端中文业务 message 可展示的优先显示；纯格式/鉴权/冲突类用固定文案；
// 只有 NOT_IMPLEMENTED 才允许出现「功能未开放」；400 已彻底消失，不要按 status===400 分支。

/** 服务端全部错误码 → 中文固定文案（默认兜底文案）。 */
export const ERROR_TEXT: Record<string, string> = {
  // httpx 通用码
  VALIDATION_FAILED: '输入有误，请检查后重试',
  INVALID_CODE: '数据校验未通过，请刷新后重试',
  UNAUTHENTICATED: '登录已失效，请重新登录',
  SESSION_EXPIRED: '登录已失效，请重新登录',
  FORBIDDEN: '没有权限执行该操作',
  NOT_FOUND: '对象不存在或无权访问',
  VERSION_CONFLICT: '数据已变化，请刷新后重试',
  IDEMPOTENCY_CONFLICT: '本次操作已用不同内容提交过，请勿重复提交',
  INSUFFICIENT_STOCK: '库存不足，请核对数量',
  TREE_CYCLE: '不能移动到自己的子节点下',
  NODE_IN_USE: '该节点仍被使用，无法删除',
  OPEN_BUSINESS: '当前状态不允许该操作，请刷新后重试',
  FILE_TOO_LARGE: '文件超出大小限制',
  FILE_IN_USE: '文件已被引用，无法删除',
  RATE_LIMITED: '请求过于频繁，请稍后重试',
  SERVICE_UNAVAILABLE: '服务暂不可用，请稍后重试',
  MAINTENANCE: '系统维护中，请稍后重试',
  INTERNAL: '服务处理失败，请稍后重试',
  INVALID_IDEMPOTENCY_KEY: '请求标识不合法，本次操作未提交，请重新发起',
  INVALID_IMAGE_COUNT: '图片数量超出限制，请减少后重试',
  PAYLOAD_TOO_LARGE: '提交内容过大，请精简后重试',
  // 各包自定义码
  FEATURE_DISABLED: '该功能已被管理员关闭',
  INVALID_LOCATION: '位置不存在或不可用，请重新选择',
  INVALID_STATUS: '状态筛选值无效，请重新选择',
  INVALID_TRANSFER_TARGET: '不能转库到当前库，库内移位请用库存移动',
  PHOTO_ALREADY_LINKED: '照片已关联到其他物品，请勿重复关联',
  // 客户端契约预留（服务端尚未使用，客户端兜底）
  NOT_IMPLEMENTED: '功能未开放',
};

/**
 * 这些码优先用固定文案：鉴权/冲突/格式类，服务端 message 可能是技术细节。
 * 其余码若服务端给了中文 message（业务提示），优先展示 message。
 */
const FIXED_TEXT_CODES = new Set([
  'UNAUTHENTICATED',
  'SESSION_EXPIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'INVALID_IDEMPOTENCY_KEY',
  'PAYLOAD_TOO_LARGE',
  'FILE_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL',
  'NOT_IMPLEMENTED',
]);

/** 只看是否含中文，避免把英文技术栈信息直接丢给用户。 */
function hasChinese(s: string) {
  return /[\u4e00-\u9fff]/.test(s);
}

export function errorText(e: unknown, fallback = '请求失败'): string {
  if (e instanceof ApiError) {
    const fixed = ERROR_TEXT[e.code];
    if (e.code === 'NOT_IMPLEMENTED') return fixed;
    if (e.code && FIXED_TEXT_CODES.has(e.code) && fixed) return fixed;
    const msg = (e.message || '').trim();
    if (msg && hasChinese(msg)) return msg;
    if (fixed) return fixed;
    // 服务端没给可展示 message：按状态码给类别文案（不暴露技术细节）。
    switch (e.status) {
      case 401:
        return ERROR_TEXT.UNAUTHENTICATED;
      case 403:
        return ERROR_TEXT.FORBIDDEN;
      case 404:
        return ERROR_TEXT.NOT_FOUND;
      case 409:
        return ERROR_TEXT.VERSION_CONFLICT;
      case 413:
        return ERROR_TEXT.FILE_TOO_LARGE;
      case 422:
        return ERROR_TEXT.VALIDATION_FAILED;
      case 429:
        return ERROR_TEXT.RATE_LIMITED;
      case 503:
        return ERROR_TEXT.SERVICE_UNAVAILABLE;
      default:
        return msg || fallback;
    }
  }
  // fetch 网络层失败是 TypeError，不是服务端错误码。
  if (e instanceof TypeError) return '网络连接失败，请检查服务器地址后重试';
  if (e instanceof Error) return e.message || fallback;
  return fallback;
}

function url(path: string): string {
  if (path.startsWith('http')) return path;
  // 浏览器 dev 下走 vite 代理（baseUrl 为空时用相对路径）；App 内必须已配置服务器地址。
  // baseUrl 只存主机根地址（见 store.setBaseUrl），业务路径一律以 /api/v1 开头。
  return session.baseUrl ? session.baseUrl + path : path;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  // 幂等键由调用方持有：一次业务操作生成一把键，重试必须复用同一把。
  idempotencyKey?: string;
  query?: Record<string, string | number | undefined>;
}

export async function request<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (session.token) headers['Authorization'] = `Bearer ${session.token}`;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  let u = url(path);
  if (opts.query) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== '') q.set(k, String(v));
    }
    const qs = q.toString();
    if (qs) u += (u.includes('?') ? '&' : '?') + qs;
  }
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const resp = await fetch(u, { method: opts.method ?? 'GET', headers, body });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    if (resp.status === 401) {
      clearSession();
      onUnauthorized();
    }
    const err = json?.error;
    throw new ApiError(resp.status, err?.code ?? `HTTP_${resp.status}`, err?.message ?? `请求失败（${resp.status}）`, err?.details);
  }
  return json?.data as T;
}

export async function uploadFile(
  file: Blob,
  fileName: string,
  idempotencyKey?: string,
): Promise<{ id: string }> {
  const fd = new FormData();
  fd.append('file', file, fileName);
  const headers: Record<string, string> = {};
  if (session.token) headers['Authorization'] = `Bearer ${session.token}`;
  // P10：上传也带上本次操作的 operation_id，服务端可按同一键去重/追踪。
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const resp = await fetch(url('/api/v1/files'), {
    method: 'POST',
    headers,
    body: fd,
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    if (resp.status === 401) {
      clearSession();
      onUnauthorized();
    }
    const err = json?.error;
    throw new ApiError(resp.status, err?.code ?? `HTTP_${resp.status}`, err?.message ?? `上传失败（${resp.status}）`);
  }
  return json?.data;
}

// 清理本次操作上传过、但最终没有关联到任何物品的文件（用户放弃/改手动建档时）。
// 已关联会 409 FILE_IN_USE、别人的/不存在 404 —— 都只是「没删掉」，不阻断用户离开。
export async function deleteFile(fileId: string): Promise<void> {
  try {
    await request<void>(`/api/v1/files/${fileId}`, { method: 'DELETE' });
  } catch {
    /* 尽力而为：清理失败不影响主流程 */
  }
}

// 服务端 AI 单任务图片上限：GET /ai/settings 的 max_images，读不到才回退 8。
// 每次进拍照页重读，服务端改上限后文案能同步（不做跨页面缓存）。
export const DEFAULT_MAX_IMAGES = 8;
export async function loadMaxImages(): Promise<number> {
  try {
    const s = await request<{ max_images?: number }>('/api/v1/ai/settings');
    const n = Math.floor(Number(s?.max_images));
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    // 未配置 AI / 权限不足 / 断网：用回退值，选图流程不因此中断。
  }
  return DEFAULT_MAX_IMAGES;
}

// P10：已提交操作的真实结果。响应丢失（断网/超时/进程被杀）后靠它恢复页面，
// 而不是用同一个幂等键重新提交去猜结果。
export interface OperationResult {
  operation_id: string;
  status: 'in_progress' | 'succeeded' | 'failed';
  result?: any;
  error_code?: string;
  created_at?: string;
  updated_at?: string;
}

export async function getOperationResult(operationId: string): Promise<OperationResult | null> {
  try {
    return await request<OperationResult>(`/api/v1/operation-results/${operationId}`);
  } catch (e) {
    // 未登记或非本人 → 一律当「无结果」，由调用方决定复用同键重试。
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

// 受控图片：fetch blob → objectURL，令牌不进 URL。
const photoCache = new Map<string, string>();
export async function photoUrl(fileId: string, thumbnail = false): Promise<string> {
  const key = `${fileId}:${thumbnail ? 't' : 'o'}`;
  const hit = photoCache.get(key);
  if (hit) return hit;
  const resp = await fetch(url(`/api/v1/files/${fileId}/${thumbnail ? 'thumbnail' : 'content'}`), {
    headers: session.token ? { Authorization: `Bearer ${session.token}` } : {},
  });
  if (!resp.ok) throw new ApiError(resp.status, `HTTP_${resp.status}`, '图片加载失败');
  const obj = URL.createObjectURL(await resp.blob());
  photoCache.set(key, obj);
  return obj;
}

export function revokePhotos() {
  for (const u of photoCache.values()) URL.revokeObjectURL(u);
  photoCache.clear();
}
