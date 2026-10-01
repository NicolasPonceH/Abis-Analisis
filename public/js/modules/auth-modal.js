import { handleFileUpload, executeSheetIngestAuthorized } from './ingesta.js';
import { executeAgregarDestinatarioAuthorized, executeToggleDestinatarioAuthorized, executeEliminarDestinatarioAuthorized, executeSaveScheduleAuthorized } from './ajustes.js';

export let pendingAuthFile = null;

export let pendingAuthAction = "ingesta";

export function promptAuthModal(file, actionType = "ingesta") {
  pendingAuthFile = file;
  pendingAuthAction = actionType;

  const modal = document.getElementById("modal-auth-ingesta");
  const titleEl = document.getElementById("modal-title-text");
  const subtitleEl = document.getElementById("modal-subtitle-text");
  const warningEl = document.getElementById("modal-warning-text");
  const fileNameEl = document.getElementById("modal-file-name");
  const fileDetailsEl = document.getElementById("modal-file-details");
  const summaryIconEl = document.getElementById("modal-summary-icon");
  const claveInput = document.getElementById("input-auth-clave");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");

  if (!modal) return;

  if (actionType === "programacion") {
    if (summaryIconEl) {
      summaryIconEl.innerHTML = `
        <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" style="stroke: var(--pdi-navy);">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      `;
    }
    if (titleEl) titleEl.textContent = "Autorización de Seguridad Policial";
    if (subtitleEl) subtitleEl.textContent = "Control de Acceso para Guardar Programación de Reportes";
    if (warningEl) warningEl.textContent = "Para modificar y guardar los horarios de despacho automático a Telegram se requiere verificar su credencial policial autorizada.";
    if (confirmBtn) {
      confirmBtn.innerHTML = `
        <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        <span>Autorizar y Guardar Ajustes</span>
      `;
    }
    if (fileNameEl) {
      fileNameEl.textContent = `Horarios: ${file.times.join(", ")} hrs (${file.times.length} ${file.times.length === 1 ? 'despacho' : 'despachos'} al día)`;
    }
    if (fileDetailsEl) {
      const tipo = file.reportType === "extenso" ? "Reporte Extenso Oficial PDI" : "Resumen Ejecutivo";
      fileDetailsEl.textContent = `${file.days.length} días activos por semana • ${tipo}`;
    }
  } else if (actionType === "destinatario_agregar") {
    if (summaryIconEl) {
      summaryIconEl.innerHTML = `
        <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" style="stroke: #0284c7;">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="8.5" cy="7" r="4"/>
          <line x1="20" y1="8" x2="20" y2="14"/>
          <line x1="23" y1="11" x2="17" y2="11"/>
        </svg>
      `;
    }
    if (titleEl) titleEl.textContent = "Autorización de Destinatario Policial";
    if (subtitleEl) subtitleEl.textContent = "Asignación de Nuevo Oficial / Canal en Telegram";
    if (warningEl) warningEl.textContent = "Para registrar y asignar una nueva ID de Telegram para recibir reportes se requiere verificar su credencial policial autorizada.";
    if (confirmBtn) {
      confirmBtn.innerHTML = `
        <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span>Autorizar y Asignar ID</span>
      `;
    }
    if (fileNameEl) fileNameEl.textContent = `${file.nombre} (Chat ID: ${file.chatId})`;
    if (fileDetailsEl) fileDetailsEl.textContent = `Rol/Unidad: ${file.rolUnidad || 'Operativo'} • Almacenamiento Seguro PostgreSQL`;
  } else if (actionType === "destinatario_toggle") {
    if (summaryIconEl) {
      summaryIconEl.innerHTML = `
        <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" style="stroke: #0284c7;">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      `;
    }
    const accionTexto = file.nuevoEstado ? "Activar" : "Pausar";
    if (titleEl) titleEl.textContent = `Autorización para ${accionTexto} Destinatario`;
    if (subtitleEl) subtitleEl.textContent = "Modificación de Estado Operativo de Notificaciones";
    if (warningEl) warningEl.textContent = `Para ${accionTexto.toLowerCase()} el envío de reportes a este oficial se requiere verificar su credencial policial autorizada.`;
    if (confirmBtn) {
      confirmBtn.innerHTML = `<span>Autorizar y ${accionTexto}</span>`;
    }
    if (fileNameEl) fileNameEl.textContent = `${file.nombre} (Chat ID: ${file.chatId})`;
    if (fileDetailsEl) fileDetailsEl.textContent = `Nuevo estado solicitado: ${file.nuevoEstado ? 'Activo (Recibirá Reportes)' : 'Pausado (Sin Envíos)'}`;
  } else if (actionType === "destinatario_eliminar") {
    if (summaryIconEl) {
      summaryIconEl.innerHTML = `
        <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" style="stroke: #dc2626;">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      `;
    }
    if (titleEl) titleEl.textContent = "Autorización para Eliminar Destinatario";
    if (subtitleEl) subtitleEl.textContent = "Revocación y Desvinculación de Oficial en Telegram";
    if (warningEl) warningEl.textContent = "Esta acción eliminará de forma permanente al oficial de la lista de destinatarios. Se requiere credencial policial.";
    if (confirmBtn) {
      confirmBtn.innerHTML = `<span>Autorizar y Eliminar</span>`;
    }
    if (fileNameEl) fileNameEl.textContent = `${file.nombre} (Chat ID: ${file.chatId})`;
    if (fileDetailsEl) fileDetailsEl.textContent = `Acción: Eliminación de PostgreSQL`;
  } else if (actionType === "sheet_ingest") {
    if (summaryIconEl) {
      summaryIconEl.innerHTML = `
        <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" style="stroke: #10b981;">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="3" y1="15" x2="21" y2="15"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
          <line x1="15" y1="3" x2="15" y2="21"/>
        </svg>
      `;
    }
    if (titleEl) titleEl.textContent = "Autorización de Ingesta desde Hoja de Cálculo";
    if (subtitleEl) subtitleEl.textContent = "Control de Acceso para Inserción Directa en Base de Datos";
    if (warningEl) warningEl.textContent = "Para insertar los registros copiados del portapapeles a PostgreSQL se requiere verificar su credencial policial de operador autorizado.";
    if (confirmBtn) {
      confirmBtn.innerHTML = `
        <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        <span>Autorizar e Ingestar en BD</span>
      `;
    }
    if (fileNameEl) {
      fileNameEl.textContent = `Hoja de Cálculo / Portapapeles (${(file.rows ? file.rows.length : 0).toLocaleString()} filas)`;
    }
    if (fileDetailsEl) {
      const colCount = file.headers ? file.headers.length : 0;
      fileDetailsEl.textContent = `${colCount} columnas detectadas • Inserción Transaccional PostgreSQL`;
    }
  } else {
    // Ingesta por defecto
    if (summaryIconEl) {
      summaryIconEl.innerHTML = `
        <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" style="stroke: var(--pdi-navy);">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      `;
    }
    if (titleEl) titleEl.textContent = "Autorización de Seguridad";
    if (subtitleEl) subtitleEl.textContent = "Control de Acceso para Ingesta y Poblado de Base de Datos";
    if (warningEl) warningEl.textContent = "Para poblar la base de datos se requiere verificar su credencial policial de operador autorizado.";
    if (confirmBtn) {
      confirmBtn.innerHTML = `
        <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        <span>Autorizar y Poblar BD</span>
      `;
    }
    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileDetailsEl) {
      const sizeMb = (file.size / 1024 / 1024).toFixed(2);
      const tipoDesc = file.name.toLowerCase().endsWith(".enc")
        ? "Archivo Cifrado AES-256-GCM"
        : "Planilla Excel (Oracle ABIS)";
      fileDetailsEl.textContent = `${sizeMb} MB • ${tipoDesc}`;
    }
  }

  if (claveInput) {
    claveInput.value = "";
    claveInput.type = "password";
  }
  if (errorMsg) errorMsg.style.display = "none";
  if (confirmBtn) confirmBtn.disabled = false;

  modal.style.display = "flex";
  setTimeout(() => {
    if (claveInput) claveInput.focus();
  }, 100);
}

export function closeAuthModal() {
  const modal = document.getElementById("modal-auth-ingesta");
  if (modal) modal.style.display = "none";
  pendingAuthFile = null;
  const fileInput = document.getElementById("file-input");
  if (fileInput) fileInput.value = "";
}

export function setupAuthModalEvents() {
  const modal = document.getElementById("modal-auth-ingesta");
  const btnClose = document.getElementById("btn-modal-auth-close");
  const btnCancel = document.getElementById("btn-modal-auth-cancel");
  const btnConfirm = document.getElementById("btn-modal-auth-confirm");
  const btnEye = document.getElementById("btn-toggle-password");
  const claveInput = document.getElementById("input-auth-clave");

  if (btnClose) btnClose.addEventListener("click", closeAuthModal);
  if (btnCancel) btnCancel.addEventListener("click", closeAuthModal);

  // Cerrar al hacer clic fuera del diálogo
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAuthModal();
    });
  }

  // Ver / Ocultar clave
  if (btnEye && claveInput) {
    btnEye.addEventListener("click", () => {
      const isPassword = claveInput.type === "password";
      claveInput.type = isPassword ? "text" : "password";
      const eyeIcon = document.getElementById("eye-icon");
      if (eyeIcon) {
        eyeIcon.innerHTML = isPassword
          ? `<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>`
          : `<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>`;
      }
    });
  }

  // Confirmar con Enter
  if (claveInput) {
    claveInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmAuthorizedUpload();
      }
    });
  }

  // Botón confirmar
  if (btnConfirm) {
    btnConfirm.addEventListener("click", confirmAuthorizedUpload);
  }
}

export async function confirmAuthorizedUpload() {
  if (!pendingAuthFile) {
    closeAuthModal();
    return;
  }

  const claveInput = document.getElementById("input-auth-clave");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");

  const clave = claveInput?.value?.trim();

  if (!clave) {
    if (errorMsg) {
      errorMsg.innerHTML = `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Ingrese la clave de autorización policial`;
      errorMsg.style.display = "flex";
    }
    if (claveInput) claveInput.focus();
    return;
  }

  // Bloquear botón con spinner
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `<span class="spinner" style="width:14px;height:14px;border-width:2px;vertical-align:middle;"></span> Verificando credencial...`;
  }
  if (errorMsg) errorMsg.style.display = "none";

  if (pendingAuthAction === "programacion") {
    await executeSaveScheduleAuthorized(pendingAuthFile, clave);
  } else if (pendingAuthAction === "destinatario_agregar") {
    await executeAgregarDestinatarioAuthorized(pendingAuthFile, clave);
  } else if (pendingAuthAction === "destinatario_toggle") {
    await executeToggleDestinatarioAuthorized(pendingAuthFile, clave);
  } else if (pendingAuthAction === "destinatario_eliminar") {
    await executeEliminarDestinatarioAuthorized(pendingAuthFile, clave);
  } else if (pendingAuthAction === "sheet_ingest") {
    await executeSheetIngestAuthorized(pendingAuthFile, clave);
  } else {
    await handleFileUpload(pendingAuthFile, clave);
  }
}

