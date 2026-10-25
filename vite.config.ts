import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    proxy: {
      '/api/v1': {
        target: 'http://localhost:18081',
        changeOrigin: true,
      },
    },
  },
});
