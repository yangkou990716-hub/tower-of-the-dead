// 產生 PWA 圖示（提燈）。用法：node scripts/gen-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
mkdirSync('public/icons', { recursive: true });
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
 <radialGradient id="bg" cx="50%" cy="56%" r="70%"><stop offset="0" stop-color="#27404a"/><stop offset=".55" stop-color="#121a22"/><stop offset="1" stop-color="#090c10"/></radialGradient>
 <radialGradient id="gl" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe2a6" stop-opacity=".95"/><stop offset=".35" stop-color="#f3b95f" stop-opacity=".5"/><stop offset="1" stop-color="#f3b95f" stop-opacity="0"/></radialGradient>
 <linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff9a3d"/><stop offset=".6" stop-color="#ffd98a"/><stop offset="1" stop-color="#fff6dc"/></linearGradient>
</defs>
<rect width="512" height="512" fill="url(#bg)"/>
<g transform="translate(256 262) scale(${pad}) translate(-256 -262)">
 <circle cx="256" cy="282" r="210" fill="url(#gl)"/>
 <path d="M256 78 a34 34 0 0 1 34 34 h-16 a18 18 0 0 0 -36 0 h-16 a34 34 0 0 1 34 -34z" fill="#c9a25a"/>
 <rect x="244" y="110" width="24" height="26" rx="4" fill="#8a6a34"/>
 <path d="M178 150 q78 -34 156 0 l-14 26 h-128z" fill="#c9a25a"/>
 <path d="M190 176 h132 l22 176 h-176z" fill="#1a232b" stroke="#c9a25a" stroke-width="12" stroke-linejoin="round"/>
 <path d="M256 336 c-40 0 -52 -34 -34 -62 c8 14 18 14 20 4 c2 -22 -6 -34 14 -58 c2 26 36 44 36 78 c0 24 -14 38 -36 38z" fill="url(#fl)"/>
 <path d="M160 352 h192 l-10 40 q-86 22 -172 0z" fill="#c9a25a"/>
 <rect x="222" y="398" width="68" height="18" rx="6" fill="#8a6a34"/>
</g></svg>`;
const out = async (name, size, pad) => sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/icons/${name}`);
await out('icon-192.png', 192, 1);
await out('icon-512.png', 512, 1);
await out('icon-maskable-512.png', 512, 0.78);
await out('apple-touch-icon.png', 180, 0.92);
console.log('icons ok');
