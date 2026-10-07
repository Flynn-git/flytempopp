import { defineConfig } from 'vite';

export default defineConfig({
  // Port must match an Authorized JavaScript origin on the Google OAuth client.
  server: { port: 5173, strictPort: true },
});
