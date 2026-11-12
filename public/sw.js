// Cache public branding and the connection-help screen only; never cache shop data or API calls.
const CACHE='mohra-public-v3';
const PUBLIC=['/offline.html','/mohra-icon-192.png','/mohra-icon-512.png','/mohra-maskable-512.png','/favicon.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PUBLIC)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mohra-public-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){event.respondWith(fetch(request).catch(async()=>await caches.match('/offline.html')||new Response('সংযোগ পাওয়া যাচ্ছে না। ইন্টারনেট চালু করে আবার চেষ্টা করুন।',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));return;}
 if(PUBLIC.includes(url.pathname))event.respondWith(caches.match(request,{ignoreSearch:true}).then(hit=>hit||fetch(request)));
});
