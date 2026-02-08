import 'leaflet/dist/leaflet.css';
// Import Leaflet patches to fix zoom animation errors
import './leaflet-patch.js';
import { createApp } from 'vue'
import { createHead } from '@vueuse/head'
import App from './App.vue'
import router from './router'

const head = createHead()

createApp(App).use(router).use(head).mount('#app')
