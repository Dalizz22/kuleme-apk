<template>
  <van-nav-bar title="库了么" />
  <div class="brand">
    <h2>库了么</h2>
    <p v-if="probe">实例 {{ probe.instance_id.slice(0, 8) }} · API {{ probe.api_version }}</p>
    <p v-if="probe && !probe.initialized" class="warn">服务端尚未初始化，请先在 Web 端完成初始化</p>
  </div>
  <van-form @submit="login">
    <van-cell-group inset>
      <van-field v-model="username" name="username" label="账号" placeholder="用户名" :rules="[{ required: true, message: '请输入账号' }]" />
      <van-field v-model="password" type="password" name="password" label="密码" placeholder="密码" :rules="[{ required: true, message: '请输入密码' }]" />
    </van-cell-group>
    <div class="actions">
      <van-button block round type="primary" native-type="submit" :loading="loading">登录</van-button>
      <van-button block round plain style="margin-top: 12px" @click="router.push('/settings')">服务器设置</van-button>
    </div>
  </van-form>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { session } from '../store';
import { request, errorText, ApiError } from '../api';
import type { SessionUser } from '../store';
import type { SystemInfo } from '../types';

const router = useRouter();
const username = ref('');
const password = ref('');
const loading = ref(false);
const probe = ref<SystemInfo | null>(null);

onMounted(async () => {
  try {
    probe.value = await request<SystemInfo>('/api/v1/system/info');
    session.instanceId = probe.value.instance_id;
    session.initialized = probe.value.initialized;
  } catch (e: any) {
    showToast(`初始化探测失败：${errorText(e, '网络连接失败')}`);
  }
});

async function login() {
  loading.value = true;
  try {
    const data = await request<{ token: string; user: SessionUser }>('/api/v1/sessions', {
      method: 'POST',
      body: { username: username.value, password: password.value },
    });
    session.token = data.token;
    session.user = data.user;
    router.replace('/home');
  } catch (e: any) {
    // 登录页的 401 是「账号或密码错误」，不是会话失效；errorText 的 401 文案面向已登录页面，
    // 这里用服务端原文，和 Web LoginView 同口径。
    showToast(e instanceof ApiError && e.status === 401 ? e.message || '账号或密码错误' : errorText(e, '登录失败'));
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.brand {
  text-align: center;
  padding: 32px 0 16px;
  color: #323233;
}
.brand p {
  color: #969799;
  font-size: 12px;
}
.warn {
  color: #ee0a24 !important;
}
.actions {
  padding: 16px;
}
</style>
