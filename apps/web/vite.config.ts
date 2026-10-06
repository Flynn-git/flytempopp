import { defineConfig } from 'vite';

export default defineConfig({
  // Port must match the dev origin the connector allows (apps/connector/origins.json).
  server: { port: 5173, strictPort: true },
});
