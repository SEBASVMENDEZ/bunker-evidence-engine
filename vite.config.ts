import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run movil` sirve por HTTPS en la red local para poder usar la cámara desde el teléfono.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'movil' ? [basicSsl()] : [])],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
}));
