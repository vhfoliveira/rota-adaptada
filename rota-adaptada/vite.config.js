import {defineConfig} from 'vite';
import {pwaBuild} from './pwa-build.js';
export default defineConfig({plugins:[pwaBuild()],base:'./',build:{target:'es2022'},worker:{format:'es'},server:{host:'127.0.0.1',port:5178}});
