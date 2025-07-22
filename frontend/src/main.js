import 'leaflet/dist/leaflet.css';
// Import Leaflet patches to fix zoom animation errors
import './leaflet-patch.js';
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

createApp(App).use(router).mount('#app')
