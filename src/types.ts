// 与服务端代码对齐的 DTO（契约未实现处以服务端为准，见 README）。
export interface SystemInfo {
  instance_id: string;
  name: string;
  api_version: string;
  initialized: boolean;
}

export interface CatalogNode {
  id: string;
  parent_id: string | null;
  name: string;
  sort: number;
}

export interface ItemView {
  id: string;
  template_key: string;
  name: string;
  public_code: string;
  location_id: string | null;
  location_path: string;
  quantity: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
  photo_file_id: string | null;
  // 以下四个字段 server/internal/item/service.go:39-54 的 View 都有，Android 当前不展示，
  // 保留在 DTO 里保证两端描述同一份服务端形态（生命周期/在售/备注）。
  lifecycle?: string;
  for_sale?: boolean;
  note?: string;
  // 服务端派生：维修中（item.service.go:46 maintenance_open）；状态字符里也会体现为 maintenance。
  maintenance_open?: boolean;
  // P16/P18：动作可用性只由服务端给（server/internal/item/actions.go），客户端不推导。
  allowed_actions?: Partial<
    Record<'transfer' | 'sale' | 'scrap' | 'maintenance' | 'stocktake' | 'photos' | 'export', boolean>
  >;
  action_blocked_reasons?: Record<string, string>;
  fields: Record<string, unknown>;
}

export interface Paged<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface AiCandidate {
  id: string;
  task_id: string;
  index: number;
  revision: number;
  name: string;
  summary?: string;
  notes?: string;
  fields?: Record<string, unknown>;
  source_image_ids: string[];
  evidence?: string;
  confidence?: number;
  warnings?: string[];
  state: 'pending' | 'confirmed' | 'ignored' | string;
  confirmed_item_id?: string;
}

export interface AiTask {
  id: string;
  state: string;
}

// GET /codes/resolve 的真实响应：编码词回 {is_code:true,code,kind,instance_id,payload,resolved}，
// 普通搜索词回 {is_code:false,value} —— 后者不是错误，应引导去搜索。
// resolved 为空可能是「该码确实找不到」，也可能是「对象存在但当前账号看不到」——
// 响应里分不出来，所以文案只说「未找到」，不把锅甩给用户权限。
export interface ResolveResult {
  is_code?: boolean;
  value?: string;
  code?: string;
  kind?: string;
  instance_id?: string;
  payload: { kind?: string; code?: string } | null;
  // 真实形态：{kind, object_id, space_id, name, subtitle, page_url}；
  // 物品码另带 item_id 兼容字段，位置码 kind='location'（客户端只提示、不跳转）。
  resolved: {
    kind?: string;
    object_id?: string;
    space_id?: string;
    name?: string;
    subtitle?: string;
    page_url?: string;
    item_id?: string;
    id?: string;
  } | null;
}

// 状态词与 Web 端一字不差：在库/待入库/预留/维修中/已售/已报废/已遗失。
// 服务端真实枚举见 GET /items?status=bogus 的 422 message。
export function statusText(s: string): string {
  return (
    {
      active: '在库',
      normal: '在库',
      in_stock: '在库',
      pending_stock: '待入库',
      reserved: '预留',
      maintenance: '维修中',
      sold: '已售',
      scrapped: '已报废',
      lost: '已遗失',
    }[s] ?? s
  );
}
