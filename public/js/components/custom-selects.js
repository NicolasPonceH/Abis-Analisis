const enhancedSelects = new WeakMap();

function createCustomSelect(select) {
  if (!select || select.dataset.customSelectEnhanced === 'true' || select.multiple || select.classList.contains('accent-select-fallback')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select';
  if (select.style.width === 'auto') wrapper.classList.add('custom-select-fit');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'custom-select-toggle';
  toggle.setAttribute('aria-haspopup', 'listbox');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', `${select.id || 'select'}-custom-menu`);

  const label = document.createElement('span');
  label.className = 'custom-select-label';
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-chevron-down custom-select-chevron';
  icon.setAttribute('aria-hidden', 'true');
  toggle.append(label, icon);

  const menu = document.createElement('div');
  menu.id = `${select.id || `custom-select-${Math.random().toString(36).slice(2)}`}-custom-menu`;
  menu.className = 'custom-select-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  select.parentNode.insertBefore(wrapper, select);
  wrapper.append(toggle, menu, select);
  select.classList.add('custom-select-native');
  select.dataset.customSelectEnhanced = 'true';

  let isOpen = false;

  const handleScroll = (event) => {
    // El menú tiene su propio scroll; no debe cerrarse al desplazar sus opciones.
    if (event.target === menu || menu.contains(event.target)) return;
    close();
  };

  const positionMenu = () => {
    if (!isOpen || menu.parentNode !== document.body) return;

    const toggleRect = toggle.getBoundingClientRect();
    const viewportGap = 8;
    const menuHeight = Math.min(menu.scrollHeight, 280);
    const roomBelow = window.innerHeight - toggleRect.bottom - viewportGap;
    const opensAbove = roomBelow < menuHeight && toggleRect.top > menuHeight + viewportGap;
    const top = opensAbove
      ? Math.max(viewportGap, toggleRect.top - menuHeight - 6)
      : Math.min(window.innerHeight - menuHeight - viewportGap, toggleRect.bottom + 6);

    menu.style.top = `${Math.max(viewportGap, top)}px`;
    menu.style.left = `${Math.max(viewportGap, toggleRect.left)}px`;
    menu.style.width = `${Math.min(toggleRect.width, window.innerWidth - (Math.max(viewportGap, toggleRect.left) + viewportGap))}px`;
  };

  const open = () => {
    if (isOpen) return;
    isOpen = true;
    wrapper.classList.add('is-open');
    document.body.appendChild(menu);
    menu.classList.add('custom-select-menu-portal');
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', handleScroll, true);
  };

  const close = () => {
    if (!isOpen) {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      return;
    }
    isOpen = false;
    window.removeEventListener('resize', positionMenu);
    window.removeEventListener('scroll', handleScroll, true);
    menu.classList.remove('custom-select-menu-portal');
    menu.style.top = '';
    menu.style.left = '';
    menu.style.width = '';
    menu.hidden = true;
    wrapper.insertBefore(menu, select);
    wrapper.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  const sync = () => {
    const selected = select.options[select.selectedIndex] || select.options[0];
    if (!selected) {
      label.textContent = 'Seleccionar...';
      return;
    }
    label.textContent = selected.textContent.trim();
    menu.querySelectorAll('.custom-select-option').forEach(option => {
      const isSelected = option.dataset.value === selected.value;
      option.classList.toggle('selected', isSelected);
      option.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });
  };

  const renderOptions = () => {
    menu.replaceChildren();
    Array.from(select.options).forEach(option => {
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.className = 'custom-select-option';
      optionButton.dataset.value = option.value;
      optionButton.setAttribute('role', 'option');
      optionButton.disabled = option.disabled;
      optionButton.textContent = option.textContent.trim();
      optionButton.addEventListener('click', () => {
        if (option.disabled) return;
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        sync();
        close();
      });
      menu.appendChild(optionButton);
    });
    sync();
  };

  toggle.addEventListener('click', () => {
    const isOpening = !isOpen;
    document.querySelectorAll('.custom-select-native').forEach(otherSelect => {
      enhancedSelects.get(otherSelect)?.close();
    });
    if (isOpening) open();
  });
  select.addEventListener('change', sync);
  select.addEventListener('input', sync);

  const observer = new MutationObserver(renderOptions);
  observer.observe(select, { childList: true, subtree: true });
  const poll = window.setInterval(() => {
    if (!document.documentElement.contains(select)) {
      window.clearInterval(poll);
      observer.disconnect();
      return;
    }
    sync();
  }, 250);

  enhancedSelects.set(select, { sync, renderOptions, close });
  renderOptions();
}

function initCustomSelects(root = document) {
  root.querySelectorAll('select:not(.accent-select-fallback):not(.custom-select-native)').forEach(createCustomSelect);
}

function closeCustomSelects(event) {
  if (event.target instanceof Element && event.target.closest('.custom-select')) return;
  document.querySelectorAll('.custom-select-native').forEach(select => {
    enhancedSelects.get(select)?.close();
  });
}

window.refreshCustomSelects = () => initCustomSelects(document);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initCustomSelects());
} else {
  initCustomSelects();
}
document.addEventListener('click', closeCustomSelects);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeCustomSelects({ target: document.body });
});
