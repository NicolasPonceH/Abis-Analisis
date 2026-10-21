(() => {
  const form = document.getElementById('form-login');
  const dialog = document.getElementById('abis-access');
  if (!form || !dialog || typeof dialog.showModal !== 'function' || !window.fetch) return;

  const button = form.querySelector('[type="submit"]');
  const title = dialog.querySelector('#access-title');
  const description = dialog.querySelector('#access-description');
  const eyebrow = dialog.querySelector('[data-access-eyebrow]');
  const back = dialog.querySelector('.abis-access__return');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let busy = false;
  let controller;
  let slowTimer;
  let timeoutTimer;
  let attempt = 0;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  function reset() {
    attempt += 1;
    controller?.abort();
    clearTimeout(slowTimer);
    clearTimeout(timeoutTimer);
    busy = false;
    button.disabled = false;
    form.removeAttribute('aria-busy');
    if (dialog.open) dialog.close();
  }

  function stage(state, heading, detail) {
    dialog.dataset.state = state;
    title.textContent = heading;
    description.textContent = detail;
  }

  dialog.addEventListener('cancel', event => {
    if (busy) event.preventDefault();
  });
  back.addEventListener('click', () => {
    reset();
    form.querySelector('[name="password"]').focus();
  });
  // A page restored from the browser cache must not retain a locked form.
  window.addEventListener('pageshow', reset);
  window.addEventListener('pagehide', reset);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const currentAttempt = ++attempt;
    const startedAt = performance.now();
    const payload = new URLSearchParams(new FormData(form));
    busy = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    back.hidden = true;
    eyebrow.textContent = 'ACCESO A LA PLATAFORMA';
    stage('checking', 'Verificando tu acceso', 'Estamos comprobando tus credenciales.');
    dialog.showModal();
    controller = new AbortController();
    slowTimer = setTimeout(() => {
      description.textContent = 'La validación está tardando un poco más. Seguimos esperando la respuesta del sistema.';
    }, 7000);
    timeoutTimer = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        body: payload,
        signal: controller.signal,
      });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('No se pudo confirmar el acceso. Actualiza la página e inténtalo nuevamente.');
      }
      const result = await response.json();
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
      if (currentAttempt !== attempt) return;
      if (!response.ok || result.ok !== true) {
        throw new Error(result.error || 'No se pudo iniciar sesión. Revisa tus credenciales e inténtalo nuevamente.');
      }
      const destination = new URL(result.redirect || '/abis', window.location.origin);
      if (destination.origin !== window.location.origin) throw new Error('El destino de acceso no es válido.');
      // Keep a short readable transition; the request has already been sent.
      if (!reducedMotion.matches) await delay(Math.max(0, 1300 - (performance.now() - startedAt)));
      if (currentAttempt !== attempt) return;
      eyebrow.textContent = 'CREDENCIALES CONFIRMADAS';
      stage('success', 'Bienvenido a ABIS', 'Tu sesión está lista. Abriendo la plataforma…');
      await delay(reducedMotion.matches ? 0 : 1000);
      if (currentAttempt !== attempt) return;
      dialog.dataset.state = 'leaving';
      await delay(reducedMotion.matches ? 0 : 180);
      if (currentAttempt !== attempt) return;
      window.location.assign(destination.href);
    } catch (error) {
      if (currentAttempt !== attempt) return;
      eyebrow.textContent = 'NO SE COMPLETÓ EL INGRESO';
      const message = error.name === 'AbortError'
        ? 'El sistema tardó demasiado en responder. Vuelve a intentarlo en unos momentos.'
        : error instanceof TypeError
          ? 'No pudimos conectar con el sistema. Comprueba tu conexión y vuelve a intentarlo.'
          : error.message;
      stage('error', 'Revisemos tu acceso', message);
      busy = false;
      button.disabled = false;
      form.removeAttribute('aria-busy');
      back.hidden = false;
      back.focus();
    } finally {
      if (currentAttempt === attempt) {
        clearTimeout(slowTimer);
        clearTimeout(timeoutTimer);
      }
    }
  });
})();
