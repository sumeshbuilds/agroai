// Native notification fallback for open app tabs, not a background push service.
globalThis.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await globalThis.clients.matchAll({ type: "window", includeUncontrolled: true });
    const app = windows.find((client) => {
      const url = new URL(client.url);
      return url.origin === globalThis.location.origin && url.pathname !== "/camera";
    });
    if (app) {
      // A full navigation would tear down Web Audio. Bring the dashboard's
      // persistent popup forward without treating a native click as a stop.
      return app.focus();
    }
    return globalThis.clients.openWindow("/watch");
  })());
});
