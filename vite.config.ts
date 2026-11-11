import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5001,
  },
  preview: {
    host: '127.0.0.1',
    port: 5001,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
