var CACHE = 'braindump-v2';
var ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-180.png'];
/* the database library comes from a CDN; keep a copy so the app still opens with no signal */
var LIBS = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return c.addAll(ASSETS).then(function(){
      return Promise.all(LIBS.map(function(u){ return c.add(new Request(u, {mode:'cors'})).catch(function(){}); }));
    });
  }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  /* only tidy up Brain Dump's own old copies: other apps on the same github.io address keep theirs */
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k.indexOf('braindump-')===0 && k!==CACHE; }).map(function(k){ return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function(e){
  if(e.request.method!=='GET') return;
  var url = new URL(e.request.url);

  /* the pinned library never changes, so use the stored copy first */
  if(LIBS.indexOf(e.request.url) >= 0){
    e.respondWith(caches.match(e.request).then(function(hit){
      return hit || fetch(e.request).then(function(res){
        var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(e.request, copy); }); return res;
      });
    }));
    return;
  }

  /* only this app's own files (not other apps on the same address) */
  var scope = self.registration.scope;
  if(url.origin === location.origin && e.request.url.indexOf(scope) === 0){
    /* network first (so a new version shows on the very next open), stored copy as the offline fallback */
    e.respondWith(
      new Promise(function(resolve, reject){
        var done = false;
        var timer = setTimeout(function(){ if(!done){ done = true; reject(new Error('slow network')); } }, 3500);
        fetch(e.request).then(function(res){
          if(done) return;
          done = true; clearTimeout(timer);
          if(res.ok){ var resClone = res.clone(); caches.open(CACHE).then(function(c){ c.put(e.request, resClone); }); }
          resolve(res);
        }).catch(function(err){ if(!done){ done = true; clearTimeout(timer); reject(err); } });
      }).catch(function(){
        return caches.match(e.request, {ignoreSearch:true}).then(function(cached){ return cached || caches.match('./index.html') || fetch(e.request); });
      })
    );
  }
  /* everything else (the database, photos, fonts) goes straight to the network */
});

/* ---------- reminders ---------- */
self.addEventListener('push', function(e){
  var d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(err){ d = {body: e.data ? e.data.text() : ''}; }
  e.waitUntil(self.registration.showNotification(d.title || 'Brain Dump', {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || undefined,
    data: {url: d.url || self.registration.scope}
  }));
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var target = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++){ if(list[i].url.indexOf(self.registration.scope)===0 && 'focus' in list[i]) return list[i].focus(); }
    return self.clients.openWindow(target);
  }));
});
