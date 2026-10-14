(() => {
  let internalNavigation = false;

  const isSameOriginNavigation = (anchor) => {
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return false;
    if (anchor.hasAttribute("data-logout-link")) return false;

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return false;

    try {
      const target = new URL(anchor.href, window.location.href);
      return target.origin === window.location.origin;
    } catch {
      return false;
    }
  };

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest("a");
    if (isSameOriginNavigation(anchor)) internalNavigation = true;
  }, true);

  window.addEventListener("pagehide", (event) => {
    // No cerrar la sesión al navegar entre páginas del sistema en la misma pestaña.
    if (internalNavigation || event.persisted) return;

    const sent = navigator.sendBeacon?.("/logout", new Blob([], { type: "text/plain" }));
    if (!sent) {
      fetch("/logout", {
        method: "POST",
        credentials: "include",
        keepalive: true,
      }).catch(() => {});
    }
  });
})();
