import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({
  publicDir:false,
  define:{'process.env.NODE_ENV':'"production"'},
  build:{
    outDir:'dist',emptyOutDir:false,
    lib:{entry:fileURLToPath(new URL('./src/widget-entry.jsx',import.meta.url)),formats:['es'],fileName:() => 'widget-app.js'},
    rollupOptions:{output:{inlineDynamicImports:true}}
  }
});
