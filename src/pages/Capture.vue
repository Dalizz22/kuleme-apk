<template>
  <van-nav-bar title="拍照入库" left-arrow @click-left="router.back()" />
  <div class="pad">
    <van-button block type="primary" icon="photograph" :disabled="busy" @click="takePhoto">拍照</van-button>
    <van-button
      block
      icon="photo-o"
      style="margin-top: 12px"
      :disabled="busy || remaining <= 0"
      @click="pickImages"
    >
      从相册选择（最多 {{ maxImages }} 张，已选 {{ shots.length }}）
    </van-button>
    <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden @change="onFiles" />
  </div>

  <van-cell-group inset title="入库目标">
    <van-cell title="仓库" :value="spaceName || '必选'" is-link @click="openSpaces" />
  </van-cell-group>
  <div v-if="cat.state.error" class="pad">
    <p class="tip">{{ cat.state.error }}</p>
    <van-button block size="small" :loading="cat.state.loading" @click="cat.load()">重试</van-button>
  </div>
  <div v-else-if="cat.state.loaded && !cat.state.spaces.length" class="pad">
    <p class="tip">没有可见仓库：可能尚未加入任何库，或成员权限已被移除。请确认网页端的库成员权限。</p>
    <van-button block size="small" :loading="cat.state.loading" @click="cat.load()">刷新</van-button>
  </div>
  <van-popup v-model:show="showSpace" position="bottom">
    <van-picker :columns="spaceOptions" @confirm="onSpace" @cancel="showSpace = false" />
  </van-popup>

  <van-grid v-if="shots.length" :column-num="4" :gutter="4" class="pad">
    <van-grid-item v-for="(s, i) in shots" :key="i">
      <van-image :src="s.preview" fit="cover" width="100%" height="72px" radius="4" />
    </van-grid-item>
  </van-grid>

  <div v-if="shots.length" class="pad">
    <van-button block type="primary" :loading="busy" @click="submit">上传并识别（{{ shots.length }} 张）</van-button>
    <van-button block plain style="margin-top: 8px" :disabled="busy" @click="reset">清空重选</van-button>
  </div>

  <van-divider v-if="aiFailed">识别未能完成</van-divider>
  <div v-if="aiFailed" class="pad">
    <p class="tip">{{ aiFailReason }}</p>
    <van-button v-if="pendingOp.current" block :loading="busy" @click="checkServerResult">
      查询服务端结果
    </van-button>
    <van-button
      block
      type="warning"
      style="margin-top: 8px"
      :loading="busy"
      :disabled="!shots.length"
      @click="submit"
    >
      重试识别（复用本次上传）
    </van-button>
    <van-button block plain style="margin-top: 8px" @click="goManual">改为手动建档</van-button>
    <van-button v-if="pendingOp.current" block plain style="margin-top: 8px" @click="abandonOp()">
      放弃本次操作（下次用新操作 ID）
    </van-button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraSource, CameraResultType } from '@capacitor/camera';
import type { Photo } from '@capacitor/camera';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { ApiError, request, uploadFile, deleteFile, errorText, loadMaxImages, getOperationResult, DEFAULT_MAX_IMAGES } from '../api';
import { useCatalog } from '../catalog';
import { beginOp, clearOp, pendingOp, pendingReview, setOp } from '../flow';
import type { PendingOp } from '../flow';
import type { AiCandidate, AiTask } from '../types';

const router = useRouter();
const cat = useCatalog(false);
const fileInput = ref<HTMLInputElement>();
const busy = ref(false);
const aiFailed = ref(false);
const aiFailReason = ref('');

interface Shot {
  blob: Blob;
  preview: string;
  fileName: string;
  // 上传成功后的 file id：重试复用，避免同一批照片重复上传出孤儿文件。
  fileId?: string;
}
const shots = ref<Shot[]>([]);

// 上限来自服务端 GET /ai/settings（读不到回退 8），每次进页重读以同步服务端改动。
const maxImages = ref(DEFAULT_MAX_IMAGES);
const remaining = computed(() => Math.max(0, maxImages.value - shots.value.length));

// 目标仓库：POST /ai/tasks 的 space_id 必填（服务端契约）。
const spaceId = ref('');
const showSpace = ref(false);
const spaceName = computed(() => cat.state.spaces.find((s) => s.id === spaceId.value)?.name ?? '');
const spaceOptions = computed(() => cat.state.spaces.map((s) => ({ text: s.name, value: s.id })));

function onSpace({ selectedOptions }: any) {
  spaceId.value = selectedOptions[0]?.value ?? '';
  showSpace.value = false;
}

function openSpaces() {
  if (cat.state.spaces.length) {
    showSpace.value = true;
    return;
  }
  showToast(cat.state.error || '尚无可用仓库，请先在网页端创建');
  if (!cat.state.loading) cat.load();
}

// 一次提交批次一把幂等键：失败后重试复用，成功后换新的。
let submitKey = '';

function isNative() {
  return Capacitor.isNativePlatform();
}

async function photoToShot(p: Pick<Photo, 'webPath' | 'format'>): Promise<Shot> {
  if (p.webPath) {
    const resp = await fetch(p.webPath);
    const blob = await resp.blob();
    return { blob, preview: p.webPath, fileName: `photo-${Date.now()}.${p.format || 'jpeg'}` };
  }
  throw new Error('拍照结果为空');
}

function overLimitMessage(ignored: number) {
  return `最多 ${maxImages.value} 张，超出 ${ignored} 张已忽略`;
}

async function takePhoto() {
  // 第 N+1 张在选择阶段拦截（不等到提交后才 422）。
  if (remaining.value <= 0) {
    showToast(overLimitMessage(1));
    return;
  }
  try {
    const p = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 85,
    });
    shots.value.push(await photoToShot(p));
  } catch (e: any) {
    if (!/cancel/i.test(e?.message ?? '')) showToast(`拍照失败：${errorText(e, '未知错误')}`);
  }
}

async function pickImages() {
  if (remaining.value <= 0) {
    showToast(overLimitMessage(1));
    return;
  }
  if (!isNative()) {
    fileInput.value?.click();
    return;
  }
  try {
    const res = await Camera.pickImages({ limit: remaining.value, quality: 85 });
    const take = res.photos.slice(0, remaining.value);
    for (const p of take) shots.value.push(await photoToShot(p));
    if (res.photos.length > take.length) showToast(overLimitMessage(res.photos.length - take.length));
  } catch (e: any) {
    if (!/cancel/i.test(e?.message ?? '')) showToast(`选图失败：${errorText(e, '未知错误')}`);
  }
}

function onFiles(ev: Event) {
  const files = Array.from((ev.target as HTMLInputElement).files ?? []);
  const take = files.slice(0, remaining.value);
  for (const f of take) {
    shots.value.push({ blob: f, preview: URL.createObjectURL(f), fileName: f.name });
  }
  if (files.length > take.length) showToast(overLimitMessage(files.length - take.length));
  (ev.target as HTMLInputElement).value = '';
}

function reset() {
  for (const s of shots.value) {
    if (s.preview.startsWith('blob:')) URL.revokeObjectURL(s.preview);
  }
  shots.value = [];
  aiFailed.value = false;
  // 已上传的文件仍挂在本次 operation 上：重试复用 fileId，不用重新上传。
}

function onTaskCreated(task: AiTask, candidates: AiCandidate[], op: PendingOp) {
  clearOp();
  pendingReview.task = task;
  pendingReview.candidates = candidates ?? [];
  pendingReview.spaceId = op.spaceId;
  router.replace(`/review/${task.id}`);
}

async function submit() {
  if (!spaceId.value) {
    showToast(cat.state.spaces.length ? '请先选择入库仓库' : '尚无可用仓库，请先在网页端创建');
    return;
  }
  busy.value = true;
  aiFailed.value = false;
  // 稳定 operation_id：本次识别的上传、创建任务、重试全部复用它。
  const op = beginOp(spaceId.value);
  try {
    // 只上传还没上传成功的照片：失败重试复用已有 file id，不产生第二份不可追踪上传。
    for (const s of shots.value) {
      if (!s.fileId) s.fileId = (await uploadFile(s.blob, s.fileName, op.opId)).id;
    }
    op.fileIds = shots.value.map((s) => s.fileId as string);
    setOp({ ...op });
    const data = await request<{ task: AiTask; candidates: AiCandidate[] }>('/api/v1/ai/tasks', {
      method: 'POST',
      body: { file_ids: op.fileIds, space_id: op.spaceId },
      idempotencyKey: op.opId,
    });
    onTaskCreated(data.task, data.candidates ?? [], op);
  } catch (e: any) {
    await explainFailure(e, op);
  } finally {
    busy.value = false;
  }
}

// 失败后不本地猜成功：先看这个 operation_id 在服务端是否已有结果，再决定提示与重试。
async function explainFailure(e: any, op: PendingOp) {
  const conflict = e instanceof ApiError && (e.code === 'IDEMPOTENCY_CONFLICT' || e.status === 409);
  const lostResponse = e instanceof TypeError || (e instanceof ApiError && e.status >= 500);
  if (conflict || lostResponse) {
    const done = await checkServerResult(true);
    if (done) return;
    if (conflict) {
      // 同键不同内容：服务端不认这次提交，换新操作 ID 让用户重新提交。
      clearOp();
      aiFailReason.value = '操作已用不同内容提交（409）。已重置本次操作，请确认照片与仓库后重新提交。';
      aiFailed.value = true;
      return;
    }
  }
  if (conflict) {
    aiFailReason.value = errorText(e, '操作已用不同内容提交');
  } else {
    // 409 以外的错误不自动重试；保留 operation_id，用户点重试时复用同一把键。
    aiFailReason.value = errorText(e, '识别请求失败');
  }
  aiFailed.value = true;
}

// 查询 /operation-results/:operation_id：succeeded 直接进确认页，in_progress 等用户再查，
// failed/未登记 保留操作让重试复用同一操作 ID。
async function checkServerResult(silent = false): Promise<boolean> {
  const op = pendingOp.current;
  if (!op) return false;
  if (!silent) busy.value = true;
  try {
    const r = await getOperationResult(op.opId);
    if (!r) {
      if (!silent) {
        aiFailReason.value = '服务端没有登记这次操作（可能没提交成功）。可重试：重试复用同一操作 ID，不会重复建任务。';
        aiFailed.value = true;
      }
      return false;
    }
    if (r.status === 'succeeded') {
      const body = r.result?.data ?? r.result;
      const task: AiTask | undefined = body?.task;
      if (task?.id) {
        onTaskCreated(task, body?.candidates ?? [], op);
        return true;
      }
      clearOp();
      aiFailReason.value = '服务端已完成本次操作，但没有返回可打开的任务；请到物品列表核对结果。';
      aiFailed.value = true;
      return false;
    }
    if (r.status === 'failed') {
      aiFailReason.value = `服务端判定本次操作失败：${r.error_code || '未知原因'}。可重试（复用同一操作 ID）。`;
      aiFailed.value = true;
      return false;
    }
    aiFailReason.value = '服务端仍在处理本次操作，请稍后再查询；不要重复提交。';
    aiFailed.value = true;
    return false;
  } catch (e: any) {
    if (!silent) {
      aiFailReason.value = errorText(e, '查询操作结果失败');
      aiFailed.value = true;
    }
    return false;
  } finally {
    if (!silent) busy.value = false;
  }
}

// 放弃本次操作：清掉未关联上传，避免留孤儿文件；已关联的删不掉（409）由服务端保留。
async function abandonOp(silent = false) {
  const fileIds = pendingOp.current?.fileIds ?? [];
  clearOp();
  aiFailed.value = false;
  if (!silent) showToast('已放弃本次操作，下次提交使用新的操作 ID');
  await Promise.all(fileIds.map((f) => deleteFile(f)));
}

function goManual() {
  void abandonOp(true);
  router.push('/manual');
}

let restoreHandle: PluginListenerHandle | undefined;
onMounted(async () => {
  cat.load();
  loadMaxImages().then((n) => (maxImages.value = n));
  // 上次提交结果未知（断网/进程被系统回收）：进页就按同一 operation_id 查服务端结果，
  // 有结果直接进确认页，没有才让用户重试——绝不重新提交去猜。
  const op = pendingOp.current;
  if (op) {
    spaceId.value = op.spaceId;
    aiFailReason.value = '上次识别提交结果未知，正在向服务端确认…';
    aiFailed.value = true;
    checkServerResult(true);
  }
  if (!isNative()) return;
  // 相机导致系统回收进程时，从恢复结果取回照片继续流程。
  restoreHandle = await App.addListener('appRestoredResult', async (res) => {
    const p = res.data as Photo | undefined;
    if (!p?.webPath) return;
    if (remaining.value <= 0) {
      showToast(overLimitMessage(1));
      return;
    }
    try {
      shots.value.push(await photoToShot(p));
    } catch {
      /* 恢复失败不阻断 */
    }
  });
});
onBeforeUnmount(() => restoreHandle?.remove());
</script>

<style scoped>
.pad {
  padding: 16px;
}
.tip {
  color: #969799;
  font-size: 13px;
  margin-bottom: 8px;
}
</style>
