import { state } from '../core/state.js';
import { escapeHtml } from '../core/utils.js';
import { promptAuthModal, closeAuthModal, setupAuthModalEvents } from './auth-modal.js';
import { loadMetrics } from './panel-ejecutivo.js';
import { loadTrendData } from './tendencias.js';
import { cargarBitacoraAuditoria } from './auditoria.js';
import { checkSystemHealth, loadAvailableDates } from '../app.js';

export const sheetState = {
  headers: [],
  rows: [],
};

export const SHEET_SCHEMA = [
  { field: "fechaEnrolamiento", label: "Fecha", required: true, aliases: ["fecha", "fecha_enrolamiento", "fecha enrolamiento"] },
  { field: "nacionalidad", label: "Nacionalidad", required: true, aliases: ["nacionalidad", "documento_emitido", "emitido en", "documento_emitido_1"] },
  { field: "region", label: "Región", required: false, aliases: ["region", "región", "region2"] },
  { field: "unidad", label: "Unidad Policial", required: true, aliases: ["unidad"] },
  { field: "cuartel", label: "Cuartel", required: true, aliases: ["cuartel", "cuartel_new", "cuartelnew"] },
  { field: "equipo", label: "Equipo ABIS", required: true, aliases: ["equipo", "dispositivo"] },
  { field: "genero", label: "Género", required: true, aliases: ["genero", "género"] },
  { field: "mayorEdad", label: "Rango Etario", required: true, aliases: ["mayor de edad", "rango_etario", "edades", "mayor edad"] },
  { field: "edadExacta", label: "Edad", required: false, aliases: ["edad", "edad exacta", "edad_1"] },
  { field: "estadoSincronizacion", label: "Sincronización PDI", required: true, aliases: ["estado sincronizacion", "sincronización pdi", "sincronizacion_pdi", "sincronizacion pdi", "estado sincronización"] },
  { field: "estadoRegistro", label: "Registración Biométrica", required: true, aliases: ["estado registro", "registración biométrica", "registracion_biometrica", "registracion biometrica"] },
  { field: "estadoGeneral", label: "Estado General", required: true, aliases: ["estado general", "estado_general"] },
  { field: "profesion", label: "Profesión / Ocupación", required: false, aliases: ["profesion", "cod_profesion", "profesión", "oficio", "ocupacion", "ocupación", "region 2", "región 2", "REGION2"] },
];

export function setupDragAndDrop() {
  const dropzone = document.getElementById("upload-dropzone");
  const fileInput = document.getElementById("file-input");
  const btnSelect = document.getElementById("btn-select-file");

  if (!dropzone || !fileInput) return;

  if (btnSelect) {
    btnSelect.addEventListener("click", () => fileInput.click());
  }
  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      promptAuthModal(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      promptAuthModal(e.target.files[0]);
    }
  });

  // Eventos del Modal de Autorización Policial
  setupAuthModalEvents();
}

export async function handleFileUpload(file, clave) {
  const modal = document.getElementById("modal-auth-ingesta");
  const modalDialog = document.querySelector("#modal-auth-ingesta .modal-dialog");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");
  const claveInput = document.getElementById("input-auth-clave");

  const resultsDiv = document.getElementById("upload-results");
  const statusDiv = document.getElementById("upload-status");

  const formData = new FormData();
  formData.append("archivo", file);
  formData.append("clave", clave);

  let progressOverlay = null;

  try {
    progressOverlay = showIngestProgress();
    const res = await fetch("/api/ingest/upload", {
      method: "POST",
      headers: {
        "X-Ingesta-Auth": clave,
      },
      body: formData,
    });

    const data = await res.json();

    if (res.status === 401 || data.codigo === "AUTH_REQUIRED") {
      // Clave incorrecta: mostrar feedback en el modal
      if (modalDialog) {
        modalDialog.classList.remove("modal-shake");
        void modalDialog.offsetWidth; // reiniciar animación
        modalDialog.classList.add("modal-shake");
      }
      if (errorMsg) {
        errorMsg.innerHTML = `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Clave de autorización no válida. Verifique su credencial.`;
        errorMsg.style.display = "flex";
      }
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `
          <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          <span>Autorizar y Poblar BD</span>
        `;
      }
      if (claveInput) {
        claveInput.select();
        claveInput.focus();
      }
      if (progressOverlay && progressOverlay.parentNode) {
        progressOverlay.parentNode.removeChild(progressOverlay);
      }
      return;
    }

    if (progressOverlay) finishIngestProgress(progressOverlay);
    
    // Autorización exitosa: cerrar modal
    closeAuthModal();

    if (resultsDiv) resultsDiv.style.display = "block";

    if (res.ok && data.ok) {
      if (statusDiv) {
        statusDiv.innerHTML = `
          <div class="alert alert-success">
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" style="stroke:var(--status-success);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <strong style="font-size:1rem;">Ingesta Autorizada y Auditada Exitosamente</strong>
              </div>
              <div style="margin-top:8px; line-height:1.6;">
                &bull; <strong>Archivo:</strong> ${data.nombreOriginal}<br>
                &bull; <strong>Formato Criptográfico:</strong> ${data.estaCifrado ? '<span class="badge badge-success" style="display:inline-flex; align-items:center; gap:4px;"><svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg> AES-256-GCM Descifrado en RAM</span>' : '<span class="badge badge-info" style="display:inline-flex; align-items:center; gap:4px;"><svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> Archivo Estándar .xlsx</span>'}<br>
                &bull; <strong>Registros Insertados en BD:</strong> <strong>${data.totalInsertadas.toLocaleString()}</strong> filas<br>
                &bull; <strong>Inconsistencias Registradas:</strong> ${data.erroresFilas}<br>
                &bull; <strong>Tiempo de Inserción:</strong> ${(data.duracionMs / 1000).toFixed(2)} segundos<br>
                &bull; <strong>Huella de Integridad SHA-256:</strong> <code>${data.hashSHA256}</code><br>
                &bull; <strong>Auditoría:</strong> Evento <code>INGESTA_EXCEL_AUTORIZADA</code> guardado en bitácora inmutable.
              </div>
            </div>
          </div>
        `;
      }

      await loadAvailableDates();
      await loadMetrics();
      await loadTrendData();
      await checkSystemHealth();
    } else {
      if (statusDiv) {
        statusDiv.innerHTML = `
          <div class="alert alert-error">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
              <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" style="stroke:#ef4444;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <strong>Error en la Ingesta:</strong>
            </div>
            ${data.error || "Ocurrió un error al procesar el archivo."}
          </div>
        `;
      }
    }
  } catch (err) {
    if (progressOverlay && progressOverlay.parentNode) {
      progressOverlay.parentNode.removeChild(progressOverlay);
    }
    closeAuthModal();
    if (resultsDiv) resultsDiv.style.display = "block";
    if (statusDiv) {
      statusDiv.innerHTML = `
        <div class="alert alert-error">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" style="stroke:#ef4444;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <strong>Error de Conexión:</strong>
          </div>
          ${err.message}
        </div>
      `;
    }
  }
}

export function initSpreadsheetIngest() {
  const btnModeSheet = document.getElementById("btn-mode-sheet");
  const btnModeFile = document.getElementById("btn-mode-file");
  const viewSheet = document.getElementById("ingesta-view-sheet");
  const viewFile = document.getElementById("ingesta-view-file");

  if (btnModeSheet && btnModeFile) {
    btnModeSheet.addEventListener("click", () => {
      btnModeSheet.classList.add("active");
      btnModeFile.classList.remove("active");
      if (viewSheet) viewSheet.style.display = "block";
      if (viewFile) viewFile.style.display = "none";
    });

    btnModeFile.addEventListener("click", () => {
      btnModeFile.classList.add("active");
      btnModeSheet.classList.remove("active");
      if (viewFile) viewFile.style.display = "block";
      if (viewSheet) viewSheet.style.display = "none";
    });
  }

  // Captura global de evento 'paste' cuando se está en la pestaña de ingesta
  document.addEventListener("paste", (e) => {
    if (state.activeTab !== "ingesta") return;
    const authModal = document.getElementById("modal-auth-ingesta");
    if (authModal && authModal.style.display === "flex") return;

    if (document.activeElement && document.activeElement.id === "sheet-hidden-paste-area") return;

    const clipboardText = e.clipboardData ? e.clipboardData.getData("text") : "";
    if (clipboardText && clipboardText.trim().length > 0) {
      e.preventDefault();
      handlePastedClipboardText(clipboardText);
    }
  });

  const btnPasteClipboard = document.getElementById("btn-paste-clipboard");
  if (btnPasteClipboard) {
    btnPasteClipboard.addEventListener("click", async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (text && text.trim().length > 0) {
            handlePastedClipboardText(text);
            return;
          }
        }
      } catch (err) {
        console.warn("Acceso directo a portapapeles restringido:", err.message);
      }
      const textarea = document.getElementById("sheet-hidden-paste-area");
      if (textarea) {
        textarea.focus();
        textarea.placeholder = "Por favor pega aquí los datos con Ctrl + V...";
      }
    });
  }

  const dropzoneArea = document.getElementById("sheet-paste-dropzone");
  if (dropzoneArea) {
    dropzoneArea.addEventListener("click", (e) => {
      if (e.target.id !== "sheet-hidden-paste-area") {
        const textarea = document.getElementById("sheet-hidden-paste-area");
        if (textarea) textarea.focus();
      }
    });
  }

  const hiddenTextarea = document.getElementById("sheet-hidden-paste-area");
  if (hiddenTextarea) {
    hiddenTextarea.addEventListener("input", (e) => {
      const val = e.target.value;
      if (val && val.trim().length > 0) {
        handlePastedClipboardText(val);
        e.target.value = "";
      }
    });
  }

  const btnLoadSample = document.getElementById("btn-load-sample-sheet");
  if (btnLoadSample) {
    btnLoadSample.addEventListener("click", () => {
      loadSampleOracleData();
    });
  }

  const btnClearSheet = document.getElementById("btn-clear-sheet");
  if (btnClearSheet) {
    btnClearSheet.addEventListener("click", () => {
      clearSpreadsheetData();
    });
  }

  const btnAddRow = document.getElementById("btn-sheet-add-row");
  if (btnAddRow) {
    btnAddRow.addEventListener("click", () => {
      addEmptyRowToSpreadsheet();
    });
  }

  const btnSubmit = document.getElementById("btn-sheet-submit");
  const btnSubmitBottom = document.getElementById("btn-sheet-submit-bottom");
  const submitHandler = () => {
    submitSpreadsheetIngest();
  };
  if (btnSubmit) btnSubmit.addEventListener("click", submitHandler);
  if (btnSubmitBottom) btnSubmitBottom.addEventListener("click", submitHandler);
}

export function handlePastedClipboardText(rawText) {
  const parsed = parseClipboardData(rawText);
  if (!parsed.rows || parsed.rows.length === 0) {
    alert("No se detectaron filas tabulares válidas en el contenido pegado.");
    return;
  }
  sheetState.headers = parsed.headers;
  sheetState.rows = parsed.rows;
  renderSpreadsheetGrid();
}

export function parseClipboardData(text) {
  if (!text || typeof text !== "string") return { headers: [], rows: [] };

  const lines = text
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  const firstLine = lines[0];
  let delim = "\t";
  if (firstLine.includes("\t")) {
    delim = "\t";
  } else if (firstLine.includes(";")) {
    delim = ";";
  } else if (firstLine.includes(",")) {
    delim = ",";
  }

  function splitLine(line, delimiter) {
    if (delimiter === "\t") {
      return line.split("\t").map((cell) => cell.trim().replace(/^["']|["']$/g, ""));
    }
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(cur.trim().replace(/^["']|["']$/g, ""));
        cur = "";
      } else {
        cur += char;
      }
    }
    result.push(cur.trim().replace(/^["']|["']$/g, ""));
    return result;
  }

  const grid = lines.map((l) => splitLine(l, delim));
  if (grid.length === 0) return { headers: [], rows: [] };

  const firstRow = grid[0];
  const knownKeywords = [
    "fecha", "enrolamiento", "nacionalidad", "documento", "emitido",
    "region", "unidad", "cuartel", "equipo", "genero", "edad",
    "edades", "sincronizacion", "biometrica", "estado", "pdi"
  ];

  const hasHeaderKeywords = firstRow.some((cell) => {
    const norm = String(cell).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return knownKeywords.some((kw) => norm.includes(kw));
  });

  let headers = [];
  let dataRows = [];

  if (hasHeaderKeywords) {
    headers = firstRow.map((h) => String(h || "").trim());
    dataRows = grid.slice(1);
  } else {
    headers = [
      "FECHA_ENROLAMIENTO",
      "DOCUMENTO_EMITIDO",
      "REGION",
      "UNIDAD",
      "CUARTEL_NEW",
      "EQUIPO",
      "GENERO",
      "EDADES",
      "EDAD_1",
      "SINCRONIZACION_PDI",
      "REGISTRACION_BIOMETRICA",
      "ESTADO_GENERAL"
    ];
    dataRows = grid;
  }

  return { headers, rows: dataRows };
}

export function loadSampleOracleData() {
  const hoy = new Date().toISOString().split("T")[0];
  const sampleHeaders = [
    "Acciones", "Fecha", "hora", "EQUIPO", "Usuario", "UNIDAD",
    "Nombre Completo", "Tipo de Documento", "Documento", "Emitido En",
    "Nacionalidad", "Sincronización PDI", "Registración Biométrica",
    "Estado General", "CUARTEL", "REGION", "FECHA NACIMIENTO", "EDAD",
    "RANGO_ETARIO", "UUII", "IP", "CUARTELNEW", "NOMBRE_FUNCIONARIO",
    "REGION2", "GENERO", "TIPO REGISTRO"
  ];
  const sampleRows = [
    ["", hoy, "08:15:00", "PC DE ESCRITORIO", "operador1", "PREPOLIN ARICA", "GOMEZ PEREZ JUAN", "DNI", "87654321", "VENEZUELA", "VENEZUELA", "SINCRONIZADO", "REGISTRADO", "REGISTRADO", "CHACALLUTA", "ARICA Y PARINACOTA", "1994-02-10", "32", "MAYOR DE EDAD", "U101", "10.20.1.15", "", "SUBCOMISARIO DIAZ", "", "HOMBRE", "ENROLADO"],
    ["", hoy, "09:30:22", "TABLET", "operador2", "PREPOLIN ARICA", "SILVA MORA LAURA", "PASAPORTE", "PA123456", "COLOMBIA", "COLOMBIA", "SINCRONIZADO", "REGISTRADO", "REGISTRADO", "CHUNGARA", "ARICA Y PARINACOTA", "1998-07-25", "28", "MAYOR DE EDAD", "U102", "10.20.1.18", "", "INSPECTORA CASTRO", "", "MUJER", "ENROLADO"],
    ["", hoy, "10:45:10", "PC DE ESCRITORIO", "operador3", "JENATID", "MAMANI CHOQUE CARLOS", "CEDULA", "65432198", "BOLIVIA", "BOLIVIA", "SINCRONIZADO", "REGISTRADO", "REGISTRADO", "COLCHANES", "TARAPACA", "2012-11-03", "14", "MENOR DE EDAD", "U103", "10.20.2.11", "", "COMISARIO ROJAS", "", "HOMBRE", "ENROLADO"],
    ["", hoy, "11:20:05", "TABLET", "operador1", "PREPOLIN ARICA", "JEAN BAPTISTE MARIE", "PASAPORTE", "HT998877", "HAITI", "HAITI", "SINCRONIZADO", "REGISTRADO", "REGISTRADO", "BELEN", "ARICA Y PARINACOTA", "1985-04-12", "41", "MAYOR DE EDAD", "U104", "10.20.1.20", "", "SUBCOMISARIO DIAZ", "", "MUJER", "ENROLADO"],
    ["", hoy, "12:05:40", "PC DE ESCRITORIO", "operador2", "PREPOLIN ARICA", "QUISPE MAMANI LUIS", "DNI", "45678912", "PERU", "PERU", "SINCRONIZADO", "REGISTRADO", "REGISTRADO", "CHACALLUTA", "ARICA Y PARINACOTA", "1987-09-30", "39", "MAYOR DE EDAD", "U105", "10.20.1.22", "", "INSPECTORA CASTRO", "", "HOMBRE", "ENROLADO"]
  ];

  const tsvText = [
    sampleHeaders.join("\t"),
    ...sampleRows.map(r => r.join("\t"))
  ].join("\n");

  handlePastedClipboardText(tsvText);
}

export function renderSpreadsheetGrid() {
  const dropzone = document.getElementById("sheet-paste-dropzone");
  const previewCard = document.getElementById("sheet-preview-card");
  const btnClear = document.getElementById("btn-clear-sheet");
  const statRows = document.getElementById("sheet-stat-rows");
  const statCols = document.getElementById("sheet-stat-cols");
  const statStatus = document.getElementById("sheet-stat-status");
  const countBadge = document.getElementById("sheet-preview-count-badge");
  const mappingChips = document.getElementById("sheet-column-mapping-chips");
  const thead = document.getElementById("sheet-table-head");
  const tbody = document.getElementById("sheet-table-body");

  if (!dropzone || !previewCard) return;

  const rowCount = sheetState.rows.length;
  const colCount = sheetState.headers.length;

  if (rowCount === 0) {
    dropzone.style.display = "block";
    previewCard.style.display = "none";
    if (btnClear) btnClear.style.display = "none";
    if (statRows) statRows.textContent = "0";
    if (statCols) statCols.textContent = "0 / 12";
    if (statStatus) {
      statStatus.className = "badge badge-default";
      statStatus.textContent = "Esperando datos";
    }
    return;
  }

  dropzone.style.display = "none";
  previewCard.style.display = "block";
  if (btnClear) btnClear.style.display = "inline-flex";

  if (statRows) statRows.textContent = rowCount.toLocaleString();
  if (countBadge) countBadge.textContent = `${rowCount.toLocaleString()} filas`;

  const mappedFieldKeys = new Set();
  const chipsHtml = sheetState.headers.map((h, colIdx) => {
    const normH = String(h || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const match = SHEET_SCHEMA.find(def => {
      const defNorm = def.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return normH === defNorm || def.aliases.some(a => normH === a.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    });

    if (match) {
      const isFirst = !mappedFieldKeys.has(match.field);
      mappedFieldKeys.add(match.field);
      const tagSuffix = isFirst ? `➔ <strong>${match.label}</strong>` : `(Alternativo ➔ ${match.label})`;
      return `<span class="col-map-chip matched" title="Mapeada al modelo ABIS: ${match.label}">✓ ${escapeHtml(h)} ${tagSuffix}</span>`;
    } else {
      return `<span class="col-map-chip extra" title="Columna informativa / no modelada">Col ${colIdx + 1}: ${escapeHtml(h)}</span>`;
    }
  });

  if (mappingChips) {
    mappingChips.innerHTML = chipsHtml.join("");
  }

  const requiredDefs = SHEET_SCHEMA.filter(s => s.required);
  const metRequiredCount = requiredDefs.filter(s => mappedFieldKeys.has(s.field)).length;

  if (statCols) {
    statCols.textContent = `${colCount} columnas (${metRequiredCount}/${requiredDefs.length} campos clave identificados)`;
  }

  if (statStatus) {
    if (metRequiredCount >= requiredDefs.length) {
      statStatus.className = "badge badge-success";
      statStatus.textContent = "Listo para Ingesta (100% Claves OK)";
    } else if (metRequiredCount >= 7) {
      statStatus.className = "badge badge-warning";
      statStatus.textContent = "Revisar Cabeceras Parciales";
    } else {
      statStatus.className = "badge badge-danger";
      statStatus.textContent = "Faltan Campos Requeridos";
    }
  }

  if (thead) {
    let theadHtml = "<tr>";
    theadHtml += `<th class="col-index">#</th>`;
    sheetState.headers.forEach((h, colIdx) => {
      theadHtml += `<th>${escapeHtml(h || `Columna ${colIdx + 1}`)}</th>`;
    });
    theadHtml += `<th class="col-action" title="Eliminar fila">✕</th>`;
    theadHtml += "</tr>";
    thead.innerHTML = theadHtml;
  }

  if (tbody) {
    const maxVisual = Math.min(rowCount, 100);
    let tbodyHtml = "";

    for (let r = 0; r < maxVisual; r++) {
      const row = sheetState.rows[r] || [];
      tbodyHtml += `<tr data-row-idx="${r}">`;
      tbodyHtml += `<td class="cell-index">${r + 1}</td>`;
      for (let c = 0; c < colCount; c++) {
        const val = row[c] !== undefined ? String(row[c]) : "";
        tbodyHtml += `<td class="cell-editable" contenteditable="true" data-row="${r}" data-col="${c}" title="Doble clic para editar">${escapeHtml(val)}</td>`;
      }
      tbodyHtml += `
        <td style="text-align: center;">
          <button type="button" class="btn-cell-delete" data-delete-row="${r}" title="Eliminar esta fila">
            <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </td>
      `;
      tbodyHtml += "</tr>";
    }

    if (rowCount > 100) {
      tbodyHtml += `
        <tr>
          <td colspan="${colCount + 2}" style="text-align: center; color: var(--text-muted); padding: 12px; font-style: italic; background: #f8fafc;">
            ... y ${(rowCount - 100).toLocaleString()} filas más que serán procesadas en su totalidad al ingestar.
          </td>
        </tr>
      `;
    }

    tbody.innerHTML = tbodyHtml;

    tbody.querySelectorAll("td.cell-editable").forEach((td) => {
      td.addEventListener("blur", (e) => {
        const r = parseInt(e.target.getAttribute("data-row"), 10);
        const c = parseInt(e.target.getAttribute("data-col"), 10);
        const val = e.target.innerText.trim();
        if (sheetState.rows[r]) {
          sheetState.rows[r][c] = val;
        }
      });
    });

    tbody.querySelectorAll("button[data-delete-row]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const r = parseInt(btn.getAttribute("data-delete-row"), 10);
        if (!isNaN(r)) {
          sheetState.rows.splice(r, 1);
          renderSpreadsheetGrid();
        }
      });
    });
  }
}

export function clearSpreadsheetData() {
  sheetState.headers = [];
  sheetState.rows = [];
  const feedback = document.getElementById("sheet-ingest-feedback");
  if (feedback) feedback.style.display = "none";
  renderSpreadsheetGrid();
}

export function addEmptyRowToSpreadsheet() {
  if (sheetState.headers.length === 0) {
    sheetState.headers = [
      "FECHA_ENROLAMIENTO", "DOCUMENTO_EMITIDO", "REGION", "UNIDAD",
      "CUARTEL_NEW", "EQUIPO", "GENERO", "EDADES",
      "EDAD_1", "SINCRONIZACION_PDI", "REGISTRACION_BIOMETRICA", "ESTADO_GENERAL"
    ];
  }
  const emptyRow = new Array(sheetState.headers.length).fill("");
  sheetState.rows.unshift(emptyRow);
  renderSpreadsheetGrid();
}

export function submitSpreadsheetIngest() {
  if (!sheetState.rows || sheetState.rows.length === 0) {
    alert("No hay filas cargadas en la hoja de cálculo.");
    return;
  }
  if (!sheetState.headers || sheetState.headers.length === 0) {
    alert("No se han definido cabeceras válidas.");
    return;
  }

  promptAuthModal({
    headers: sheetState.headers,
    rows: sheetState.rows
  }, "sheet_ingest");
}

export async function executeSheetIngestAuthorized(sheetData, clave) {
  const modal = document.getElementById("modal-auth-ingesta");
  const modalDialog = document.querySelector("#modal-auth-ingesta .modal-dialog");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");
  const claveInput = document.getElementById("input-auth-clave");
  const feedbackDiv = document.getElementById("sheet-ingest-feedback");

  let progressOverlay = null;

  try {
    progressOverlay = showIngestProgress();
    const res = await fetch("/api/ingest/sheet", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ingesta-Auth": clave,
      },
      body: JSON.stringify({
        headers: sheetData.headers,
        rows: sheetData.rows,
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
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          <span>Autorizar e Ingestar en BD</span>
        `;
      }
      if (claveInput) {
        claveInput.select();
        claveInput.focus();
      }
      if (progressOverlay && progressOverlay.parentNode) {
        progressOverlay.parentNode.removeChild(progressOverlay);
      }
      return;
    }

    if (progressOverlay) finishIngestProgress(progressOverlay);
    closeAuthModal();

    if (feedbackDiv) feedbackDiv.style.display = "block";

    if (res.ok && data.ok) {
      if (feedbackDiv) {
        feedbackDiv.innerHTML = `
          <div class="alert alert-success">
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" style="stroke:var(--status-success);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <strong style="font-size:1.02rem;">Ingesta desde Hoja de Cálculo Auditada e Insertada Exitosamente</strong>
              </div>
              <div style="margin-top:8px; line-height:1.65;">
                &bull; <strong>Modo de Carga:</strong> <span class="badge badge-success">Portapapeles Directo Oracle DB / Excel</span><br>
                &bull; <strong>Filas Procesadas:</strong> <strong>${(data.totalMapeadas || sheetData.rows.length).toLocaleString()}</strong> recibidas &bull; <strong>${(data.totalInsertadas || 0).toLocaleString()}</strong> insertadas en PostgreSQL<br>
                &bull; <strong>Inconsistencias Registradas:</strong> ${data.erroresFilas || 0}<br>
                &bull; <strong>Tiempo de Inserción:</strong> ${((data.duracionMs || 0) / 1000).toFixed(2)} segundos<br>
                &bull; <strong>Huella Criptográfica SHA-256:</strong> <code>${data.hashSHA256}</code><br>
                &bull; <strong>Auditoría:</strong> Evento <code>INGESTA_PORTAPAPELES_AUTORIZADA</code> registrado en la bitácora inmutable.
              </div>
            </div>
          </div>
        `;
      }

      clearSpreadsheetData();

      await loadAvailableDates();
      await loadMetrics();
      await loadTrendData();
      await checkSystemHealth();
      if (typeof cargarBitacoraAuditoria === "function") {
        cargarBitacoraAuditoria();
      }
    } else {
      if (feedbackDiv) {
        feedbackDiv.innerHTML = `
          <div class="alert alert-error">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
              <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" style="stroke:#ef4444;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <strong>Error en la Ingesta de Hoja de Cálculo:</strong>
            </div>
            ${data.error || "Ocurrió un error al procesar las filas."}
          </div>
        `;
      }
    }
  } catch (err) {
    if (progressOverlay && progressOverlay.parentNode) {
      progressOverlay.parentNode.removeChild(progressOverlay);
    }
    closeAuthModal();
    if (feedbackDiv) {
      feedbackDiv.style.display = "block";
      feedbackDiv.innerHTML = `
        <div class="alert alert-error">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" style="stroke:#ef4444;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <strong>Error de Conexión:</strong>
          </div>
          ${err.message}
        </div>
      `;
    }
  }
}

function showIngestProgress() {
  const overlay = document.createElement("div");
  overlay.className = "progress-overlay";
  
  const modal = document.createElement("div");
  modal.className = "progress-modal";
  modal.innerHTML = `
    <h3 class="progress-title">Subiendo a Base de Datos</h3>
    <p class="progress-text">Procesando registros e insertando en PostgreSQL...</p>
    <div class="progress-bar-container">
      <div class="progress-bar-fill" id="ingest-progress-fill"></div>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  return overlay;
}

function finishIngestProgress(overlay) {
  if (!overlay) return;
  const fill = overlay.querySelector("#ingest-progress-fill");
  if (fill) {
    fill.classList.add("progress-bar-complete");
  }
  setTimeout(() => {
    overlay.style.transition = "opacity 0.4s ease";
    overlay.style.opacity = "0";
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 400);
  }, 600);
}
