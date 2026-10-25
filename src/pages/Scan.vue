<template>
  <van-nav-bar title="扫码" left-arrow @click-left="router.back()" />
  <div class="pad">
    <van-button block type="primary" icon="scan" :loading="busy" @click="scan">扫描 KLM1 码</van-button>
    <van-divider>或手动输入</van-divider>
    <van-field v-model="manual" placeholder="KLM1:xxxx:I:xxxxxxxxxx" />
    <van-button block style="margin-top: 12px" :loading="busy" @click="resolve(manual)">解析</van-button>
    <p v-if="lastError" class="err">{{ lastError }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { Capacitor } from '@capacitor/core';
import { CapacitorBarcodeScanner } from '@capacitor/barcode-scanner';
import { request, errorText } from '../api';
import type { ResolveResult } from '../types';

const router = useRouter();
const busy = ref(false);
const manual = ref('');
const lastError = ref('');

async function scan() {
  if (!Capacitor.isNativePlatform()) {
    showToast('浏览器环境请手动输入码内容');
    return;
  }
  busy.value = true;
  try {
    const res = await CapacitorBarcodeScanner.scanBarcode({ hint: 2, scanInstructions: '对准 KLM1 二维码' });
    if (!res.ScanResult) return;
    await resolve(res.ScanResult);
  } catch (e: any) {
    if (!/cancel/i.test(e?.message ?? '')) showToast(`扫码失败：${e.message ?? e}`);
  } finally {
    busy.value = false;
  }
}

async function resolve(raw: string) {
  if (!raw) return;
  busy.value = true;
  lastError.value = '';
  try {
    const data = await request<ResolveResult>('/api/v1/codes/resolve', { query: { value: raw } });
    // 服务端明确说「这不是编码」：引导去搜物品名，别报成权限问题。
    if (data.is_code === false) {
      lastError.value = '这不是物品编码，请用搜索';
      return;
    }
    // 位置码：位置目录是实例级共享数据，管理页只在网页端（/bases），客户端不跳转也不用物品文案糊弄。
    if (data.resolved?.kind === 'location') {
      const r = data.resolved;
      const who = [r.name, r.subtitle ? `（${r.subtitle}）` : ''].join('');
      lastError.value = `这是位置码：${who}，位置管理请在网页端操作`;
      return;
    }
    const itemId = data.resolved?.object_id ?? data.resolved?.item_id ?? (data.resolved?.kind === 'item' ? data.resolved.id : undefined);
    if (itemId) {
      router.replace(`/items/${itemId}`);
    } else {
      // 兼容两种情况：服务端尚未接解析器（resolved 恒空）或码真的找不到；文案不甩锅给权限。
      lastError.value = '未找到可访问的物品：请确认码没抄错，或该物品不在当前实例';
    }
  } catch (e: any) {
    // 统一走 errorText：断网是 TypeError，不能把 "Failed to fetch" 直接丢给用户。
    lastError.value = errorText(e, '解析失败');
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.pad {
  padding: 16px;
}
.err {
  color: #ee0a24;
  font-size: 13px;
  margin-top: 12px;
}
</style>
