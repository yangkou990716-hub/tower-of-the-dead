import './ui/style.css';
import { App } from './app/app';

App.boot().catch((e) => {
  console.error(e);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:2em;color:#e9e1cf;background:#0b0e12;font:16px serif;text-align:center';
  d.textContent = '遊戲無法啟動：' + (e?.message || e) + '。請重新整理；若持續發生，請更新瀏覽器。';
  document.body.appendChild(d);
});
