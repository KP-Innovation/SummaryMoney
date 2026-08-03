// Service Worker — เอาของใหม่จากเน็ตก่อน แล้วถอยไปใช้แคชถ้าออฟไลน์
// (บทเรียนจาก SoundText: แคชก่อนทำให้เครื่องที่ติดตั้งแอปไว้ค้างอยู่กับโค้ดเก่า)
const VERSION = 'finflow-v7';
const SHELL = ['./','./index.html','./css/app.css','./data/seed.json',
  './js/util.js','./js/store.js','./js/engine.js','./js/chart.js',
  './js/edit.js','./js/screens.js','./js/app.js','./manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) { const c = res.clone(); caches.open(VERSION).then(x => x.put(req, c)); }
      return res;
    }).catch(() => caches.match(req).then(h => h || caches.match('./index.html')))
  );
});
