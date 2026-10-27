let closeActivePopup = null;

const count = value => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
};

// Comparte el lenguaje visual de Telegram; los valores del servidor se colocan
// como texto, nunca como HTML. No vuelve a enviar ni fuerza una ingesta.
export function showIngestDuplicatesPopup(data, { source = '', trigger = document.activeElement } = {}) {
  const possible = data.codigo === 'POSIBLE_LOTE_REPETIDO';
  const duplicates = count(data.totalDuplicadas);
  if (!possible && (!data.ok || duplicates === 0)) return false;

  closeActivePopup?.();
  const inserted = count(data.totalInsertadas);
  const rejected = count(data.erroresFilas);
  const overlay = document.createElement('div');
  overlay.className = 'telegram-popup-overlay ingest-duplicates-overlay';
  overlay.innerHTML = `
    <section class="telegram-popup-content ingest-duplicates-content" role="alertdialog"
      aria-modal="true" aria-labelledby="ingest-duplicates-title" aria-describedby="ingest-duplicates-message">
      <div class="telegram-icon-wrapper" aria-hidden="true">
        <svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="13" rx="2"/>
          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3M14 12v3m0 3h.01"/></svg>
      </div>
      <p class="ingest-duplicates-eyebrow">Control de ingesta · ABIS</p>
      <h2 class="telegram-popup-title" id="ingest-duplicates-title"></h2>
      <p class="telegram-popup-msg" id="ingest-duplicates-message"></p>
      <p class="ingest-duplicates-source"></p>
      <dl class="ingest-duplicates-counts">
        <div><dt>Duplicados omitidos</dt><dd data-ingest-count="duplicates"></dd></div>
        <div><dt>Nuevos insertados</dt><dd data-ingest-count="inserted"></dd></div>
      </dl>
      <p class="ingest-duplicates-rejected" hidden></p>
      <p class="ingest-duplicates-note"></p>
      <button type="button" class="telegram-popup-close">Entendido</button>
    </section>`;
  overlay.querySelector('#ingest-duplicates-title').textContent = possible
    ? 'Posible carga repetida' : 'Se detectaron duplicados';
  overlay.querySelector('#ingest-duplicates-message').textContent = possible
    ? (data.error || 'Esta carga coincide con un lote antiguo. Revisa el historial antes de volver a intentarlo.')
    : inserted > 0
      ? 'Se añadieron los registros nuevos y se omitieron los que ya estaban cargados o se repetían en esta carga.'
      : 'Se encontraron registros ya cargados o repetidos en esta carga. No se añadieron registros nuevos.';
  const sourceLabel = overlay.querySelector('.ingest-duplicates-source');
  sourceLabel.textContent = source;
  sourceLabel.hidden = !source;
  overlay.querySelector('.ingest-duplicates-counts').hidden = possible;
  overlay.querySelector('[data-ingest-count="duplicates"]').textContent = duplicates.toLocaleString('es-CL');
  overlay.querySelector('[data-ingest-count="inserted"]').textContent = inserted.toLocaleString('es-CL');
  const rejectedLabel = overlay.querySelector('.ingest-duplicates-rejected');
  rejectedLabel.hidden = possible || rejected === 0;
  rejectedLabel.textContent = `Filas con errores: ${rejected.toLocaleString('es-CL')}. Revisa el detalle de la ingesta.`;
  overlay.querySelector('.ingest-duplicates-note').textContent = possible
    ? 'Carga detenida: no se insertó ningún registro.'
    : 'Los duplicados no se volvieron a guardar. Puedes revisar el resultado en el historial de ingestas.';

  document.body.appendChild(overlay);
  document.body.classList.add('ingest-duplicates-open');
  const button = overlay.querySelector('button');
  const close = () => {
    overlay.remove();
    document.body.classList.remove('ingest-duplicates-open');
    document.removeEventListener('keydown', onKeyDown);
    if (closeActivePopup === close) closeActivePopup = null;
    // La planilla puede haberse limpiado mientras el aviso estaba abierto.
    const fallback = document.getElementById('btn-refresh-ingesta-history');
    const focusTarget = trigger?.isConnected && trigger.getClientRects().length ? trigger : fallback;
    focusTarget?.focus({ preventScroll: true });
  };
  const onKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      button.focus({ preventScroll: true });
    }
  };
  closeActivePopup = close;
  button.addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKeyDown);
  button.focus({ preventScroll: true });
  return true;
}
