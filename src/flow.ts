import { reactive } from 'vue';
import type { AiCandidate, AiTask } from './types';

// 拍照 → 确认之间的一次性内存交接（候选以服务端为准，这里只传首屏数据）。
// spaceId：拍照页选定的目标库，确认页用它做默认值（仍可改）。
export const pendingReview = reactive<{ task: AiTask | null; candidates: AiCandidate[]; spaceId: string }>({
  task: null,
  candidates: [],
  spaceId: '',
});

// 确认成功页的结果交接。
export const successResult = reactive<{ codes: string[]; itemIds: string[] }>({
  codes: [],
  itemIds: [],
});

// P10：一次 AI 识别操作的稳定 operation_id。上传、创建任务、重试、应用被回收后
// 的恢复都用同一个 ID（同时作为 Idempotency-Key）；只有明确成功才换新。
export interface PendingOp {
  opId: string;
  spaceId: string;
  fileIds: string[];
}

const OP_KEY = 'klm.ai.op';

function readOp(): PendingOp | null {
  try {
    const raw = localStorage.getItem(OP_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as PendingOp;
    return v && typeof v.opId === 'string' ? v : null;
  } catch {
    return null;
  }
}

// 落 localStorage：刷新/进程回收后仍能按同一 operation_id 查服务端结果，而不是重新提交。
export const pendingOp = reactive<{ current: PendingOp | null }>({ current: readOp() });

export function beginOp(spaceId: string): PendingOp {
  const cur = pendingOp.current;
  if (cur && cur.spaceId === spaceId) return cur;
  const op: PendingOp = { opId: crypto.randomUUID(), spaceId, fileIds: [] };
  setOp(op);
  return op;
}

export function setOp(op: PendingOp) {
  pendingOp.current = op;
  try {
    localStorage.setItem(OP_KEY, JSON.stringify(op));
  } catch {
    /* 存储不可用时不阻断流程 */
  }
}

export function clearOp() {
  pendingOp.current = null;
  try {
    localStorage.removeItem(OP_KEY);
  } catch {
    /* ignore */
  }
}
