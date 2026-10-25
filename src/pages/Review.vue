<template>
  <van-nav-bar title="候选确认" left-arrow @click-left="router.back()" />

  <van-loading v-if="loading" class="center" />

  <div v-else-if="loadError" class="pad">
    <p class="tip">{{ loadError }}</p>
    <van-button block size="small" @click="load">重试</van-button>
  </div>

  <template v-else>
    <div v-if="!editable.length" class="pad">
      <p class="tip">该任务没有可确认的候选，请返回重新拍照或手动建档。</p>
      <van-button block size="small" @click="router.push('/capture')">重新拍照</van-button>
    </div>
    <van-checkbox-group v-model="checked">
      <van-collapse v-model="expanded">
        <van-collapse-item v-for="c in editable" :key="c.id" :name="c.id">
          <template #title>
            <van-checkbox :name="c.id" @click.stop>
              {{ c.name || '（未命名）' }}
              <van-tag v-if="c.state === 'confirmed'" type="success">已确认</van-tag>
            </van-checkbox>
          </template>
          <van-field v-model="c.name" label="名称" placeholder="必填：物品名称" :disabled="c.state === 'confirmed'" />
          <van-cell v-if="c.evidence" title="识别依据" :label="c.evidence" />
          <van-cell v-if="c.warnings?.length" title="提示" :label="c.warnings.join('；')" />
          <van-checkbox v-model="c.sharePhotos" :disabled="c.state === 'confirmed'">
            关联整图（同库成员可见完整原图）
          </van-checkbox>
        </van-collapse-item>
      </van-collapse>
    </van-checkbox-group>

    <van-cell-group inset title="确认入库（勾选候选统一选择目标）" style="margin-top: 12px">
      <van-cell title="仓库" :value="spaceName || '必选'" is-link @click="openSpaces" />
      <van-cell title="位置" :value="locationName || '必选'" is-link @click="openLocations" />
    </van-cell-group>
    <div v-if="cat.state.error" class="pad">
      <p class="tip">{{ cat.state.error }}</p>
      <van-button block size="small" :loading="cat.state.loading" @click="cat.load()">重试</van-button>
    </div>
    <div v-else-if="cat.state.loaded && (!cat.state.spaces.length || !cat.state.locations.length)" class="pad">
      <p class="tip">
        {{ !cat.state.spaces.length ? '没有可见仓库：可能尚未加入任何库，或成员权限已被移除。请确认网页端的库成员权限。' : '该库还没有位置，请先在网页端创建位置' }}
      </p>
      <van-button block size="small" :loading="cat.state.loading" @click="cat.load()">刷新</van-button>
    </div>

    <div class="pad">
      <van-button block type="primary" :loading="confirming" :disabled="!checked.length" @click="confirm">
        确认入库 {{ checked.length }} 件
      </van-button>
    </div>

    <van-popup v-model:show="showSpace" position="bottom">
      <van-picker :columns="spaceOptions" @confirm="onSpace" @cancel="showSpace = false" />
    </van-popup>
    <van-popup v-model:show="showLocation" position="bottom">
      <van-picker :columns="locationOptions" @confirm="onLocation" @cancel="showLocation = false" />
    </van-popup>
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { ApiError, request, errorText, getOperationResult } from '../api';
import { useCatalog } from '../catalog';
import { pendingReview, successResult } from '../flow';
import type { AiCandidate, AiTask } from '../types';

interface Editable extends AiCandidate {
  sharePhotos: boolean;
}

const route = useRoute();
const router = useRouter();
const cat = useCatalog(true);
const loading = ref(true);
const loadError = ref('');
const confirming = ref(false);
const editable = ref<Editable[]>([]);
const checked = ref<string[]>([]);
const expanded = ref<string[]>([]);

const spaceId = ref('');
const locationId = ref('');
const spaceName = computed(() => cat.state.spaces.find((s) => s.id === spaceId.value)?.name ?? '');
const locationName = computed(() => cat.state.locations.find((l) => l.id === locationId.value)?.name ?? '');
const showSpace = ref(false);
const showLocation = ref(false);
// 每个候选一把幂等键：同一候选的重试复用，确认成功后销毁。
const confirmKeys = new Map<string, string>();
const spaceOptions = computed(() => cat.state.spaces.map((s) => ({ text: s.name, value: s.id })));
const locationOptions = computed(() => cat.state.locations.map((l) => ({ text: l.name, value: l.id })));

function pickDefaultSpace() {
  if (pendingReview.spaceId && cat.state.spaces.some((s) => s.id === pendingReview.spaceId)) {
    spaceId.value = pendingReview.spaceId;
  } else if (!spaceId.value && cat.state.spaces.length === 1) {
    spaceId.value = cat.state.spaces[0].id;
  }
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    // 候选以服务端为准：冷进本页时按任务 ID 重新拉取。
    if (pendingReview.task?.id === route.params.taskId) {
      editable.value = pendingReview.candidates.map((c) => ({ ...c, sharePhotos: true }));
    } else {
      const data = await request<{ task: AiTask; candidates: AiCandidate[] }>(
        `/api/v1/ai/tasks/${route.params.taskId}`,
      );
      editable.value = (data?.candidates ?? []).map((c) => ({ ...c, sharePhotos: true }));
    }
  } catch (e: any) {
    loadError.value = errorText(e, '任务加载失败');
  } finally {
    loading.value = false;
  }
}

function openSpaces() {
  if (cat.state.spaces.length) showSpace.value = true;
  else showToast(cat.state.error || '尚无可用仓库，请先在网页端创建');
}
function openLocations() {
  if (cat.state.locations.length) showLocation.value = true;
  else showToast(cat.state.error || '尚无可用位置，请先在网页端创建');
}

onMounted(() => {
  load();
  cat.load().then(pickDefaultSpace);
});

function onSpace({ selectedOptions }: any) {
  spaceId.value = selectedOptions[0]?.value ?? '';
  showSpace.value = false;
}
function onLocation({ selectedOptions }: any) {
  locationId.value = selectedOptions[0]?.value ?? '';
  showLocation.value = false;
}

// P10：确认的响应丢了（断网/5xx）时先按同一 operation_id 查服务端结果，有结果就直接算成功，
// 不重复提交；查不到才报失败，让用户决定是否用同一把键重试。
async function recoverConfirm(key: string): Promise<{ code: string; id: string } | null> {
  try {
    const r = await getOperationResult(key);
    if (r?.status === 'succeeded' && r.result) {
      const body = r.result?.data ?? r.result;
      const id = body?.item_id ?? '';
      const code = body?.public_code ?? '';
      if (id || code) return { code, id };
    }
  } catch {
    /* 查不到就按失败处理 */
  }
  return null;
}

async function confirm() {
  if (!spaceId.value || !locationId.value) {
    showToast('请选择仓库和位置');
    return;
  }
  const targets = editable.value.filter((c) => checked.value.includes(c.id) && c.state !== 'confirmed');
  for (const c of targets) {
    if (!c.name.trim()) {
      showToast('存在未命名候选，请补全名称');
      expanded.value = [c.id];
      return;
    }
  }
  confirming.value = true;
  const codes: string[] = [];
  const itemIds: string[] = [];
  const failed: string[] = [];
  for (const c of targets) {
    try {
      let key = confirmKeys.get(c.id);
      if (!key) {
        key = crypto.randomUUID();
        confirmKeys.set(c.id, key);
      }
      const res = await request<any>(`/api/v1/ai/candidates/${c.id}/confirm`, {
        method: 'POST',
        idempotencyKey: key,
        body: {
          space_id: spaceId.value,
          location_id: locationId.value,
          name: c.name.trim(),
          fields: c.fields ?? {},
          photo_ids: c.sharePhotos ? c.source_image_ids : [],
        },
      });
      // 契约：data {item_id, public_code, movement_id}，没有嵌套 item。
      codes.push(res?.public_code ?? '');
      if (res?.item_id) itemIds.push(res.item_id);
      c.state = 'confirmed';
      confirmKeys.delete(c.id);
    } catch (e: any) {
      // 409 不自动重试；但先查 operation-results，可能是「已提交、响应丢失」。
      const lost =
        e instanceof TypeError || (e instanceof ApiError && (e.status >= 500 || e.code === 'IDEMPOTENCY_CONFLICT'));
      const recovered = lost ? await recoverConfirm(confirmKeys.get(c.id) as string) : null;
      if (recovered) {
        codes.push(recovered.code);
        if (recovered.id) itemIds.push(recovered.id);
        c.state = 'confirmed';
        confirmKeys.delete(c.id);
        continue;
      }
      failed.push(`${c.name}：${errorText(e, '确认失败')}`);
    }
  }
  confirming.value = false;
  if (codes.length) {
    successResult.codes = codes;
    successResult.itemIds = itemIds;
    if (failed.length) showToast(`部分失败：${failed.join('；')}`);
    router.replace('/success');
  } else {
    showToast(`全部失败：${failed.join('；') || '未知错误'}`);
  }
}
</script>

<style scoped>
.center {
  display: block;
  margin: 40px auto;
}
.pad {
  padding: 16px;
}
.tip {
  color: #969799;
  font-size: 13px;
  margin-bottom: 8px;
}
</style>
