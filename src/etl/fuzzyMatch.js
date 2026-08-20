// Distancia de Levenshtein clasica (cantidad minima de inserciones/borrados/sustituciones
// para convertir "a" en "b"). Usada para tolerar errores de tipeo menores en el Excel.
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// Busca, entre "candidates", el/los mas cercanos a "text" dentro de maxDistance.
// Devuelve el candidato solo si es unico (evita corregir "a ciegas" cuando hay ambiguedad
// entre dos catalogos igual de parecidos).
function findClosestMatch(text, candidates, maxDistance) {
  let best = null;
  let bestDistance = maxDistance + 1;
  let tie = false;

  for (const candidate of candidates) {
    const distance = levenshtein(text, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      tie = false;
    } else if (distance === bestDistance) {
      tie = true;
    }
  }

  if (best === null || bestDistance > maxDistance || tie) return null;
  return best;
}

module.exports = { levenshtein, findClosestMatch };
