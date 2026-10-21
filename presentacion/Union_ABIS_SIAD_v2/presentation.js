/* Navegación y visor de evidencia. No requiere iniciar ABIS ni consultar la BD. */
(() => {
  const slides = [...document.querySelectorAll('.slides > section')];
  const modal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-img');
  const closeImage = document.getElementById('closeImageBtn');
  const chapterNav = document.getElementById('chapterNav');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let currentZoom = 1, translateX = 0, translateY = 0;
  let drag = null, lastFocus = null;

  slides.forEach((slide, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = `${index + 1}. ${slide.dataset.title}`;
    button.setAttribute('aria-label', button.title);
    button.textContent = String(index + 1).padStart(2, '0');
    button.addEventListener('click', () => Reveal.slide(index));
    chapterNav.append(button);
  });

  function fitCurrentSlide() {
    const slide = Reveal.getCurrentSlide();
    const content = slide?.querySelector('.slide-content');
    if (!content) return;
    const style = getComputedStyle(slide);
    const available = slide.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const scale = window.innerWidth >= 900 ? Math.min(1, available / content.offsetHeight) : 1;
    content.style.setProperty('--content-fit', scale);
  }

  function updateNavigation() {
    const index = Reveal.getIndices().h;
    document.body.classList.toggle('presentation-content', index > 0 && index < slides.length - 1);
    const counter = document.getElementById('currentSlideNum');
    counter.textContent = index + 1;
    counter.classList.remove('pop-animate');
    void counter.offsetWidth;
    counter.classList.add('pop-animate');
    document.getElementById('totalSlidesNum').textContent = slides.length;
    document.getElementById('slideLocation').textContent = slides[index].dataset.title;
    document.getElementById('prevSlideBtn').disabled = index === 0;
    document.getElementById('nextSlideBtn').disabled = index === slides.length - 1;
    chapterNav.querySelectorAll('button').forEach((button, i) => {
      button.setAttribute('aria-current', i === index ? 'step' : 'false');
    });
    fitCurrentSlide();
  }

  Reveal.on('ready', updateNavigation);
  Reveal.on('slidechanged', updateNavigation);
  Reveal.on('resize', fitCurrentSlide);
  Reveal.initialize({
    controls: false, progress: true, history: true, center: true,
    transition: reducedMotion ? 'none' : 'slide', backgroundTransition: 'fade',
    keyboard: true, width: 1280, height: 720, margin: 0.04,
    minScale: 0.2, maxScale: 2, disableLayout: false, scrollActivationWidth: null,
  });
  window.addEventListener('load', fitCurrentSlide);
  window.addEventListener('resize', fitCurrentSlide);
  document.fonts.ready.then(fitCurrentSlide);
  document.getElementById('prevSlideBtn').addEventListener('click', () => Reveal.prev());
  document.getElementById('nextSlideBtn').addEventListener('click', () => Reveal.next());
  document.getElementById('startPresBtn').addEventListener('click', () => Reveal.next());

  const fullscreenBtn = document.getElementById('fullscreenBtn');
  if (!document.fullscreenEnabled) fullscreenBtn.hidden = true;
  fullscreenBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      fullscreenBtn.title = 'Usa F11 para activar pantalla completa';
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const label = document.fullscreenElement ? 'Salir de pantalla completa' : 'Activar pantalla completa';
    fullscreenBtn.title = label;
    fullscreenBtn.setAttribute('aria-label', label);
  });

  function transformImage() {
    modalImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentZoom})`;
    document.getElementById('zoomResetBtn').textContent = `${Math.round(currentZoom * 100)}%`;
  }
  function zoom(delta) {
    currentZoom = Math.max(0.4, Math.min(4.5, currentZoom + delta));
    transformImage();
  }
  function closeModal() {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    drag = null;
    Reveal.configure({ keyboard: true, touch: true });
    lastFocus?.focus();
  }
  document.querySelectorAll('.evidence-card[data-img]').forEach(card => {
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Ampliar: ${card.dataset.caption || card.querySelector('img').alt}`);
    const open = () => {
      lastFocus = card;
      modalImg.src = card.dataset.img;
      modalImg.alt = card.querySelector('img').alt;
      document.getElementById('modal-caption').textContent = card.dataset.caption || modalImg.alt;
      currentZoom = 1;
      translateX = translateY = 0;
      transformImage();
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
      Reveal.configure({ keyboard: false, touch: false });
      closeImage.focus();
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); open(); }
    });
  });
  closeImage.addEventListener('click', closeModal);
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
  document.getElementById('zoomInBtn').addEventListener('click', () => zoom(0.2));
  document.getElementById('zoomOutBtn').addEventListener('click', () => zoom(-0.2));
  document.getElementById('zoomResetBtn').addEventListener('click', () => {
    currentZoom = 1; translateX = translateY = 0; transformImage();
  });
  modal.addEventListener('wheel', event => {
    event.preventDefault(); zoom(event.deltaY < 0 ? 0.18 : -0.18);
  }, { passive: false });
  modalImg.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = { x: event.clientX - translateX, y: event.clientY - translateY };
    modalImg.setPointerCapture(event.pointerId);
    modalImg.style.cursor = 'grabbing';
  });
  modalImg.addEventListener('pointermove', event => {
    if (!drag) return;
    translateX = event.clientX - drag.x; translateY = event.clientY - drag.y; transformImage();
  });
  const stopDrag = () => { drag = null; modalImg.style.cursor = 'grab'; };
  modalImg.addEventListener('pointerup', stopDrag);
  modalImg.addEventListener('pointercancel', stopDrag);
  window.addEventListener('keydown', event => {
    if (modal.getAttribute('aria-hidden') === 'true') return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeModal(); }
    if (event.key === 'Tab') {
      const buttons = [...modal.querySelectorAll('button')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }, true);
})();
