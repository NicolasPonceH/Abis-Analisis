import { state } from '../core/state.js';
import { escaparHtml } from '../core/utils.js';
import { promptAuthModal, closeAuthModal } from './auth-modal.js';

export var liveClockInterval = null;

export function updateLiveClockDisplay() {
  const clockDisplay = document.getElementById("schedule-clock-display");
  if (!clockDisplay) return;

  const now = new Date(Date.now() + (state.serverTimeOffset || 0));
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = dtf.formatToParts(now);
  const map = {};
  parts.forEach((p) => (map[p.type] = p.value));

  const hh = map.hour === "24" ? "00" : map.hour.padStart(2, "0");
  const mm = map.minute.padStart(2, "0");
  const ss = (map.second || "00").padStart(2, "0");
  const dateStr = `${map.year}-${map.month}-${map.day}`;

  clockDisplay.innerHTML = `Zona Horaria Oficial: <strong>America/Santiago (Chile)</strong> &bull; Hora Servidor: <strong class="live-clock-digits">${hh}:${mm}:${ss} hrs</strong> (${dateStr})`;
}

export function startLiveClock() {
  if (liveClockInterval) {
    clearInterval(liveClockInterval);
  }
  updateLiveClockDisplay();
  liveClockInterval = setInterval(updateLiveClockDisplay, 1000);
}

export async function loadScheduleSettings() {
  try {
    const res = await fetch("/api/settings/schedule");
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "No se pudo cargar la configuración.");

    state.scheduleConfig = data.config;
    state.currentScheduleTimes = Array.isArray(data.config.times) ? [...data.config.times] : ["08:30", "19:00"];

    // 1. Sincronizar Reloj del Servidor & Próximo Envío
    if (data.serverTimestamp) {
      state.serverTimeOffset = data.serverTimestamp - Date.now();
    }
    startLiveClock();

    const nextBadge = document.getElementById("schedule-next-text");
    if (nextBadge && data.next) {
      nextBadge.textContent = `Próximo Envío: ${data.next.text}`;
    }

    // 2. Switch Habilitado / Deshabilitado
    const toggle = document.getElementById("schedule-enabled-toggle");
    if (toggle) {
      toggle.checked = Boolean(data.config.enabled);
      updateScheduleToggleAlert(toggle.checked);
    }

    // 3. Renderizar Chips de Horarios
    renderTimeChips(state.currentScheduleTimes);

    // 4. Marcar Días de la Semana
    const activeDays = Array.isArray(data.config.days) ? data.config.days : [1, 2, 3, 4, 5, 6, 0];
    document.querySelectorAll(".day-check").forEach((cb) => {
      cb.checked = activeDays.includes(Number(cb.value));
    });

    // 5. Tipo de Reporte
    const reportTypeSelect = document.getElementById("schedule-report-type");
    if (reportTypeSelect && data.config.reportType) {
      reportTypeSelect.value = data.config.reportType;
    }

    // 6. Canal de Telegram Info
    const chatIdDisplay = document.getElementById("telegram-chat-id-display");
    if (chatIdDisplay) {
      chatIdDisplay.textContent = data.defaultChatId || "Canal Institucional PDI (.env)";
    }

    const freqSummary = document.getElementById("schedule-freq-summary");
    if (freqSummary) {
      const timesCount = state.currentScheduleTimes.length;
      freqSummary.textContent = `${timesCount} ${timesCount === 1 ? 'envío programado' : 'envíos programados'} al día`;
    }

    // 7. Renderizar Historial de Despachos
    renderScheduleHistory(data.config.history || []);

    // 8. Cargar Gestor de Destinatarios de Telegram (PostgreSQL)
    cargarDestinatariosTelegram();

  } catch (err) {
    console.error("Error al cargar ajustes de horario:", err);
    alert("CRITICAL ERROR IN loadScheduleSettings: " + err.message);
  }
}

export function renderTimeChips(times) {
  const container = document.getElementById("time-chips-container");
  if (!container) return;

  if (!times || times.length === 0) {
    container.innerHTML = `<span style="color:var(--text-muted); font-size:0.8rem; padding: 4px;">No hay horarios definidos. Añade uno con el formulario inferior.</span>`;
    return;
  }

  // Ordenar cronológicamente
  const sorted = [...times].sort();
  state.currentScheduleTimes = sorted;

  container.innerHTML = sorted.map((time) => `
    <div class="time-chip">
      <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke: #0284c7;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>${time} hrs</span>
      <button type="button" class="time-chip-del" data-time="${time}" title="Quitar este horario" aria-label="Quitar">
        <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke: #ef4444;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join("");

  // Añadir event listeners a los botones de eliminar
  container.querySelectorAll(".time-chip-del").forEach(btn => {
    btn.addEventListener("click", function() {
      const timeToRemove = this.getAttribute("data-time");
      
      // 1. Eliminarlo de la lista actual y re-renderizar para que desaparezca visualmente
      state.currentScheduleTimes = state.currentScheduleTimes.filter(t => t !== timeToRemove);
      renderTimeChips(state.currentScheduleTimes);

      // 2. Mostrar el modal dinámico centrado
      const overlay = document.createElement("div");
      overlay.className = "toast-overlay";

      const modal = document.createElement("div");
      modal.className = "toast-modal";

      modal.innerHTML = `
        <div class="toast-icon-wrapper" style="background: rgba(220, 38, 38, 0.15);">
          <svg class="icon-animate-cross" viewBox="0 0 24 24" style="stroke: #dc2626; fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
        <h3 class="toast-title">Horario Removido</h3>
        <p class="toast-text">
          Recuerda hacer clic en el botón <strong class="toast-highlight">"Guardar Ajustes de Programación"</strong> al final de la página para que este cambio sea permanente.
        </p>
        <button id="btn-entendido" class="toast-btn" style="background: linear-gradient(to right, #ef4444, #dc2626); color: white; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);">
          Entendido
        </button>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Cerrar modal
      const btnHover = modal.querySelector("#btn-entendido");
      const closeModal = () => {
        overlay.style.opacity = "0";
        modal.style.transform = "scale(0.9)";
        setTimeout(() => overlay.remove(), 300);
      };

      btnHover.addEventListener("click", closeModal);

      // Animar entrada
      requestAnimationFrame(() => {
        overlay.style.opacity = "1";
        modal.style.transform = "scale(1)";
      });
    });
  });

  const freqSummary = document.getElementById("schedule-freq-summary");
  if (freqSummary) {
    const c = sorted.length;
    freqSummary.textContent = `${c} ${c === 1 ? 'envío programado' : 'envíos programados'} al día`;
  }
}

export function agregarHorario(newTime) {
  if (!newTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(newTime)) {
    alert("Por favor ingresa un horario válido en formato HH:MM (24 horas).");
    return;
  }
  if (!state.currentScheduleTimes.includes(newTime)) {
    state.currentScheduleTimes.push(newTime);
    renderTimeChips(state.currentScheduleTimes);

    // Modal dinámico centrado
    const overlay = document.createElement("div");
    overlay.className = "toast-overlay";
    overlay.style.backgroundColor = "rgba(16, 185, 129, 0.12)";

    const modal = document.createElement("div");
    modal.className = "toast-modal";

    modal.innerHTML = `
      <div class="toast-icon-wrapper" style="background: rgba(16, 185, 129, 0.15);">
        <svg class="icon-animate-check" viewBox="0 0 24 24" style="stroke: #059669; fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      </div>
      <h3 class="toast-title">Horario Agregado</h3>
      <p class="toast-text">
        Recuerda hacer clic en el botón <strong class="toast-highlight">"Guardar Ajustes de Programación"</strong> al final de la página para que este cambio sea permanente.
      </p>
      <button id="btn-entendido-add" class="toast-btn" style="background: linear-gradient(to right, #10b981, #059669); color: white; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
        Entendido
      </button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const btnHover = modal.querySelector("#btn-entendido-add");
    const closeModal = () => {
      overlay.style.opacity = "0";
      modal.style.transform = "scale(0.9)";
      setTimeout(() => overlay.remove(), 300);
    };

    btnHover.addEventListener("click", closeModal);

    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
      modal.style.transform = "scale(1)";
    });
  }
}

export function updateScheduleToggleAlert(enabled) {
  const alertBox = document.getElementById("schedule-enabled-alert");
  const alertText = document.getElementById("schedule-enabled-text");
  if (!alertBox || !alertText) return;

  if (enabled) {
    alertBox.className = "schedule-enabled-alert";
    alertText.innerHTML = `
      <span style="display:inline-flex; align-items:center; gap:6px;">
        <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#166534;"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Los reportes se despacharán automáticamente según las horas fijadas a continuación.</span>
      </span>
    `;
  } else {
    alertBox.className = "schedule-enabled-alert disabled";
    alertText.innerHTML = `
      <span style="display:inline-flex; align-items:center; gap:6px;">
        <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#991b1b;"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>
        <span>Los envíos automáticos están pausados temporalmente. No se emitirán reportes hasta reactivarlo.</span>
      </span>
    `;
  }
}

export function renderScheduleHistory(history) {
  const tbody = document.getElementById("schedule-history-tbody");
  const countBadge = document.getElementById("schedule-history-count");
  if (!tbody) return;

  if (countBadge) {
    countBadge.textContent = `${history.length} despachos`;
  }

  if (!history || history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:24px;">No se registran envíos automáticos recientes</td></tr>`;
    return;
  }

  tbody.innerHTML = history.map((item) => {
    const isExito = item.estado === "EXITO";
    const estadoBadge = isExito
      ? `<span class="badge badge-success">Entregado</span>`
      : `<span class="badge badge-danger">Fallo</span>`;

    const tipoBadge = item.tipo === "PRUEBA_MANUAL"
      ? `<span class="badge badge-info">Prueba Manual</span>`
      : `<span class="badge badge-primary">Automático</span>`;

    const slaText = item.slaPDI ? `${item.slaPDI}%` : "N/D";
    const enroladosText = item.totalEnrolados !== undefined ? item.totalEnrolados.toLocaleString("es-CL") : "-";

    return `
      <tr>
        <td style="font-weight:600; color:var(--pdi-navy);">
          <code>${item.horaChile || item.timestamp?.slice(0, 19).replace('T', ' ') || '-'}</code>
        </td>
        <td>${tipoBadge}</td>
        <td><code>${item.fechaReportada || '-'}</code></td>
        <td style="text-align:right; font-weight:700;">${enroladosText}</td>
        <td><span class="badge badge-success">${slaText} SLA</span></td>
        <td><small>${item.canal || 'Telegram'}</small></td>
        <td>${estadoBadge}</td>
        <td><small><code>#${item.messageId || 'N/D'}</code></small></td>
      </tr>
    `;
  }).join("");
}

export function setupScheduleEvents() {
  // Toggle Switch Habilitado
  const toggle = document.getElementById("schedule-enabled-toggle");
  if (toggle) {
    toggle.addEventListener("change", (e) => {
      updateScheduleToggleAlert(e.target.checked);
    });
  }

  // Botón Añadir Horario
  const btnAddTime = document.getElementById("btn-add-time");
  const inputNewTime = document.getElementById("input-new-time");
  if (btnAddTime && inputNewTime) {
    btnAddTime.addEventListener("click", () => {
      agregarHorario(inputNewTime.value);
    });
  }

  // Botones de Preajustes Operativos PDI
  document.querySelectorAll(".preset-pill-btn[data-add-time]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const timeToAdd = btn.getAttribute("data-add-time");
      agregarHorario(timeToAdd);
    });
  });

  // Selector rápido Días Hábiles
  const btnWeekdays = document.getElementById("btn-select-weekdays");
  if (btnWeekdays) {
    btnWeekdays.addEventListener("click", () => {
      document.querySelectorAll(".day-check").forEach((cb) => {
        const val = Number(cb.value);
        cb.checked = val >= 1 && val <= 5;
      });
    });
  }

  // Selector rápido Todos los Días
  const btnAllDays = document.getElementById("btn-select-all-days");
  if (btnAllDays) {
    btnAllDays.addEventListener("click", () => {
      document.querySelectorAll(".day-check").forEach((cb) => {
        cb.checked = true;
      });
    });
  }

  // Guardar Ajustes de Programación (Exige Clave Institucional Policial)
  const btnSaveSchedule = document.getElementById("btn-save-schedule");
  const saveFeedback = document.getElementById("schedule-save-feedback");
  if (btnSaveSchedule) {
    btnSaveSchedule.onclick = () => {
      try {
        const enabled = document.getElementById("schedule-enabled-toggle")?.checked ?? true;
        const reportType = document.getElementById("schedule-report-type")?.value || "extenso";

        const days = [];
        document.querySelectorAll(".day-check:checked").forEach((cb) => {
          days.push(Number(cb.value));
        });

        if (state.currentScheduleTimes.length === 0) {
          throw new Error("Debes definir al menos un horario para la programación.");
        }

        if (days.length === 0) {
          throw new Error("Debes seleccionar al menos un día de la semana para el despacho.");
        }

        const schedulePayload = {
          enabled,
          times: [...state.currentScheduleTimes],
          days,
          reportType,
        };

        // Solicitar clave institucional mediante el modal de seguridad policial
        promptAuthModal(schedulePayload, "programacion");

      } catch (err) {
        if (saveFeedback) {
          saveFeedback.className = "crypto-feedback-box error";
          saveFeedback.style.display = "block";
          saveFeedback.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626; margin-bottom:4px;">
              <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <span>Error de Validación</span>
            </div>
            ${err.message}
          `;
          setTimeout(() => {
            saveFeedback.style.display = "none";
          }, 4000);
        }
      }
    };
  }

  // Disparo de Prueba Inmediata a Telegram
  const btnTestSchedule = document.getElementById("btn-trigger-test-schedule");
  const testFeedback = document.getElementById("schedule-test-feedback");
  if (btnTestSchedule) {
    btnTestSchedule.onclick = async () => {
      try {
        btnTestSchedule.disabled = true;
        btnTestSchedule.innerHTML = `<span class="spinner" style="width:14px; height:14px; border-width:2px; vertical-align:middle;"></span> Conectando y enviando a Telegram...`;

        if (testFeedback) testFeedback.style.display = "none";

        const testModo = document.getElementById("test-report-modo")?.value || "";
        const testAdjuntos = document.getElementById("test-report-adjuntos")?.checked ?? true;

        const res = await fetch("/api/settings/schedule/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modo: testModo, incluirAdjuntos: testAdjuntos }),
        });

        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Fallo en el despacho de prueba.");

        if (typeof window.showTelegramPopup === "function") {
          const formattedDate = new Date().toLocaleDateString("es-CL", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          window.showTelegramPopup("Se ha realizado el envío del reporte de prueba exitosamente.", formattedDate);
        } else if (testFeedback) {
          testFeedback.className = "crypto-feedback-box success";
          testFeedback.style.display = "block";
          testFeedback.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:var(--status-success); margin-bottom:4px;">
              <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:var(--status-success);"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Reporte de Prueba Despachado Exitosamente</span>
            </div>
            • Canal: <strong>Telegram Oficial PDI</strong><br>
            • Message ID: <code>#${data.resultado?.messageId || 'N/D'}</code><br>
            • Período: <code>${data.resultado?.fechaReportada || 'Actual'}</code> (${data.resultado?.totalEnrolados?.toLocaleString("es-CL")} registros)<br>
            • SLA: <strong>${data.resultado?.slaPDI}% Conforme</strong>
          `;
        }

        // Recargar historial para ver la nueva fila
        loadScheduleSettings();

      } catch (err) {
        if (testFeedback) {
          testFeedback.className = "crypto-feedback-box error";
          testFeedback.style.display = "block";
          testFeedback.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626;">
              <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <span>Error al despachar prueba:</span>
            </div>
            ${err.message}
          `;
        }
      } finally {
        btnTestSchedule.disabled = false;
        btnTestSchedule.innerHTML = `
          <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          <span>Enviar Reporte de Prueba a Telegram Ahora</span>
        `;
      }
    };
  }

  // Botón Refrescar Historial
  const btnRefreshHistory = document.getElementById("btn-refresh-schedule-history");
  if (btnRefreshHistory) {
    btnRefreshHistory.addEventListener("click", () => {
      loadScheduleSettings();
    });
  }

  // Inicializar eventos del gestor de destinatarios
  setupDestinatariosTelegramEvents();
}

export async function cargarDestinatariosTelegram() {
  const tbody = document.getElementById("destinatarios-table-body");
  try {
    const res = await fetch("/api/telegram/destinatarios");
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Fallo al consultar destinatarios.");

    state.telegramDestinatarios = data.destinatarios || [];

    if (data.botInfo && data.botInfo.link) {
      state.telegramBotLink = data.botInfo.link;
      const linkDirecto = document.getElementById("link-directo-bot");
      const labelLink = document.getElementById("label-link-bot");
      if (linkDirecto) {
        linkDirecto.href = data.botInfo.link;
      }
      if (labelLink) {
        labelLink.textContent = `Abrir @${data.botInfo.username}`;
      }
    }

    renderTablaDestinatarios(state.telegramDestinatarios);

  } catch (err) {
    console.error("Error al cargar destinatarios de Telegram:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; color:#dc2626; padding:16px;">
            Error cargando destinatarios: ${err.message}
          </td>
        </tr>
      `;
    }
  }
}

export function renderTablaDestinatarios(destinatarios) {
  const tbody = document.getElementById("destinatarios-table-body");
  const countBadge = document.getElementById("destinatarios-count-badge");
  if (!tbody) return;

  if (countBadge) {
    const total = (destinatarios || []).length;
    const activos = (destinatarios || []).filter(d => d.activo).length;
    countBadge.textContent = `${total} ${total === 1 ? 'destinatario' : 'destinatarios'} (${activos} activos)`;
  }

  if (!destinatarios || destinatarios.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">No hay destinatarios registrados aún. Asigne uno usando el formulario superior.</td></tr>`;
    return;
  }

  tbody.innerHTML = destinatarios.map((d) => {
    const estadoBadge = d.activo
      ? `<span class="badge-active"><svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#15803d;"><polyline points="20 6 9 17 4 12"/></svg> Activo</span>`
      : `<span class="badge-paused"><svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#64748b;"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg> Pausado</span>`;

    const toggleText = d.activo ? "Pausar" : "Activar";
    const toggleIcon = d.activo
      ? `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>`
      : `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;

    const testButtonHtml = d.activo
      ? `<button type="button" class="btn-dest-action btn-dest-test" onclick="probarDestinatarioIndividual(${d.id}, '${escaparHtml(d.nombre).replace(/'/g, "\\'")}', this)" title="Enviar mensaje de prueba individual a este destinatario">
           <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>
           <span>Probar</span>
         </button>`
      : `<button type="button" class="btn-dest-action btn-dest-test" disabled style="opacity: 0.45; cursor: not-allowed;" title="No es posible probar porque el oficial está pausado. Actívelo primero para enviar pruebas.">
           <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>
           <span>Probar</span>
         </button>`;

    return `
      <tr>
        <td style="font-weight:600; color:var(--pdi-navy);">
          ${escaparHtml(d.nombre)}
        </td>
        <td>
          <code>${escaparHtml(d.chat_id)}</code>
        </td>
        <td>
          <span class="badge badge-info">${escaparHtml(d.rol_unidad || "General")}</span>
        </td>
        <td>${estadoBadge}</td>
        <td><small style="color:var(--text-muted);">${d.fecha_registro || '-'}</small></td>
        <td style="text-align:center;">
          <div class="dest-actions-group">
            ${testButtonHtml}
            <button type="button" class="btn-dest-action btn-dest-toggle" onclick="solicitarToggleDestinatario(${d.id}, '${escaparHtml(d.nombre).replace(/'/g, "\\'")}', '${d.chat_id}', ${d.activo})" title="${toggleText} envíos para este oficial">
              ${toggleIcon}
              <span>${toggleText}</span>
            </button>
            <button type="button" class="btn-dest-action btn-dest-delete" onclick="solicitarEliminarDestinatario(${d.id}, '${escaparHtml(d.nombre).replace(/'/g, "\\'")}', '${d.chat_id}')" title="Eliminar este oficial del sistema">
              <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              <span>Eliminar</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

export function setupDestinatariosTelegramEvents() {
  // Formulario nuevo destinatario
  const form = document.getElementById("form-nuevo-destinatario");
  const destFeedback = document.getElementById("dest-feedback");

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const nombre = document.getElementById("dest-nombre")?.value?.trim();
      const chatId = document.getElementById("dest-chat-id")?.value?.trim();
      const rolUnidad = document.getElementById("dest-rol")?.value?.trim() || "Operativo";

      if (!nombre) {
        alert("Por favor ingrese el nombre u oficial.");
        return;
      }
      if (!chatId || !/^-?\d+$/.test(chatId)) {
        alert("El Chat ID debe ser un número entero válido de Telegram (ej: 7961617813).");
        return;
      }

      promptAuthModal({ nombre, chatId, rolUnidad }, "destinatario_agregar");
    });
  }

  // Botón Copiar Enlace Directo
  const btnCopiar = document.getElementById("btn-copiar-link-bot");
  if (btnCopiar) {
    btnCopiar.addEventListener("click", () => {
      const link = state.telegramBotLink || "https://t.me/AbisSystemBot";
      navigator.clipboard.writeText(link).then(() => {
        const textEl = document.getElementById("text-copiar-link-bot");
        if (textEl) {
          const prev = textEl.textContent;
          textEl.textContent = "¡Enlace Copiado!";
          setTimeout(() => { textEl.textContent = prev; }, 3000);
        }
      }).catch(() => {
        prompt("Copie el enlace directo del bot para enviarlo al destinatario:", link);
      });
    });
  }

  // Botón Actualizar Lista
  const btnRefresh = document.getElementById("btn-refresh-destinatarios");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      cargarDestinatariosTelegram();
    });
  }
}

export async function executeAgregarDestinatarioAuthorized(payload, clave) {
  const modalDialog = document.querySelector("#modal-auth-ingesta .modal-dialog");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");
  const claveInput = document.getElementById("input-auth-clave");
  const destFeedback = document.getElementById("dest-feedback");

  try {
    const res = await fetch("/api/telegram/destinatarios", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ingesta-Auth": clave,
      },
      body: JSON.stringify({
        ...payload,
        clave,
      }),
    });

    const data = await res.json();

    if (res.status === 401 || data.codigo === "AUTH_REQUIRED") {
      if (modalDialog) {
        modalDialog.classList.remove("modal-shake");
        void modalDialog.offsetWidth;
        modalDialog.classList.add("modal-shake");
      }
      if (errorMsg) {
        errorMsg.innerHTML = `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Clave no autorizada. Verifique su credencial.`;
        errorMsg.style.display = "flex";
      }
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<span>Reintentar Autorización</span>`;
      }
      if (claveInput) {
        claveInput.select();
        claveInput.focus();
      }
      return;
    }

    if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo registrar el destinatario.");

    closeAuthModal();

    // Limpiar campos del formulario
    const form = document.getElementById("form-nuevo-destinatario");
    if (form) form.reset();
    const destRol = document.getElementById("dest-rol");
    if (destRol) destRol.value = "Operativo";

    if (destFeedback) {
      destFeedback.className = "crypto-feedback-box success";
      destFeedback.style.display = "block";
      destFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:var(--status-success); margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:var(--status-success);"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Oficial Asignado Exitosamente</span>
        </div>
        ${data.mensaje}
      `;
      setTimeout(() => { destFeedback.style.display = "none"; }, 5000);
    }

    await cargarDestinatariosTelegram();

  } catch (err) {
    closeAuthModal();
    if (destFeedback) {
      destFeedback.className = "crypto-feedback-box error";
      destFeedback.style.display = "block";
      destFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626; margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>Error al Asignar Destinatario</span>
        </div>
        ${err.message}
      `;
    }
  }
}

export async function executeToggleDestinatarioAuthorized(payload, clave) {
  const modalDialog = document.querySelector("#modal-auth-ingesta .modal-dialog");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");
  const claveInput = document.getElementById("input-auth-clave");
  const destFeedback = document.getElementById("dest-feedback");

  try {
    const res = await fetch(`/api/telegram/destinatarios/${payload.id}/toggle`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Ingesta-Auth": clave,
      },
      body: JSON.stringify({
        activo: payload.nuevoEstado,
        clave,
      }),
    });

    const data = await res.json();

    if (res.status === 401 || data.codigo === "AUTH_REQUIRED") {
      if (modalDialog) {
        modalDialog.classList.remove("modal-shake");
        void modalDialog.offsetWidth;
        modalDialog.classList.add("modal-shake");
      }
      if (errorMsg) {
        errorMsg.innerHTML = `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Clave no autorizada. Verifique su credencial.`;
        errorMsg.style.display = "flex";
      }
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<span>Reintentar Autorización</span>`;
      }
      if (claveInput) {
        claveInput.select();
        claveInput.focus();
      }
      return;
    }

    if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo actualizar el estado.");

    closeAuthModal();

    if (destFeedback) {
      destFeedback.className = "crypto-feedback-box success";
      destFeedback.style.display = "block";
      destFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:var(--status-success); margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:var(--status-success);"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Estado Actualizado</span>
        </div>
        ${data.mensaje}
      `;
      setTimeout(() => { destFeedback.style.display = "none"; }, 4000);
    }

    await cargarDestinatariosTelegram();

  } catch (err) {
    closeAuthModal();
    if (destFeedback) {
      destFeedback.className = "crypto-feedback-box error";
      destFeedback.style.display = "block";
      destFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626; margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>Error de Actualización</span>
        </div>
        ${err.message}
      `;
    }
  }
}

export async function executeEliminarDestinatarioAuthorized(payload, clave) {
  const modalDialog = document.querySelector("#modal-auth-ingesta .modal-dialog");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");
  const claveInput = document.getElementById("input-auth-clave");
  const destFeedback = document.getElementById("dest-feedback");

  try {
    const res = await fetch(`/api/telegram/destinatarios/${payload.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-Ingesta-Auth": clave,
      },
      body: JSON.stringify({ clave }),
    });

    const data = await res.json();

    if (res.status === 401 || data.codigo === "AUTH_REQUIRED") {
      if (modalDialog) {
        modalDialog.classList.remove("modal-shake");
        void modalDialog.offsetWidth;
        modalDialog.classList.add("modal-shake");
      }
      if (errorMsg) {
        errorMsg.innerHTML = `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Clave no autorizada. Verifique su credencial.`;
        errorMsg.style.display = "flex";
      }
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<span>Reintentar Autorización</span>`;
      }
      if (claveInput) {
        claveInput.select();
        claveInput.focus();
      }
      return;
    }

    if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo eliminar el destinatario.");

    closeAuthModal();

    if (destFeedback) {
      destFeedback.className = "crypto-feedback-box success";
      destFeedback.style.display = "block";
      destFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:var(--status-success); margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:var(--status-success);"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Destinatario Eliminado</span>
        </div>
        ${data.mensaje}
      `;
      setTimeout(() => { destFeedback.style.display = "none"; }, 4000);
    }

    await cargarDestinatariosTelegram();

  } catch (err) {
    closeAuthModal();
    if (destFeedback) {
      destFeedback.className = "crypto-feedback-box error";
      destFeedback.style.display = "block";
      destFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626; margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>Error de Eliminación</span>
        </div>
        ${err.message}
      `;
    }
  }
}

export async function executeSaveScheduleAuthorized(scheduleData, clave) {
  const modal = document.getElementById("modal-auth-ingesta");
  const modalDialog = document.querySelector("#modal-auth-ingesta .modal-dialog");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");
  const claveInput = document.getElementById("input-auth-clave");
  const saveFeedback = document.getElementById("schedule-save-feedback");

  try {
    const res = await fetch("/api/settings/schedule", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ingesta-Auth": clave,
      },
      body: JSON.stringify({
        ...scheduleData,
        clave,
      }),
    });

    const data = await res.json();

    if (res.status === 401 || data.codigo === "AUTH_REQUIRED") {
      if (modalDialog) {
        modalDialog.classList.remove("modal-shake");
        void modalDialog.offsetWidth;
        modalDialog.classList.add("modal-shake");
      }
      if (errorMsg) {
        errorMsg.innerHTML = `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Clave de autorización no válida. Verifique su credencial policial.`;
        errorMsg.style.display = "flex";
      }
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `
          <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          <span>Autorizar y Guardar Ajustes</span>
        `;
      }
      if (claveInput) {
        claveInput.select();
        claveInput.focus();
      }
      return;
    }

    if (!data.ok) throw new Error(data.error || "Fallo al guardar.");

    // Autorización exitosa: cerrar modal
    closeAuthModal();

    if (saveFeedback) {
      saveFeedback.className = "crypto-feedback-box success";
      saveFeedback.style.display = "block";
      saveFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:var(--status-success); margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:var(--status-success);"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Ajustes Guardados y Autorizados Exitosamente</span>
        </div>
        • Horarios activos: <strong>${data.config.times.join(", ")} hrs</strong><br>
        • Próxima ejecución: <strong>${data.next?.text || 'Calculando...'}</strong><br>
        • Frecuencia: <strong>${data.config.times.length} despachos diarios programados</strong>
      `;
      setTimeout(() => {
        saveFeedback.style.display = "none";
      }, 6000);
    }

    // Actualizar badge de próximo envío
    const nextBadge = document.getElementById("schedule-next-text");
    if (nextBadge && data.next) {
      nextBadge.textContent = `Próximo Envío: ${data.next.text}`;
    }

    // Actualizar frecuencia en el cuadro lateral
    const freqSummary = document.getElementById("schedule-freq-summary");
    if (freqSummary && data.config?.times) {
      freqSummary.textContent = `${data.config.times.length} ${data.config.times.length === 1 ? 'envío' : 'envíos'} al día (${data.config.times.join(', ')} hrs)`;
    }

    // Actualizar historial de envíos si la función existe
    if (typeof cargarHistorialDespachos === "function") {
      cargarHistorialDespachos();
    }

  } catch (err) {
    closeAuthModal();
    if (saveFeedback) {
      saveFeedback.className = "crypto-feedback-box error";
      saveFeedback.style.display = "block";
      saveFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626; margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>Error al Guardar Ajustes</span>
        </div>
        ${err.message}
      `;
    }
  }
}

