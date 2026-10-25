import { onBeforeUnmount, reactive } from 'vue';
import { ApiError, errorText, request } from './api';
import type { CatalogNode } from './types';

export interface FlatNode {
  id: string;
  name: string;
  depth: number;
}

function flatten(nodes: CatalogNode[]): FlatNode[] {
  const byParent = new Map<string | null, CatalogNode[]>();
  for (const n of nodes) {
    const arr = byParent.get(n.parent_id) ?? [];
    arr.push(n);
    byParent.set(n.parent_id, arr);
  }
  const out: FlatNode[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const n of (byParent.get(parent) ?? []).sort((a, b) => a.sort - b.sort)) {
      out.push({ id: n.id, name: n.name, depth });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// 列表统一外壳 {data:{items,page,...}}；解包失败按空目录处理，绝不把对象当数组。
function unwrapNodes(data: unknown): CatalogNode[] {
  if (Array.isArray(data)) return data as CatalogNode[];
  const items = (data as { items?: unknown } | null | undefined)?.items;
  return Array.isArray(items) ? (items as CatalogNode[]) : [];
}

// 服务端目录列表统一返回分页壳 {items, page, ...}（同 web 端 listSpaces）。
export async function loadSpaces(): Promise<FlatNode[]> {
  return flatten(unwrapNodes(await request<unknown>('/api/v1/spaces')));
}

export async function loadLocations(): Promise<FlatNode[]> {
  return flatten(unwrapNodes(await request<unknown>('/api/v1/locations')));
}

// 目录类错误：不存在给可读原因 + 重试；断网不抛 TypeError。
// 没有 403 分支：目录接口对非成员用 404 收口（server 刻意设计），401 由 errorText 统一处理。
export function catalogErrorText(e: unknown): string {
  if (e instanceof ApiError && e.status === 404) return '仓库/位置目录不存在，请刷新后重试';
  return errorText(e, '目录加载失败，请重试');
}

export interface CatalogState {
  spaces: FlatNode[];
  locations: FlatNode[];
  loading: boolean;
  error: string;
  loaded: boolean;
}

// Capture / Manual / Review 共用：同一套加载状态、错误文案与卸载取消。
export function useCatalog(withLocations = true) {
  const state = reactive<CatalogState>({
    spaces: [],
    locations: [],
    loading: false,
    error: '',
    loaded: false,
  });
  let alive = true;
  let seq = 0;
  onBeforeUnmount(() => {
    alive = false;
    seq++; // 卸载后到达的响应直接丢弃
  });

  async function load() {
    const my = ++seq;
    state.loading = true;
    state.error = '';
    try {
      const [spaces, locations] = await Promise.all([
        loadSpaces(),
        withLocations ? loadLocations() : Promise.resolve([] as FlatNode[]),
      ]);
      if (!alive || my !== seq) return;
      state.spaces = spaces;
      state.locations = locations;
      state.loaded = true;
    } catch (e) {
      if (!alive || my !== seq) return;
      state.error = catalogErrorText(e);
    } finally {
      if (alive && my === seq) state.loading = false;
    }
  }

  return { state, load };
}
