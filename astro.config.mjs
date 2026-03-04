// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  server: {
    allowedHosts: true
  },
  vite: {
    ssr: {
      noExternal: ['three']
    },
    optimizeDeps: {
      include: ['three']
    }
  }
});