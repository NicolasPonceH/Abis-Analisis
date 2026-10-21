(() => {
  let sessionEnding = false;
  let lastActivityAt = Date.now();
  const idleTimeoutMinutes = Number(window.ABIS_IDLE_TIMEOUT_MINUTES) || 15;
  const idleTimeoutMs = idleTimeoutMinutes * 60 * 1000;

  const markActivity = () => {
    if (!sessionEnding) lastActivityAt = Date.now();
  };

  ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"].forEach((eventName) => {
    document.addEventListener(eventName, markActivity, { passive: true });
  });

  const idleCheck = window.setInterval(() => {
    if (Date.now() - lastActivityAt < idleTimeoutMs) return;

    sessionEnding = true;
    window.clearInterval(idleCheck);
    window.location.replace("/logout?motivo=inactividad");
  }, 1000);

  // No cerrar la sesión en pagehide/unload: F5, navegación del navegador y
  // restauración de una pestaña también disparan esos eventos. La sesión se
  // cierra mediante el botón de salida o por inactividad.
})();
