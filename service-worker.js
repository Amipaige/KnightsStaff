const CACHE_NAME='kmb-hub-v1';
const APP_SHELL=[
  './',
  './hub.html',
  './hub.css',
  './hub.js',
  './manifest.json',
  './logo.png',
  './logo-exact.svg',
  './favicon.png',
  './favicon.svg',
  './staffing.html',
  './photo-stock-take.html'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;

  if(req.mode==='navigate'){
    event.respondWith(
      fetch(req).then(res=>{
        const copy=res.clone();
        caches.open(CACHE_NAME).then(cache=>cache.put(req,copy));
        return res;
      }).catch(async()=>{
        return (await caches.match(req)) || (await caches.match('./hub.html')) || (await caches.match('./'));
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached=>{
      const network=fetch(req).then(res=>{
        if(res.ok){
          const copy=res.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(req,copy));
        }
        return res;
      }).catch(()=>cached);
      return cached || network;
    })
  );
});