<template>
  <van-nav-bar title="库了么">
    <template #right>
      <van-icon name="setting-o" size="20" @click="router.push('/settings')" />
    </template>
  </van-nav-bar>
  <div class="hero">
    <van-button class="big" type="primary" round size="large" icon="photograph" @click="router.push('/capture')">
      拍照入库
    </van-button>
    <p class="sub">拍照/选图 → AI 识别 → 人工审核 → 确认入库</p>
  </div>
  <van-grid :column-num="3" clickable>
    <van-grid-item icon="orders-o" text="物品" @click="router.push('/items')" />
    <van-grid-item icon="scan" text="扫码" @click="router.push('/scan')" />
    <van-grid-item icon="edit" text="手动建档" @click="router.push('/manual')" />
  </van-grid>
  <div class="footer">
    <p>{{ session.user?.display_name || session.user?.username }}</p>
    <van-button size="small" plain type="danger" @click="logout">退出登录</van-button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { session, clearSession } from '../store';
import { request, revokePhotos } from '../api';

const router = useRouter();

async function logout() {
  try {
    await request('/api/v1/sessions/current', { method: 'DELETE' });
  } catch {
    // 注销失败也清本地内存
  }
  clearSession();
  revokePhotos();
  router.replace('/login');
}
</script>

<style scoped>
.hero {
  padding: 40px 24px 24px;
  text-align: center;
}
.big {
  height: 64px;
  font-size: 20px;
}
.sub {
  margin-top: 12px;
  color: #969799;
  font-size: 12px;
}
.footer {
  padding: 32px;
  text-align: center;
  color: #969799;
}
</style>
