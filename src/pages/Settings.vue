<template>
  <van-nav-bar title="服务器设置" />
  <van-cell-group inset title="服务器地址">
    <van-field
      v-model="addr"
      label="地址"
      placeholder="https://nas.example.com 或 http://192.168.1.10:18081"
      :rules="[{ required: true, message: '请输入服务器地址' }]"
    />
  </van-cell-group>
  <p class="tip">
    仅保存连接地址；登录令牌只保存在内存，不写入本机存储。受信内网可选 HTTP，默认建议 HTTPS。
  </p>
  <div class="actions">
    <van-button block type="primary" :loading="testing" @click="saveAndTest">保存并测试连接</van-button>
    <van-button v-if="session.token" block style="margin-top: 12px" @click="back">返回</van-button>
  </div>
  <van-cell-group v-if="info" inset title="实例信息">
    <van-cell title="实例 ID" :value="info.instance_id" />
    <van-cell title="API 版本" :value="info.api_version" />
    <van-cell title="初始化状态" :value="info.initialized ? '已初始化' : '未初始化'" />
  </van-cell-group>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { session, setBaseUrl } from '../store';
import { request, errorText } from '../api';
import type { SystemInfo } from '../types';

const router = useRouter();
const addr = ref(session.baseUrl);
const testing = ref(false);
const info = ref<SystemInfo | null>(null);

async function saveAndTest() {
  if (!addr.value) {
    showToast('请输入服务器地址');
    return;
  }
  if (!/^https?:\/\//.test(addr.value)) {
    showToast('地址需以 http:// 或 https:// 开头');
    return;
  }
  testing.value = true;
  try {
    setBaseUrl(addr.value);
    info.value = await request<SystemInfo>('/api/v1/system/info');
    showToast('连接成功');
    if (session.token) router.back();
    else router.replace('/login');
  } catch (e: any) {
    showToast(`连接失败：${errorText(e, '无法连接该地址')}`);
  } finally {
    testing.value = false;
  }
}

function back() {
  router.back();
}
</script>

<style scoped>
.tip {
  padding: 8px 24px;
  color: #969799;
  font-size: 12px;
}
.actions {
  padding: 16px;
}
</style>
