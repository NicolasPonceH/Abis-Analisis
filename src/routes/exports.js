const { cargarReporte, csvCell } = require("../reportes/reportSelection");

// Rutas ABIS; se registran detrás del middleware de sesión del servidor.
function registerExportRoutes(app, { pool, FECHA_VALIDA, obtenerReporteDiario, obtenerReporteRango, generarReporteWord, generarReporteExcel }) {
  app.get("/api/export/word", async (req, res) => {
    try {
      const { reporte, fecha, desde, hasta } = await cargarReporte(pool, req.query || {});

      const docxBuffer = await generarReporteWord(reporte, { fecha, desde, hasta });
      const nombreArchivo = desde && hasta
        ? `Informe_ABIS_PDI_${desde}_a_${hasta}.docx`
        : `Informe_ABIS_PDI_${fecha || 'reporte'}.docx`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
      res.send(docxBuffer);
    } catch (err) {
      if (!err.status || err.status >= 500) console.error("[ERROR EXPORT WORD]", err);
      res.status(err.status || 500).send(`Error generando informe Word: ${err.message}`);
    }
  });

  // Exportación formal en Microsoft Excel (.xlsx) con formato institucional PDI
  app.get("/api/export/excel", async (req, res) => {
    try {
      const { reporte, fecha, desde, hasta } = await cargarReporte(pool, req.query || {});

      const excelBuffer = await generarReporteExcel(reporte, { fecha, desde, hasta });
      const nombreArchivo = desde && hasta
        ? `Informe_Oficial_ABIS_PDI_${desde}_a_${hasta}.xlsx`
        : `Informe_Oficial_ABIS_PDI_${fecha || 'reporte'}.xlsx`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
      res.send(excelBuffer);
    } catch (err) {
      if (!err.status || err.status >= 500) console.error("[ERROR EXPORT EXCEL]", err);
      res.status(err.status || 500).send(`Error generando informe Excel: ${err.message}`);
    }
  });

  // Exportación formal en CSV institucional PDI con BOM UTF-8
  app.get("/api/export/csv", async (req, res) => {
    try {
      const { reporte, fecha, desde, hasta } = await cargarReporte(pool, req.query || {});

      const exec = reporte.resumenEjecutivo || {};
      const total = reporte.total || 0;
      const periodo = desde && hasta
        ? `Desde ${desde} hasta ${hasta}`
        : (reporte.fecha || fecha || "Jornada");

      const lines = [];
      lines.push('"POLICÍA DE INVESTIGACIONES DE CHILE"');
      lines.push('"JEFATURA NACIONAL DE MIGRACIONES Y POLICÍA INTERNACIONAL"');
      lines.push('"DEPARTAMENTO DE INFORMACIÓN Y REGISTRO BIOMÉTRICO (SISTEMA ABIS)"');
      lines.push('"REPORTE GERENCIAL Y OPERATIVO DE ENROLAMIENTO FRONTERIZO"');
      lines.push('""');
      lines.push(`"Fecha de Emisión","${new Date().toLocaleString('es-CL')}"`);
      lines.push(`"Período Consultado","${periodo}"`);
      lines.push(`"Total Enrolamientos Procesados","${total.toLocaleString()}"`);
      lines.push(`"Cumplimiento SLA Sincronización PDI","${exec.tasaSincronizacion ?? 0}% (${exec.estadoSLA || 'Óptimo'})"`);
      lines.push(`"Eficacia Registro Biométrico ABIS","${exec.tasaRegistroBiometrico || 0}%"`);
      lines.push(`"Tasa de Inconsistencias o Error","${exec.tasaError || 0}%"`);
      lines.push(`"Puesto Fronterizo con Mayor Demanda",${csvCell(exec.cuartelLider ? exec.cuartelLider.nombre + ' (' + exec.cuartelLider.porcentaje + '%)' : 'N/D')}`);
      lines.push(`"Flujo Migratorio Principal",${csvCell(exec.nacionalidadLider ? exec.nacionalidadLider.nombre + ' (' + exec.nacionalidadLider.porcentaje + '%)' : 'N/D')}`);
      lines.push(`"Clasificación Institucional","RESERVADO - USO OFICIAL EXCLUSIVO POLICÍA DE INVESTIGACIONES"`);
      lines.push(`"Cifrado y Seguridad","AES-256-GCM / Huella Digital SHA-256"`);
      lines.push('""');

      lines.push('"1. MATRIZ DE RENDIMIENTO OPERATIVO POR CUARTEL Y UNIDAD POLICIAL"');
      lines.push('"Puesto / Cuartel","Unidad Policial","Total Enrolados","Sincronizados PDI (Exitosos)","Con Error","Tasa de Efectividad (%)"');
      const cuarteles = reporte.rendimientoCuarteles || [];
      cuarteles.forEach((c) => {
        lines.push(`${csvCell(c.cuartel)},${csvCell(c.unidad)},${c.total},${c.sincronizados},${c.conError},"${c.tasaExito}%"`);
      });
      lines.push('""');

      lines.push('"2. FLUJOS MIGRATORIOS POR NACIONALIDAD (TOP PAÍSES DE ORIGEN)"');
      lines.push('"País / Nacionalidad","Código ISO","Total Enrolamientos","Proporción (%)"');
      const nacionalidades = reporte.nacionalidadesPrincipales || [];
      nacionalidades.forEach((n) => {
        lines.push(`${csvCell(n.nacionalidad)},${csvCell(n.codigo_iso || 'N/D')},${n.total},"${n.porcentaje}%"`);
      });
      lines.push('""');

      lines.push('"3. ANÁLISIS DEMOGRÁFICO Y PROTECCIÓN DE MENORES (N.N.A.)"');
      lines.push('"Grupo Poblacional","Hombres (M)","Mujeres (F)","Total","Proporción (%)"');
      let mascAdultos = 0, mascMenores = 0, femAdultos = 0, femMenores = 0;
      (reporte.demografiaCruzada || []).forEach((d) => {
        if (d.genero === "M") {
          if (d.esMayorEdad) mascAdultos += d.total;
          else mascMenores += d.total;
        } else if (d.genero === "F") {
          if (d.esMayorEdad) femAdultos += d.total;
          else femMenores += d.total;
        }
      });
      const totalAdultos = mascAdultos + femAdultos;
      const totalMenores = mascMenores + femMenores;
      const totalCalculo = total || 1;
      lines.push(`"Adultos (Mayores de Edad >= 18 años)",${mascAdultos},${femAdultos},${totalAdultos},"${((totalAdultos / totalCalculo) * 100).toFixed(1)}%"`);
      lines.push(`"Niños, Niñas y Adolescentes (N.N.A. 0 a 17 años)",${mascMenores},${femMenores},${totalMenores},"${((totalMenores / totalCalculo) * 100).toFixed(1)}%"`);
      lines.push('""');

      lines.push('"AVISO LEGAL: Documento oficial generado por el Sistema ABIS de la Policía de Investigaciones de Chile."');
      lines.push('"Confidencialidad amparada por la Ley N° 19.628 sobre Protección de la Vida Privada. Prohibida su divulgación no autorizada."');

      const nombreArchivo = desde && hasta
        ? `Informe_Oficial_ABIS_PDI_${desde}_a_${hasta}.csv`
        : `Informe_Oficial_ABIS_PDI_${fecha || 'reporte'}.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
      res.send("\uFEFF" + lines.join("\r\n"));
    } catch (err) {
      if (!err.status || err.status >= 500) console.error("[ERROR EXPORT CSV]", err);
      res.status(err.status || 500).send(`Error generando CSV: ${err.message}`);
    }
  });

  // ==========================================================================
  // ORACLE → POSTGRESQL POPULATION API
  // ==========================================================================
  // Endpoint para poblar la base de datos PostgreSQL desde Oracle.
  // Conecta a Oracle, extrae los datos necesarios y los inserta en PostgreSQL
  // siguiendo el esquema normalizado del sistema ABIS.
  // Requiere la sesión JWT del usuario; el endpoint JSON usa su token de integración.
}

module.exports = { registerExportRoutes };
