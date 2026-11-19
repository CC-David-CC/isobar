import { mount } from './app.mjs';
const app = mount(document.getElementById('app'));
addEventListener('pagehide', () => app.dispose(), { once: true });
