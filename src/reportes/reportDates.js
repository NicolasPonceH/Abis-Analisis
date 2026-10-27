function esFecha(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validarPeriodo(desde, hasta) {
  if (!esFecha(desde) || !esFecha(hasta) || desde > hasta) {
    throw Object.assign(new Error("El período debe contener fechas válidas y desde no puede ser posterior a hasta."), { status: 400 });
  }
}
module.exports = { esFecha, validarPeriodo };
