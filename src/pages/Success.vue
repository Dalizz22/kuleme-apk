<template>
  <van-nav-bar title="入库成功" />
  <div class="center">
    <van-icon name="checked" color="#07c160" size="64" />
    <h3>已确认入库 {{ successResult.codes.length }} 件</h3>
    <van-cell-group inset>
      <van-cell v-for="(code, i) in successResult.codes" :key="i" title="物品编码" :value="code" />
    </van-cell-group>
    <div class="pad">
      <van-button block type="primary" @click="router.replace('/capture')">继续拍照入库</van-button>
      <van-button
        v-if="successResult.itemIds.length === 1"
        block
        plain
        style="margin-top: 12px"
        @click="router.replace(`/items/${successResult.itemIds[0]}`)"
      >
        查看物品
      </van-button>
      <van-button block plain style="margin-top: 12px" @click="router.replace('/home')">回到首页</van-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { successResult } from '../flow';

const router = useRouter();
</script>

<style scoped>
.center {
  text-align: center;
  padding-top: 48px;
}
.pad {
  padding: 16px;
}
</style>
