<template>
  <van-nav-bar title="物品" left-arrow @click-left="router.back()" />
  <van-search v-model="keyword" placeholder="搜索名称 / 编码" @search="reload" />
  <div v-if="error" class="pad">
    <p class="sub">{{ error }}</p>
    <van-button block size="small" :loading="loading" @click="reload">重试</van-button>
  </div>
  <van-list v-model:loading="loading" :finished="finished" :finished-text="items.length ? '没有更多了' : ''" @load="loadMore">
    <van-cell
      v-for="it in items"
      :key="it.id"
      is-link
      @click="router.push(`/items/${it.id}`)"
    >
      <template #title>
        <div class="row">
          <van-image
            v-if="thumbs[it.id]"
            :src="thumbs[it.id]"
            width="48"
            height="48"
            fit="cover"
            radius="4"
            @click.stop="preview(it)"
          />
          <div class="meta">
            <div>{{ it.name }}</div>
            <div class="sub">{{ it.public_code }} · {{ it.location_path || '未设置位置' }}</div>
          </div>
          <van-tag :type="statusType(it.status)">{{ statusText(it.status) }}</van-tag>
        </div>
      </template>
    </van-cell>
  </van-list>
  <!-- 空态：搜索无结果 / 一件物品都没有时，只有「没有更多了」会让人以为没加载完。 -->
  <van-empty
    v-if="!loading && !error && finished && items.length === 0"
    :description="keyword ? '没有匹配的物品' : '还没有物品'"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { showImagePreview } from 'vant';
import { request, photoUrl, errorText } from '../api';
import { statusText, type ItemView, type Paged } from '../types';

const router = useRouter();
const keyword = ref('');
const items = ref<ItemView[]>([]);
const loading = ref(false);
const finished = ref(false);
const page = ref(0);
const thumbs = ref<Record<string, string>>({});
const error = ref('');

async function loadMore() {
  error.value = '';
  try {
    const data = await request<Paged<ItemView>>('/api/v1/items', {
      query: { keyword: keyword.value, page: page.value + 1, page_size: 20 },
    });
    items.value.push(...(data.items ?? []));
    page.value = data.page;
    finished.value = items.value.length >= data.total;
    for (const it of data.items ?? []) {
      if (it.photo_file_id && !thumbs.value[it.id]) {
        photoUrl(it.photo_file_id, true)
          .then((u) => (thumbs.value[it.id] = u))
          .catch(() => {});
      }
    }
  } catch (e: any) {
    // 失败必须落终态：否则 van-list 会立刻再触发 @load，变成无限重试的转圈。
    error.value = errorText(e, '物品列表加载失败');
    finished.value = true;
  } finally {
    loading.value = false;
  }
}

function reload() {
  items.value = [];
  page.value = 0;
  finished.value = false;
  loading.value = true;
  loadMore();
}

async function preview(it: ItemView) {
  if (!it.photo_file_id) return;
  const u = await photoUrl(it.photo_file_id);
  showImagePreview({ images: [u] });
}

function statusType(s: string): 'primary' | 'warning' | 'danger' | 'success' | 'default' {
  if (s === 'sold' || s === 'maintenance') return 'warning';
  if (s === 'scrapped' || s === 'lost') return 'danger';
  if (s === 'pending_stock') return 'default';
  return 'primary';
}
</script>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.meta {
  flex: 1;
  min-width: 0;
}
.sub {
  color: #969799;
  font-size: 12px;
}
.pad {
  padding: 12px 16px;
}
</style>
