(() => {
  document.querySelectorAll('[data-document-scanner]').forEach((scanner) => {
    const toggle = scanner.querySelector('.doc-scanner__toggle');
    let manuallyPaused = false;
    let inView = true;
    const syncPlayback = () => {
      scanner.toggleAttribute('data-paused', manuallyPaused || !inView || document.hidden);
    };
    toggle.addEventListener('click', () => {
      manuallyPaused = !manuallyPaused;
      toggle.setAttribute('aria-pressed', String(manuallyPaused));
      toggle.setAttribute('aria-label', `${manuallyPaused ? 'Reanudar' : 'Pausar'} animación del escáner`);
      toggle.textContent = manuallyPaused ? 'Reanudar' : 'Pausar';
      syncPlayback();
    });
    document.addEventListener('visibilitychange', syncPlayback);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        syncPlayback();
      }).observe(scanner);
    }
    syncPlayback();
  });
})();
