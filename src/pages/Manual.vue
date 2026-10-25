<template>
  <van-nav-bar title="手动建档" left-arrow @click-left="router.back()" />
  <van-form @submit="submit">
    <van-cell-group inset>
      <van-field v-model="name" label="名称" placeholder="必填" :rules="[{ required: true, message: '请输入名称' }]" />
      <van-cell title="仓库" :value="spaceName || '必选'" is-link @click="openSpaces" />
      <van-cell title="位置" :value="locationName || '必选'" is-link @click="openLocations" />
      <van-field v-model="note" label="备注" type="textarea" autosize placeholder="可空" />
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
      <van-button block type="primary" native-type="submit" :loading="busy">建档入库</van-button>
    </div>
  </van-form>
  <van-popup v-model:show="showSpace" position="bottom">
    <van-picker :columns="spaceOptions" @confirm="onSpace" @cancel="showSpace = false" />
  </van-popup>
  <van-popup v-model:show="showLocation" position="bottom">
    <van-picker :columns="locationOptions" @confirm="onLocation" @cancel="showLocation = false" />
  </van-popup>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { request, errorText } from '../api';
import { useCatalog } from '../catalog';
import { successResult } from '../flow';
import type { ItemView } from '../types';

const router = useRouter();
const cat = useCatalog(true);
const name = ref('');
const note = ref('');
const busy = ref(false);
const spaceId = ref('');
const locationId = ref('');
const showSpace = ref(false);
const showLocation = ref(false);
const spaceName = computed(() => cat.state.spaces.find((s) => s.id === spaceId.value)?.name ?? '');
const locationName = computed(() => cat.state.locations.find((l) => l.id === locationId.value)?.name ?? '');
const spaceOptions = computed(() => cat.state.spaces.map((s) => ({ text: s.name, value: s.id })));
const locationOptions = computed(() => cat.state.locations.map((l) => ({ text: l.name, value: l.id })));

// 一次建档流程一把幂等键：建档带初始位置/数量由服务端同事务写库存（不再补发库存命令），
// 重试复用同一把键，成功后换新。
let createKey = '';

onMounted(() => {
  cat.load();
});

function openSpaces() {
  if (cat.state.spaces.length) showSpace.value = true;
  else showToast(cat.state.error || '尚无可用仓库，请先在网页端创建');
}
function openLocations() {
  if (cat.state.locations.length) showLocation.value = true;
  else showToast(cat.state.error || '尚无可用位置，请先在网页端创建');
}

function onSpace({ selectedOptions }: any) {
  spaceId.value = selectedOptions[0]?.value ?? '';
  showSpace.value = false;
}
function onLocation({ selectedOptions }: any) {
  locationId.value = selectedOptions[0]?.value ?? '';
  showLocation.value = false;
}

async function submit() {
  if (!spaceId.value || !locationId.value) {
    showToast('请选择仓库和位置');
    return;
  }
  busy.value = true;
  try {
    createKey ||= crypto.randomUUID();
    // 建档 + 初始库存一次提交：服务端在同一事务里落库，失败整体回滚，不留零库存半成品。
    const item = await request<ItemView>('/api/v1/items', {
      method: 'POST',
      idempotencyKey: createKey,
      body: {
        space_id: spaceId.value,
        name: name.value.trim(),
        note: note.value || undefined,
        initial_location_id: locationId.value,
        initial_quantity: '1',
      },
    });
    createKey = '';
    successResult.codes = [item.public_code];
    successResult.itemIds = [item.id];
    router.replace('/success');
  } catch (e: any) {
    showToast(errorText(e, '建档失败'));
  } finally {
    busy.value = false;
  }
}
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
