self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  event.waitUntil(self.registration.showNotification(payload.title || 'CapyBudget', {
    body: payload.body || 'You have a finance reminder.',
    icon: '/favicon.png',
    badge: '/favicon.png',
    data: { url: payload.url || '/bills' },
    tag: payload.tag || 'capybudget-finance'
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/bills', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin));
    if (existing) return existing.focus().then(() => existing.navigate(target));
    return self.clients.openWindow(target);
  }));
});
