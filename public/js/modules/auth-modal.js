// Compatibilidad con los consumidores: las operaciones usan la sesión existente.
// Imports diferidos evitan el ciclo ingesta -> auth-modal -> ingesta/ajustes.
export let pendingAuthFile = null;
export let pendingAuthAction = "ingesta";

export async function promptAuthModal(file, actionType = "ingesta") {
  pendingAuthFile = file;
  pendingAuthAction = actionType;
  try {
    const actions = {
      programacion: ["ajustes", "executeSaveScheduleAuthorized"],
      destinatario_agregar: ["ajustes", "executeAgregarDestinatarioAuthorized"],
      destinatario_toggle: ["ajustes", "executeToggleDestinatarioAuthorized"],
      destinatario_eliminar: ["ajustes", "executeEliminarDestinatarioAuthorized"],
      sheet_ingest: ["ingesta", "executeSheetIngestAuthorized"],
      ingesta: ["ingesta", "handleFileUpload"],
    };
    const action = actions[actionType];
    if (!action) throw new Error("Operación no reconocida.");
    const module = action[0] === "ajustes" ? await import("./ajustes.js") : await import("./ingesta.js");
    return await module[action[1]](file, "");
  } catch (error) {
    window.alert(error?.message || "No se pudo completar la operación.");
  }
}

export function closeAuthModal() {
  const modal = document.getElementById("modal-auth-ingesta");
  if (modal) {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("auth-modal-open");
  pendingAuthFile = null;
  pendingAuthAction = "ingesta";
  const input = document.getElementById("file-input");
  if (input) input.value = "";
}

// API conservada para inicializadores antiguos; ya no hay una segunda contraseña.
export function setupAuthModalEvents() {}
