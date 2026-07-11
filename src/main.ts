import { createApp } from 'vue';
import './styles/fonts.css';
import './styles/overlays.css';
import App from './App.vue';
import { removeLegacyPwaState } from './services/removeLegacyPwaState';

createApp(App).mount('#app');

if (import.meta.env.PROD) {
  void removeLegacyPwaState(import.meta.env.BASE_URL).catch(() => undefined);
}
