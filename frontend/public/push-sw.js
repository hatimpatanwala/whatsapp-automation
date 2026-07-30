/* Field-sales web-push service worker. Kept intentionally tiny — it only
   renders pushes and routes taps. Registered on demand by WebPushService. */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'My Sales';
  const options = {
    body: data.body || '',
    tag: data.tag || 'my-sales',
    data: { url: data.url || '/field-sales/my-sales' },
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    renotify: !!data.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/field-sales/my-sales';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.focus(); if ('navigate' in c) c.navigate(url); return; }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
