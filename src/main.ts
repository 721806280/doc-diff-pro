import { createApp } from 'vue';
import './styles/fonts.css';
import './styles/overlays.css';
import App from './App.vue';

createApp(App).mount('#app');

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=${__BUILD_ID__}`, {
      scope: import.meta.env.BASE_URL
    }).catch((error) => console.warn('[Service worker registration failed]', error));
  }, { once: true });
}
