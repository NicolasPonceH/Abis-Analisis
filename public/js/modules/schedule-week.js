import { state } from '../core/state.js';
import { escapeHtml } from '../core/utils.js';

const days = [[5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo']];
let overrides = {};
let selectedDay = 5;
const drafts = {};

export function loadWeekSchedule(config) {
  overrides = Object.fromEntries(
    Object.entries(config.timesByDay || {}).map(([day, times]) => [day, [...times]])
  );
  renderWeekSchedule();
}

export function getWeekSchedule() {
  return Object.fromEntries(
    Object.entries(overrides).map(([day, times]) => [day, [...times]])
  );
}

export function scheduleSummary(config) {
  const count = (config.days || []).reduce(
    (total, day) => total + (config.timesByDay?.[day] ?? config.times ?? []).length,
    0
  );
  return `${count} horarios programados por semana${config.enabled === false ? ' · Envíos pausados' : ''}`;
}

export function renderWeekSchedule() {
  const container = document.getElementById('schedule-week-editor');
  if (!container) return;

  const activeDays = [...document.querySelectorAll('.day-check:checked')].map(input => Number(input.value));
  const [day, name] = days.find(([value]) => value === selectedDay) || days[0];
  const custom = Object.hasOwn(overrides, day);
  const active = activeDays.includes(day);
  const times = overrides[day] ?? state.currentScheduleTimes ?? [];
  const priorWeekdays = [1, 2, 3, 4].some(value => Object.hasOwn(overrides, value));

  container.innerHTML = `
    <div class="schedule-day-tabs" role="tablist" aria-label="Días de fin de semana">
      ${days.map(([value, label]) => {
        const isCustom = Object.hasOwn(overrides, value);
        const isActive = activeDays.includes(value);
        const summary = !isActive
          ? 'Sin envíos'
          : isCustom
          ? (overrides[value].join(' · ') || 'Sin horas')
          : 'Horario general';

        const statusClass = !isActive ? 'is-paused' : isCustom ? 'is-custom' : 'is-default';

        return `
          <button type="button"
                  role="tab"
                  id="schedule-tab-${value}"
                  class="schedule-day-tab-btn"
                  data-select-day="${value}"
                  aria-selected="${value === day}"
                  aria-controls="schedule-day-panel"
                  tabindex="${value === day ? 0 : -1}">
            <div class="day-tab-head">
              <strong>${label}</strong>
              <span class="day-status-dot ${statusClass}" aria-hidden="true"></span>
            </div>
            <span class="day-tab-summary" title="${escapeHtml(summary)}">${escapeHtml(summary)}</span>
          </button>
        `;
      }).join('')}
    </div>

    <div class="schedule-day-panel" id="schedule-day-panel" role="tabpanel" aria-labelledby="schedule-tab-${day}" data-schedule-day="${day}">
      <div class="schedule-day-heading">
        <div class="day-heading-info">
          <span class="schedule-day-kicker">${custom ? 'Horario exclusivo configurado' : 'Sincronizado con horario general'}</span>
          <div class="day-heading-title-row">
            <h4>${name}</h4>
            <span class="day-badge ${custom ? 'day-badge-custom' : 'day-badge-default'}">
              ${custom ? 'Horas exclusivas' : 'Sincronizado con general'}
            </span>
          </div>
        </div>

        <div class="schedule-day-heading-actions">
          ${custom ? `
            <button type="button" class="btn-link-action schedule-day-reset-link" data-reset-day="${day}" title="Volver a sincronizar ${name} con el horario general">
              ↺ Usar horario general
            </button>
          ` : `
            <span class="schedule-day-direct-hint" title="Edición directa habilitada">Edición directa</span>
          `}
          <input type="checkbox" data-custom-day="${day}" ${custom ? 'checked' : ''} style="display:none;" aria-hidden="true">
        </div>
      </div>

      <div class="time-chips-container schedule-day-times" aria-label="Horas del ${name}">
        ${times.length ? times.map(time => `
          <div class="time-chip ${custom ? 'time-chip-custom' : 'time-chip-general'}">
            <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke: ${custom ? '#d97706' : '#0284c7'};">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>${escapeHtml(time)} hrs</span>
            <button type="button"
                    class="time-chip-del"
                    data-remove-day="${day}"
                    data-remove-time="${escapeHtml(time)}"
                    title="Quitar ${escapeHtml(time)}"
                    aria-label="Quitar ${escapeHtml(time)} del ${name}">
              <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke: #ef4444;">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        `).join('') : '<span class="schedule-empty-times">No hay horarios configurados para este día. Añade uno a continuación.</span>'}
      </div>

      <div class="add-time-box schedule-day-add">
        <label class="filter-label" for="schedule-day-time-${day}">Añadir horario especial para ${name}:</label>
        <div class="add-time-row">
          <input type="time"
                 id="schedule-day-time-${day}"
                 class="form-control"
                 aria-label="Nueva hora para ${name}"
                 value="${escapeHtml(drafts[day] || '12:00')}">
          <button type="button" class="btn btn-primary schedule-day-add-button" data-add-day="${day}">
            <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Agregar Hora</span>
          </button>
        </div>
      </div>

      ${!active ? `
        <p class="schedule-day-note is-paused">
          Día desactivado. Márcalo en Días de Envío Semanal para habilitarlo.
        </p>
      ` : ''}
    </div>

    ${priorWeekdays ? `
      <div class="schedule-legacy-note">
        <span>Se conservan tus horarios personalizados anteriores de lunes a jueves.</span>
        <button type="button" class="btn-link-action" data-reset-weekdays>Usar horario general en esos días</button>
      </div>
    ` : ''}
  `;

  const summary = document.getElementById('schedule-freq-summary');
  if (summary) {
    summary.textContent = scheduleSummary({
      times: state.currentScheduleTimes,
      days: activeDays,
      timesByDay: overrides,
      enabled: document.getElementById('schedule-enabled-toggle')?.checked
    });
  }
}

export function setupWeekSchedule() {
  const container = document.getElementById('schedule-week-editor');
  if (!container || container.dataset.bound) return;
  container.dataset.bound = 'true';

  const wrapper = document.getElementById('schedule-carousel-wrapper');

  const goToWeekend = () => {
    if (wrapper) {
      wrapper.classList.add('is-showing-weekend');
      wrapper.dataset.activeSlide = 'weekend';
    }
    setTimeout(() => {
      document.getElementById(`schedule-tab-${selectedDay}`)?.focus();
    }, 120);
  };

  const backToGeneral = () => {
    if (wrapper) {
      wrapper.classList.remove('is-showing-weekend');
      wrapper.dataset.activeSlide = 'general';
    }
    setTimeout(() => {
      document.getElementById('schedule-weekend-toggle')?.focus();
    }, 120);
  };

  document.getElementById('schedule-weekend-toggle')?.addEventListener('click', (e) => {
    e.preventDefault();
    goToWeekend();
  });

  document.getElementById('btn-go-to-weekend')?.addEventListener('click', (e) => {
    e.preventDefault();
    goToWeekend();
  });

  document.getElementById('schedule-general-toggle')?.addEventListener('click', (e) => {
    e.preventDefault();
    backToGeneral();
  });

  document.getElementById('btn-back-to-general')?.addEventListener('click', (e) => {
    e.preventDefault();
    backToGeneral();
  });

  document.getElementById('btn-save-schedule-weekend')?.addEventListener('click', () => {
    document.getElementById('btn-save-schedule')?.click();
  });

  const announce = text => {
    const feedback = document.getElementById('schedule-week-feedback');
    if (feedback) feedback.textContent = text;
  };

  const selectDay = day => {
    selectedDay = day;
    renderWeekSchedule();
    container.querySelector(`[data-select-day="${day}"]`)?.focus();
  };

  container.addEventListener('input', event => {
    if (event.target.matches('input[type="time"]')) {
      drafts[selectedDay] = event.target.value;
    }
  });

  container.addEventListener('keydown', event => {
    if (!event.target.closest('[data-select-day]')) return;
    const index = days.findIndex(([day]) => day === selectedDay);
    const next = { ArrowRight: (index + 1) % 3, ArrowLeft: (index + 2) % 3, Home: 0, End: 2 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    selectDay(days[next][0]);
  });

  container.addEventListener('change', event => {
    const input = event.target.closest('[data-custom-day]');
    if (!input) return;
    if (input.checked) {
      overrides[input.dataset.customDay] = [...(state.currentScheduleTimes || [])];
    } else {
      delete overrides[input.dataset.customDay];
    }
    renderWeekSchedule();
    announce('Cambio pendiente. Guarda los ajustes para aplicarlo.');
  });

  container.addEventListener('click', event => {
    const tab = event.target.closest('[data-select-day]');
    if (tab) return selectDay(Number(tab.dataset.selectDay));

    if (event.target.closest('[data-reset-weekdays]')) {
      for (const day of [1, 2, 3, 4]) delete overrides[day];
      renderWeekSchedule();
      container.querySelector(`[data-select-day="${selectedDay}"]`)?.focus();
      announce('Lunes a jueves usarán el horario general al guardar.');
      return;
    }

    const resetDay = event.target.closest('[data-reset-day]');
    if (resetDay) {
      const dayVal = resetDay.dataset.resetDay;
      const dayName = (days.find(([v]) => String(v) === String(dayVal)) || [])[1] || 'Fin de Semana';
      delete overrides[dayVal];
      renderWeekSchedule();
      container.querySelector(`[data-select-day="${selectedDay}"]`)?.focus();
      announce('Este día volverá a usar el horario general al guardar.');
      showSchedulePopup({
        title: '¡Horario Sincronizado con Éxito!',
        message: `El día <strong>${dayName}</strong> volverá a usar el horario general.`,
        badgeText: 'Recuerda hacer clic en "Guardar Ajustes" para aplicar los cambios.',
        type: 'add'
      });
      return;
    }

    const add = event.target.closest('[data-add-day]');
    const remove = event.target.closest('[data-remove-day]');

    if (add) {
      const dayVal = add.dataset.addDay;
      const dayName = (days.find(([v]) => String(v) === String(dayVal)) || [])[1] || 'Fin de Semana';
      const input = document.getElementById(`schedule-day-time-${dayVal}`);
      if (!input || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.value)) {
        announce('Ingresa una hora válida en formato de 24 horas (HH:MM).');
        input?.focus();
        return;
      }
      const addedTime = input.value;
      const currentList = overrides[dayVal] ?? [...(state.currentScheduleTimes || [])];
      overrides[dayVal] = [...new Set([...currentList, addedTime])].sort();
      renderWeekSchedule();
      document.getElementById(`schedule-day-time-${selectedDay}`)?.focus();
      announce('Cambio pendiente. Guarda los ajustes para aplicarlo.');
      showSchedulePopup({
        title: '¡Horario Agregado con Éxito!',
        message: `Se añadió el horario <strong>${addedTime} hrs</strong> para el día <strong>${dayName}</strong>.`,
        badgeText: 'Recuerda hacer clic en "Guardar Ajustes" para aplicar los cambios.',
        type: 'add'
      });
      return;
    }

    if (remove) {
      const dayVal = remove.dataset.removeDay;
      const timeVal = remove.dataset.removeTime;
      const dayName = (days.find(([v]) => String(v) === String(dayVal)) || [])[1] || 'Fin de Semana';
      const currentList = overrides[dayVal] ?? [...(state.currentScheduleTimes || [])];
      overrides[dayVal] = currentList.filter(time => time !== timeVal);
      renderWeekSchedule();
      document.getElementById(`schedule-day-time-${selectedDay}`)?.focus();
      announce('Cambio pendiente. Guarda los ajustes para aplicarlo.');
      showSchedulePopup({
        title: '¡Horario Eliminado con Éxito!',
        message: `Se eliminó el horario <strong>${timeVal} hrs</strong> del día <strong>${dayName}</strong>.`,
        badgeText: 'Recuerda hacer clic en "Guardar Ajustes" para aplicar los cambios.',
        type: 'remove'
      });
      return;
    }
  });

  document.querySelectorAll('.day-check').forEach(input => {
    input.addEventListener('change', renderWeekSchedule);
  });
}

/**
 * Muestra un pop up 3D idéntico al de Telegram al realizar o guardar ajustes de horario.
 */
export function showSchedulePopup({ title, message, badgeText, type = 'success' } = {}) {
  if (typeof document === 'undefined') return;

  // Cerrar popups anteriores
  document.querySelectorAll('.schedule-popup-overlay').forEach(el => el.remove());

  const overlay = document.createElement('div');
  overlay.className = 'telegram-popup-overlay schedule-popup-overlay';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');

  const content = document.createElement('div');
  content.className = 'telegram-popup-content schedule-popup-content';

  let iconBg = 'rgba(14, 165, 233, 0.15)';
  let iconBorder = 'rgba(14, 165, 233, 0.35)';
  let iconSvg = '';

  if (type === 'remove') {
    iconBg = 'rgba(239, 68, 68, 0.15)';
    iconBorder = 'rgba(239, 68, 68, 0.35)';
    iconSvg = `
      <svg viewBox="0 0 24 24" style="stroke: #ef4444; stroke-width: 2.2;">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
    `;
  } else if (type === 'save') {
    iconBg = 'rgba(255, 209, 0, 0.2)';
    iconBorder = 'rgba(255, 209, 0, 0.5)';
    iconSvg = `
      <svg viewBox="0 0 24 24" style="stroke: #00234c; stroke-width: 2.2;">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
      </svg>
    `;
  } else {
    // Add / Success
    iconBg = 'rgba(16, 185, 129, 0.15)';
    iconBorder = 'rgba(16, 185, 129, 0.35)';
    iconSvg = `
      <svg viewBox="0 0 24 24" style="stroke: #10b981; stroke-width: 2.2;">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
    `;
  }

  const iconHtml = `
    <div class="telegram-icon-wrapper" style="background: ${iconBg}; border: 1px solid ${iconBorder};">
      ${iconSvg}
    </div>
  `;

  const dateIcon = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  `;

  content.innerHTML = `
    ${iconHtml}
    <div class="telegram-popup-title">${title || '¡Operación Exitosa!'}</div>
    <div class="telegram-popup-msg">${message || ''}</div>
    ${badgeText ? `<div class="telegram-popup-date">${dateIcon} <span>${badgeText}</span></div>` : ''}
    <br>
    <button type="button" class="telegram-popup-close">Aceptar</button>
  `;

  overlay.appendChild(content);
  document.body.appendChild(overlay);

  let isClosed = false;
  const closePopup = () => {
    if (isClosed) return;
    isClosed = true;
    overlay.classList.add('telegram-popup-fadeout');
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, 380);
  };

  const closeBtn = content.querySelector('.telegram-popup-close');
  closeBtn?.addEventListener('click', closePopup);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePopup();
  });

  const onDocPointer = (e) => {
    if (!content.contains(e.target)) {
      closePopup();
      document.removeEventListener('pointerdown', onDocPointer);
    }
  };
  setTimeout(() => {
    if (!isClosed) document.addEventListener('pointerdown', onDocPointer);
  }, 80);

  setTimeout(() => {
    if (overlay.parentNode && !isClosed) closePopup();
  }, 5000);
}

if (typeof window !== 'undefined') {
  window.showSchedulePopup = showSchedulePopup;
}
