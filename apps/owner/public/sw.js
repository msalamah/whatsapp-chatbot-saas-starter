self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Owner portal", body: event.data?.text() || "" };
  }
  const title = data.title || "Owner portal";
  const options = {
    body: data.body || "You have a new notification.",
    data: data.url ? { url: data.url } : undefined
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url;
  if (!target) return;
  event.waitUntil(clients.openWindow(target));
});
