/* Service worker mínimo: permite instalar la app, recibir avisos de alertas y abrir la gasolinera al tocarlos. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

/* Aviso enviado por el servidor (alertas de precio con la app cerrada) */
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || "Reposta y Carga", {
      body: d.body || "",
      tag: d.tag || undefined,
      data: { url: d.url || "/" },
      icon: "/pwa-icon/192?v=2",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Solo direcciones de esta misma web
  let url = "/";
  try {
    const u = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
    if (u.origin === self.location.origin) url = u.pathname + u.search;
  } catch (e) {
    url = "/";
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          if ("navigate" in c) c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
