<template>
  <van-nav-bar title="物品详情" left-arrow @click-left="router.back()" />
  <div v-if="loadError" class="pad">
    <p class="err">{{ loadError }}</p>
    <van-button block size="small" :loading="loading" @click="load">重试</van-button>
  </div>
  <van-loading v-else-if="!item" class="center" />
  <template v-else>
    <van-cell-group inset>
      <van-cell title="名称" :value="item.name" />
      <van-cell title="编码" :value="item.public_code" />
      <van-cell title="状态" :value="statusText(item.status)" />
      <van-cell v-if="item.maintenance_open" title="维修" value="维修中" />
      <van-cell title="位置" :value="item.location_path || '未设置'" />
      <van-cell title="版本" :value="String(item.version)" />
    </van-cell-group>

    <van-cell-group v-if="fieldEntries.length" inset title="自定义资料">
      <van-cell v-for="[k, v] in fieldEntries" :key="k" :title="k" :value="String(v ?? '')" />
    </van-cell-group>

    <van-cell-group v-if="photo" inset title="照片">
      <div class="pad">
        <van-image :src="photo" width="96" height="96" fit="cover" radius="4" @click="showImagePreview({ images: [photo!] })" />
      </div>
    </van-cell-group>

    <van-cell-group inset title="编辑">
      <van-field v-model="editName" label="名称" placeholder="物品名称" />
      <van-field v-model="editNote" label="备注" type="textarea" autosize />
      <div class="pad">
        <van-button block size="small" :loading="saving" @click="save">保存（版本 {{ item.version }}）</van-button>
      </div>
    </van-cell-group>

    <van-cell-group inset title="状态操作">
      <div class="pad ops">
        <van-button size="small" icon="exchange" :disabled="!canMove" @click="onClick('transfer', () => (showMove = true))">
          移动位置
        </van-button>
        <van-button size="small" type="warning" icon="delete-o" :disabled="!canScrap" @click="onClick('scrap', scrap)">
          报废
        </van-button>
      </div>
      <!-- 不能执行的原因原样来自 action_blocked_reasons，客户端不自己编规则。 -->
      <p v-if="blockedHint" class="hint">{{ blockedHint }}</p>
    </van-cell-group>

    <van-popup v-model:show="showMove" position="bottom">
      <van-picker :columns="locationOptions" @confirm="onMove" @cancel="showMove = false" />
    </van-popup>
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showConfirmDialog, showToast, showImagePreview } from 'vant';
import { ApiError, request, photoUrl, errorText } from '../api';
import { loadLocations, type FlatNode } from '../catalog';
import { statusText, type ItemView } from '../types';

const route = useRoute();
const router = useRouter();
const item = ref<ItemView | null>(null);
const loading = ref(false);
const loadError = ref('');
const photo = ref('');
const editName = ref('');
const editNote = ref('');
const saving = ref(false);
const locations = ref<FlatNode[]>([]);
const showMove = ref(false);
const locationOptions = computed(() => locations.value.map((l) => ({ text: l.name, value: l.id })));
const fieldEntries = computed(() => Object.entries(item.value?.fields ?? {}));

// 动作可用性：只读服务端 allowed_actions（缺字段/缺键按可用降级，点后由服务端 403 兜底）。
// 维修中是服务端字段（maintenance_open），不是客户端推导。
function allowed(key: string): boolean {
  return item.value?.allowed_actions?.[key as never] !== false;
}
// 只用 allowed_actions 一个真源；业务态（维修中/已售）由服务端在命令上兜底（409 OPEN_BUSINESS），
// 客户端不复算「维修中就不能卖」这类规则。
const canMove = computed(() => !!item.value && allowed('transfer'));
const canScrap = computed(() => !!item.value && allowed('scrap'));
const blockedHint = computed(() => {
  const r = item.value?.action_blocked_reasons ?? {};
  return [r.transfer, r.scrap].filter(Boolean).join('；');
});
function onClick(action: string, run: () => void) {
  const reason = item.value?.action_blocked_reasons?.[action];
  if (item.value?.allowed_actions?.[action as never] === false) {
    showToast(reason || '该操作当前不可用');
    return;
  }
  run();
}

const id = route.params.id as string;

// 状态操作幂等键：同一操作意图的重试复用同一把键，成功后销毁。
const opKeys = new Map<string, string>();
function opKey(name: string): string {
  let k = opKeys.get(name);
  if (!k) {
    k = crypto.randomUUID();
    opKeys.set(name, k);
  }
  return k;
}

// 加载失败必须落终态：显示原因 + 重试，不留永久 loading。
async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const it = await request<ItemView>(`/api/v1/items/${id}`);
    item.value = it;
    editName.value = it.name;
    editNote.value = (it.fields?.note as string) ?? '';
    if (it.photo_file_id) photo.value = await photoUrl(it.photo_file_id, true).catch(() => '');
  } catch (e) {
    loadError.value = errorText(e, '物品加载失败');
  } finally {
    loading.value = false;
  }
  // 目录失败不影响详情读取，只在需要移动时提示。
  locations.value = await loadLocations().catch(() => []);
}

onMounted(load);

async function save() {
  if (!item.value) return;
  saving.value = true;
  try {
    item.value = await request<ItemView>(`/api/v1/items/${id}`, {
      method: 'PUT',
      body: { name: editName.value, expected_version: item.value.version },
    });
    showToast('已保存');
  } catch (e: any) {
    if (e instanceof ApiError && e.status === 409) {
      // 版本冲突不是可静默的事：提示后拉最新数据，用户看清再改。
      showToast(errorText(e, '版本已变化'));
      await load();
      return;
    }
    showToast(errorText(e, '保存失败'));
  } finally {
    saving.value = false;
  }
}

async function onMove({ selectedOptions }: any) {
  showMove.value = false;
  const to = selectedOptions[0]?.value;
  if (!to || !item.value) return;
  if (!item.value.location_id) {
    showToast('该物品不在任何位置，无法移动');
    return;
  }
  const key = opKey(`move:${to}`);
  try {
    await request('/api/v1/inventory/operations', {
      method: 'POST',
      idempotencyKey: key,
      body: { item_id: id, kind: 'move', location_id: item.value.location_id, to_location_id: to, quantity: '1' },
    });
    opKeys.delete(`move:${to}`);
    showToast('已移动');
    await load();
  } catch (e) {
    showToast(errorText(e, '移动失败'));
  }
}

async function scrap() {
  if (!item.value?.location_id) {
    showToast('该物品不在任何位置，无法报废');
    return;
  }
  try {
    await showConfirmDialog({ title: '确认报废？', message: '报废后该物品不再在库。' });
  } catch {
    return;
  }
  try {
    await request('/api/v1/inventory/operations', {
      method: 'POST',
      idempotencyKey: opKey('scrap'),
      body: { item_id: id, kind: 'scrap', location_id: item.value.location_id, quantity: '1' },
    });
    opKeys.delete('scrap');
    showToast('已报废');
    await load();
  } catch (e) {
    showToast(errorText(e, '报废失败'));
  }
}

</script>

<style scoped>
.center {
  display: block;
  margin: 40px auto;
}
.pad {
  padding: 12px 16px;
}
.err {
  color: #ee0a24;
  font-size: 13px;
  margin-bottom: 8px;
}
.ops {
  display: flex;
  gap: 12px;
}
.hint {
  padding: 0 16px 8px;
  margin: 0;
  color: #969799;
  font-size: 12px;
}
</style>
