// ============================================================
// sensitivity.js — Análisis de Sensibilidad
// ============================================================

/**
 * Renderiza el análisis de sensibilidad completo.
 * @param {Object} config  – configuración del problema (type, numVars, objective, constraints)
 * @param {Object} result  – resultado del solver (status, solution, iterations)
 */
function renderSensitivity(config, result) {
  const ct = document.getElementById('sensitivity-content');
  if (!result || !result.iterations || result.iterations.length === 0) {
    ct.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>Resuelve un problema primero.</p></div>';
    return;
  }

  const finalIter = result.iterations[result.iterations.length - 1];
  const tableau = finalIter.tableau;
  const varNames = finalIter.varNames;
  const basicVars = finalIter.basicVars;
  const numDecVars = config.numVars;
  const numConstraints = config.constraints.length;
  const rhsCol = tableau[0].length - 1;
  const isMin = config.type === 'min';

  // ========================================================
  // 1. Construir mapeo de restricción → variable de holgura/exceso
  //    Recorremos varNames en el mismo orden que _buildAugmented:
  //    Primero X1..Xn, luego para cada restricción en orden:
  //      <= : agrega Si (slack)
  //      >= : agrega Si (surplus), luego Ai (artificial)
  //      =  : agrega Ai (artificial)
  // ========================================================
  const constraintSlackMap = []; // por cada restricción i: { slackName, slackColIdx, type }
  let varPtr = numDecVars; // puntero dentro de varNames (0-indexed)

  for (let i = 0; i < numConstraints; i++) {
    const cType = config.constraints[i].type;
    if (cType === '<=') {
      // Variable de holgura
      const slackName = varNames[varPtr];
      const slackColIdx = varPtr + 1; // columna en el tablero (1-indexed)
      constraintSlackMap.push({ slackName, slackColIdx, type: 'slack' });
      varPtr++;
    } else if (cType === '>=') {
      // Variable de exceso (surplus) + artificial
      const surplusName = varNames[varPtr];
      const surplusColIdx = varPtr + 1;
      constraintSlackMap.push({ slackName: surplusName, slackColIdx: surplusColIdx, type: 'surplus' });
      varPtr++; // surplus
      varPtr++; // artificial (la saltamos, no la necesitamos para el análisis)
    } else {
      // Restricción de igualdad: solo artificial, sin holgura
      constraintSlackMap.push({ slackName: null, slackColIdx: -1, type: 'equality' });
      varPtr++; // artificial
    }
  }

  // ========================================================
  // 2. Identificar columnas de variables no-básicas (excluyendo artificiales)
  //    para usarlas en computeObjRange
  // ========================================================
  const nonBasicCols = []; // columnas (1-indexed) de variables no-básicas no-artificiales
  for (let j = 0; j < varNames.length; j++) {
    const vn = varNames[j];
    if (vn.startsWith('A')) continue; // ignorar artificiales
    if (!basicVars.includes(vn)) {
      nonBasicCols.push(j + 1); // columna en tablero
    }
  }

  // ========================================================
  // 3. Tabla de Variables de Decisión
  // ========================================================
  let decRows = '';
  let decInterpretations = '';

  for (let j = 0; j < numDecVars; j++) {
    const vName = `X${j + 1}`;
    const colIdx = j + 1;
    const bIdx = basicVars.indexOf(vName);
    const value = bIdx !== -1 ? tableau[bIdx + 1][rhsCol] : new Fraction(0);

    // Costo reducido = coeficiente en fila 0
    const reducedCost = tableau[0][colIdx];

    // Coeficiente original del objetivo
    const origCoeffStr = config.objective[j];
    const origCoeff = Fraction.parse(origCoeffStr);

    // Rango permisible para c_j
    const ranges = computeObjRange(tableau, varNames, basicVars, colIdx, nonBasicCols, isMin);

    // Rango absoluto [min, max]
    const absRange = computeAbsoluteRange(origCoeff, ranges);

    decRows += `<tr>
      <td class="col-vb">${vName}</td>
      <td>${value.toHTML()}</td>
      <td>${reducedCost.toHTML()}</td>
      <td>${origCoeff.toHTML()}</td>
      <td>${ranges.increase}</td>
      <td>${ranges.decrease}</td>
      <td>${absRange}</td>
    </tr>`;

    // Interpretación por variable
    if (bIdx !== -1) {
      // Variable básica
      decInterpretations += `<li><strong>${vName}</strong> es <em>básica</em> (valor = ${value.toHTML()}). `;
      decInterpretations += `Su coeficiente c<sub>${j+1}</sub> = ${origCoeff.toHTML()} puede variar en el rango ${absRange} sin cambiar la base óptima actual.`;
      decInterpretations += `</li>`;
    } else {
      // Variable no básica
      decInterpretations += `<li><strong>${vName}</strong> es <em>no básica</em> (valor = 0). `;
      if (!reducedCost.isZero()) {
        if (isMin) {
          decInterpretations += `Costo reducido = ${reducedCost.toHTML()}. Para que entre a la base, su coeficiente debe disminuir en al menos ${reducedCost.abs().toHTML()}.`;
        } else {
          decInterpretations += `Costo reducido = ${reducedCost.toHTML()}. Para que entre a la base, su coeficiente debe aumentar en al menos ${reducedCost.abs().toHTML()}.`;
        }
      } else {
        decInterpretations += `Costo reducido = 0, lo que indica soluciones óptimas múltiples.`;
      }
      decInterpretations += `</li>`;
    }
  }

  // ========================================================
  // 4. Tabla de Restricciones
  // ========================================================
  let consRows = '';
  let consInterpretations = '';

  for (let i = 0; i < numConstraints; i++) {
    const cInfo = constraintSlackMap[i];
    const origRhsStr = config.constraints[i].rhs;
    const origRhs = Fraction.parse(origRhsStr);
    const cType = config.constraints[i].type;

    // ---- Precio sombra ----
    let shadowPrice = new Fraction(0);
    if (cInfo.slackColIdx !== -1) {
      // Para <= : precio sombra = coef de la holgura en fila 0 (negado si min)
      // Para >= : la columna surplus tiene signo -1 en la fila de restricción.
      //           El precio sombra se obtiene del coeficiente de esa columna en fila 0,
      //           pero para >=, el surplus entró con -1, así que el precio sombra
      //           es el negativo del coeficiente en fila 0.
      shadowPrice = tableau[0][cInfo.slackColIdx].clone();
      if (cInfo.type === 'surplus') {
        // Para restricciones >=, la variable surplus tiene coeficiente -1 en la restricción,
        // por lo que el dual es el negativo del coeficiente en fila 0
        shadowPrice = shadowPrice.neg();
      }
      // Para minimización, internamente se maximiza -Z, así que el precio sombra
      // necesita ser negado para representar el efecto en Z_original
      if (isMin) {
        shadowPrice = shadowPrice.neg();
      }
    } else {
      // Restricción de igualdad (=): no tiene slack/surplus.
      // Buscar la columna de la variable artificial correspondiente.
      // Después de Big-M y la resolución, el coeficiente en fila 0 de la columna
      // donde estaba la artificial contiene información del dual.
      // Para '=', buscamos la artificial Ai que fue asignada a esta restricción.
      const artName = _findArtificialForConstraint(varNames, i, config.constraints);
      if (artName) {
        const artIdx = varNames.indexOf(artName);
        if (artIdx !== -1) {
          const artCol = artIdx + 1;
          // El coeficiente en fila 0 de la columna artificial es M - y_dual
          // pero después del pivoteo, contiene el valor del dual más M residual.
          // Si M fue eliminado correctamente, usamos el coeficiente directo.
          // Para igualdad, tratamos como slack con coef +1.
          shadowPrice = tableau[0][artCol].clone();
          if (isMin) {
            shadowPrice = shadowPrice.neg();
          }
        }
      }
    }

    // ---- Valor de holgura ----
    let slackValue = new Fraction(0);
    if (cInfo.slackName) {
      const bIdx = basicVars.indexOf(cInfo.slackName);
      slackValue = bIdx !== -1 ? tableau[bIdx + 1][rhsCol].clone() : new Fraction(0);
      // Para surplus: si está en la base, su valor ya es correcto (holgura de >= es su valor)
    }

    // ---- Rango permisible para b_i ----
    const rhsRanges = computeRhsRange(tableau, basicVars, cInfo.slackColIdx, cInfo.type);

    // Rango absoluto para RHS
    const absRhsRange = computeAbsoluteRange(origRhs, rhsRanges);

    // Símbolo de la restricción
    const sym = cType === '<=' ? '≤' : cType === '>=' ? '≥' : '=';

    consRows += `<tr>
      <td class="col-vb">R${i + 1} (${sym})</td>
      <td>${slackValue.toHTML()}</td>
      <td>${shadowPrice.toHTML()}</td>
      <td>${origRhs.toHTML()}</td>
      <td>${rhsRanges.increase}</td>
      <td>${rhsRanges.decrease}</td>
      <td>${absRhsRange}</td>
    </tr>`;

    // Interpretación por restricción
    consInterpretations += `<li><strong>R${i + 1}</strong> (${sym}): `;
    if (cInfo.type === 'equality') {
      consInterpretations += `Restricción de igualdad. Precio sombra = ${shadowPrice.toHTML()}. `;
      if (!shadowPrice.isZero()) {
        consInterpretations += `Cada unidad adicional en b<sub>${i+1}</sub> cambia Z en ${shadowPrice.toHTML()} (dentro del rango permisible).`;
      }
    } else if (slackValue.isZero()) {
      // Restricción activa (vinculante)
      consInterpretations += `Restricción <em>activa</em> (holgura = 0). Precio sombra = ${shadowPrice.toHTML()}. `;
      if (!shadowPrice.isZero()) {
        const dir = shadowPrice.isPos() ? 'incrementa' : 'decrementa';
        consInterpretations += `Cada unidad adicional de recurso ${dir} Z en ${shadowPrice.abs().toHTML()}`;
        consInterpretations += ` (válido en el rango ${absRhsRange}).`;
      }
    } else {
      // Restricción no activa
      consInterpretations += `Restricción <em>no activa</em> (holgura = ${slackValue.toHTML()}). `;
      consInterpretations += `Precio sombra = 0. El recurso no está siendo utilizado completamente.`;
    }
    consInterpretations += `</li>`;
  }

  // ========================================================
  // 5. Renderizar HTML completo
  // ========================================================
  ct.innerHTML = `
    <div class="card">
      <div class="card-title"><div class="icon">🔍</div> Análisis de Sensibilidad</div>

      <h3 style="color:var(--accent-3);margin:1rem 0 0.5rem;font-size:1rem;">Variables de Decisión</h3>
      <div class="sensitivity-table-wrapper">
        <table class="sensitivity-table">
          <thead><tr>
            <th>Variable</th>
            <th>Valor Óptimo</th>
            <th>Costo Reducido</th>
            <th>Coef. Original</th>
            <th>Incremento Permisible</th>
            <th>Decremento Permisible</th>
            <th>Rango [Mín, Máx]</th>
          </tr></thead>
          <tbody>${decRows}</tbody>
        </table>
      </div>

      <h3 style="color:var(--accent-3);margin:1.5rem 0 0.5rem;font-size:1rem;">Restricciones</h3>
      <div class="sensitivity-table-wrapper">
        <table class="sensitivity-table">
          <thead><tr>
            <th>Restricción</th>
            <th>Holgura / Exceso</th>
            <th>Precio Sombra</th>
            <th>RHS Original</th>
            <th>Incremento Permisible</th>
            <th>Decremento Permisible</th>
            <th>Rango [Mín, Máx]</th>
          </tr></thead>
          <tbody>${consRows}</tbody>
        </table>
      </div>

      <div style="margin-top:1.5rem;padding:1rem;background:rgba(99,102,241,0.06);border-radius:10px;border:1px solid rgba(99,102,241,0.15);">
        <h4 style="color:var(--accent-3);margin-bottom:0.5rem;">📘 Interpretación General</h4>
        <ul style="color:var(--text-secondary);font-size:0.85rem;line-height:1.8;padding-left:1.2rem;">
          <li><strong>Costo Reducido</strong>: Cuánto debe mejorar el coeficiente de una variable no básica antes de que entre a la base óptima.</li>
          <li><strong>Precio Sombra</strong>: Cambio marginal en Z por cada unidad adicional en el RHS de la restricción (válido dentro del rango permisible).</li>
          <li><strong>Incremento/Decremento Permisible</strong>: Rango en el cual un cambio en el parámetro mantiene la base óptima actual.</li>
          <li><strong>Rango [Mín, Máx]</strong>: Valores absolutos mínimo y máximo que puede tomar el parámetro sin cambiar la base.</li>
        </ul>
      </div>

      <div style="margin-top:1rem;padding:1rem;background:rgba(16,185,129,0.06);border-radius:10px;border:1px solid rgba(16,185,129,0.15);">
        <h4 style="color:var(--accent-2);margin-bottom:0.5rem;">📊 Interpretación por Variable</h4>
        <ul style="color:var(--text-secondary);font-size:0.85rem;line-height:1.8;padding-left:1.2rem;">
          ${decInterpretations}
        </ul>
      </div>

      <div style="margin-top:1rem;padding:1rem;background:rgba(251,191,36,0.06);border-radius:10px;border:1px solid rgba(251,191,36,0.15);">
        <h4 style="color:#fbbf24;margin-bottom:0.5rem;">📊 Interpretación por Restricción</h4>
        <ul style="color:var(--text-secondary);font-size:0.85rem;line-height:1.8;padding-left:1.2rem;">
          ${consInterpretations}
        </ul>
      </div>
    </div>`;
}

// ============================================================
// Encuentra la variable artificial asignada a una restricción dada.
// Replica la lógica de _buildAugmented para determinar qué artificial
// corresponde a cada restricción.
// ============================================================
function _findArtificialForConstraint(varNames, constraintIdx, constraints) {
  let aCount = 0;
  for (let i = 0; i <= constraintIdx; i++) {
    const ct = constraints[i].type;
    if (ct === '>=' || ct === '=') {
      aCount++;
    }
  }
  if (aCount === 0) return null;
  const artName = `A${aCount}`;
  return varNames.includes(artName) ? artName : null;
}

// ============================================================
// Calcula el rango permisible para el coeficiente objetivo c_j.
//
// Para variable BÁSICA Xk en la fila k del tablero:
//   - Para cada columna j de variable no-básica (no artificial):
//       zj  = tableau[0][j]    (costo reducido de la no-básica j)
//       ykj = tableau[k][j]    (coeficiente en la fila de Xk)
//       Si ykj > 0 → limita el incremento: ratio = zj / ykj
//       Si ykj < 0 → limita el decremento: ratio = -zj / ykj
//   - Incremento permisible = mín de los ratios de incremento (solo positivos)
//   - Decremento permisible = mín de los ratios de decremento (solo positivos)
//
// Para variable NO BÁSICA:
//   - El costo reducido rc = tableau[0][colIdx] >= 0 en el tablero óptimo
//   - Incrementar cj por Δ: rc' = rc - Δ. Limitado por Δ <= rc.
//   - Decrementar cj por Δ: rc' = rc + Δ. Siempre válido → ∞.
//   - Mismo resultado para MAX y MIN (internamente max -Z).
// ============================================================
function computeObjRange(tableau, varNames, basicVars, colIdx, nonBasicCols, isMin) {
  const vName = varNames[colIdx - 1];
  const bIdx = basicVars.indexOf(vName);

  if (bIdx === -1) {
    // Variable no básica: el costo reducido rc determina el rango.
    // En el tablero óptimo, rc = z̄j - cj >= 0 (maximización interna).
    //
    // Incrementar cj por Δ → rc' = rc - Δ. Para mantener optimalidad: Δ <= rc.
    // Decrementar cj por Δ → rc' = rc + Δ. Siempre >= 0 → ilimitado.
    //
    // Para MIN (internamente max -Z): el efecto es equivalente.
    // Incrementar cj_original = decrementar cj_interno, mismo resultado.
    const rc = tableau[0][colIdx];
    return {
      increase: rc.isZero() ? '0' : rc.abs().toString(),
      decrease: '∞'
    };
  }

  // Variable básica: usar ratios zj/ykj sobre columnas no-básicas
  let minIncrease = null;  // mínimo ratio que limita incremento
  let minDecrease = null;  // mínimo ratio que limita decremento
  const basicRowIdx = bIdx + 1; // fila en el tablero

  for (let jj = 0; jj < nonBasicCols.length; jj++) {
    const j = nonBasicCols[jj]; // columna en tablero (1-indexed)

    const zj = tableau[0][j];            // costo reducido de la no-básica j
    const ykj = tableau[basicRowIdx][j]; // coeficiente en la fila de Xk

    if (ykj.isZero()) continue;

    // ratio = zj / ykj
    const ratio = zj.div(ykj);

    if (ykj.isPos()) {
      // ykj > 0 → limita el INCREMENTO de c_k
      // El ratio debe ser no-negativo para ser un límite válido
      if (ratio.isPos() || ratio.isZero()) {
        if (minIncrease === null || ratio.lt(minIncrease)) {
          minIncrease = ratio;
        }
      }
    } else {
      // ykj < 0 → limita el DECREMENTO de c_k
      // ratio negativo = -zj/ykj, tomamos valor absoluto
      const absRatio = ratio.abs();
      if (absRatio.isPos() || absRatio.isZero()) {
        if (minDecrease === null || absRatio.lt(minDecrease)) {
          minDecrease = absRatio;
        }
      }
    }
  }

  return {
    increase: minIncrease !== null ? minIncrease.toString() : '∞',
    decrease: minDecrease !== null ? minDecrease.toString() : '∞'
  };
}

// ============================================================
// Calcula el rango permisible para el lado derecho b_i.
//
// Para una restricción con variable de holgura/exceso en la columna slackColIdx:
//   - Para cada fila i del tablero (filas 1..m):
//       yij = tableau[i][slackColIdx]  (coef de la slack en esa fila)
//       b̄i  = tableau[i][rhsCol]       (RHS actual en esa fila)
//       Si yij > 0 → limita incremento: ratio = b̄i / yij
//       Si yij < 0 → limita decremento: ratio = -b̄i / yij = |b̄i / yij|
//   - Incremento permisible = mín de ratios de incremento (solo no-negativos)
//   - Decremento permisible = mín de ratios de decremento (solo no-negativos)
//
// Para restricciones de tipo >=, la variable surplus tiene coeficiente -1.
// En el tablero final, la columna del surplus refleja cómo cambia b al cambiar el RHS.
// Para surplus: incrementar b es como incrementar la holgura,
// pero la surplus entró con -1, así que los signos se invierten.
//
// Para restricciones = (sin slack): retornamos '—' (no se puede analizar directamente
// sin la columna de slack, a menos que se use la artificial residual).
// ============================================================
function computeRhsRange(tableau, basicVars, slackColIdx, constraintType) {
  if (slackColIdx === -1) {
    // Restricción de igualdad sin variable de holgura
    // Intentamos usar la columna artificial si está disponible,
    // pero generalmente no es fiable. Retornamos indicador.
    return { increase: '—', decrease: '—' };
  }

  let minIncrease = null;
  let minDecrease = null;
  const rhsColIdx = tableau[0].length - 1;

  // Determinar si necesitamos invertir signos (para surplus)
  const invertSign = (constraintType === 'surplus');

  for (let i = 0; i < basicVars.length; i++) {
    const rowIdx = i + 1;
    let coeff = tableau[rowIdx][slackColIdx]; // coeficiente de la slack/surplus en esta fila
    const rhs = tableau[rowIdx][rhsColIdx];   // RHS actual de esta fila (b̄i)

    // Para surplus (>=), la variable entró con -1 en la restricción.
    // En el tablero final, la columna refleja el efecto con ese signo.
    // Para obtener el efecto de cambiar b_i, necesitamos negar los coeficientes
    // porque Δb aparece con signo opuesto cuando hay surplus.
    if (invertSign) {
      coeff = coeff.neg();
    }

    if (coeff.isZero()) continue;

    const ratio = rhs.div(coeff);

    if (coeff.isPos()) {
      // Limita el incremento
      if (ratio.isPos() || ratio.isZero()) {
        if (minIncrease === null || ratio.lt(minIncrease)) {
          minIncrease = ratio;
        }
      }
    } else {
      // Limita el decremento
      const absRatio = ratio.abs();
      if (absRatio.isPos() || absRatio.isZero()) {
        if (minDecrease === null || absRatio.lt(minDecrease)) {
          minDecrease = absRatio;
        }
      }
    }
  }

  return {
    increase: minIncrease !== null ? minIncrease.toString() : '∞',
    decrease: minDecrease !== null ? minDecrease.toString() : '∞'
  };
}

// ============================================================
// Calcula el rango absoluto [mín, máx] dado un valor original
// y los incrementos/decrementos permisibles.
// ============================================================
function computeAbsoluteRange(origValue, ranges) {
  let minVal, maxVal;

  // Calcular valor mínimo
  if (ranges.decrease === '∞' || ranges.decrease === '—') {
    minVal = (ranges.decrease === '—') ? '—' : '−∞';
  } else {
    const dec = Fraction.parse(ranges.decrease);
    minVal = origValue.sub(dec).toHTML();
  }

  // Calcular valor máximo
  if (ranges.increase === '∞' || ranges.increase === '—') {
    maxVal = (ranges.increase === '—') ? '—' : '∞';
  } else {
    const inc = Fraction.parse(ranges.increase);
    maxVal = origValue.add(inc).toHTML();
  }

  return `[${minVal}, ${maxVal}]`;
}
