import './styles/design-system.css';
import 'leaflet/dist/leaflet.css';
// Import Leaflet patches to fix zoom animation errors
import './leaflet-patch';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createHead } from '@vueuse/head';
import App from './App.vue';
import router from './router';

const head = createHead();
const pinia = createPinia();

createApp(App).use(pinia).use(router).use(head).mount('#app');

if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js').catch((error: Error) => {
			console.warn('[ServiceWorker] Registration failed', error);
		});
	});
}
