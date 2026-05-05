// ============================================================
// sensitivity.js — Análisis de Sensibilidad
// ============================================================

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

  // --- Variables de Decisión ---
  let decRows = '';
  for (let j = 0; j < numDecVars; j++) {
    const vName = `X${j + 1}`;
    const colIdx = j + 1;
    const bIdx = basicVars.indexOf(vName);
    const value = bIdx !== -1 ? tableau[bIdx + 1][rhsCol] : new Fraction(0);

    // Reduced cost = coefficient in row 0
    const reducedCost = tableau[0][colIdx];

    // Original objective coefficient
    const origCoeff = config.objective[j];

    // Allowable increase/decrease for c_j
    const ranges = computeObjRange(tableau, varNames, basicVars, colIdx, config.type === 'min');

    decRows += `<tr>
      <td class="col-vb">${vName}</td>
      <td>${value.toString()}</td>
      <td>${reducedCost.toString()}</td>
      <td>${origCoeff}</td>
      <td>${ranges.increase}</td>
      <td>${ranges.decrease}</td>
    </tr>`;
  }

  // --- Restricciones ---
  let consRows = '';

  // Find slack variable info
  // Slack variables are after the decision variables in varNames
  let slackStartIdx = numDecVars;
  for (let i = 0; i < numConstraints; i++) {
    const constraintType = config.constraints[i].type;
    let slackName = null;
    let slackColIdx = -1;

    // Find the slack/surplus variable for this constraint
    for (let k = slackStartIdx; k < varNames.length; k++) {
      if (varNames[k].startsWith('S')) {
        // Check if this slack belongs to this constraint by checking if it's in the right position
        slackName = varNames[k];
        slackColIdx = k + 1; // column index in tableau
        slackStartIdx = k + 1;
        break;
      }
    }

    const origRhs = config.constraints[i].rhs;

    // Shadow price = coefficient of slack in row 0
    let shadowPrice = new Fraction(0);
    if (slackColIdx !== -1) {
      shadowPrice = tableau[0][slackColIdx].clone();
      if (config.type === 'min') shadowPrice = shadowPrice.neg();
    }

    // Slack value
    let slackValue = new Fraction(0);
    if (slackName) {
      const bIdx = basicVars.indexOf(slackName);
      slackValue = bIdx !== -1 ? tableau[bIdx + 1][rhsCol].clone() : new Fraction(0);
    }

    // Allowable increase/decrease for b_i
    const rhsRanges = computeRhsRange(tableau, basicVars, slackColIdx);

    consRows += `<tr>
      <td class="col-vb">R${i + 1}</td>
      <td>${slackValue.toString()}</td>
      <td>${shadowPrice.toString()}</td>
      <td>${origRhs}</td>
      <td>${rhsRanges.increase}</td>
      <td>${rhsRanges.decrease}</td>
    </tr>`;
  }

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
          </tr></thead>
          <tbody>${decRows}</tbody>
        </table>
      </div>

      <h3 style="color:var(--accent-3);margin:1.5rem 0 0.5rem;font-size:1rem;">Restricciones</h3>
      <div class="sensitivity-table-wrapper">
        <table class="sensitivity-table">
          <thead><tr>
            <th>Restricción</th>
            <th>Holgura</th>
            <th>Precio Sombra</th>
            <th>RHS Original</th>
            <th>Incremento Permisible</th>
            <th>Decremento Permisible</th>
          </tr></thead>
          <tbody>${consRows}</tbody>
        </table>
      </div>

      <div style="margin-top:1.5rem;padding:1rem;background:rgba(99,102,241,0.06);border-radius:10px;border:1px solid rgba(99,102,241,0.15);">
        <h4 style="color:var(--accent-3);margin-bottom:0.5rem;">📘 Interpretación</h4>
        <ul style="color:var(--text-secondary);font-size:0.85rem;line-height:1.8;padding-left:1.2rem;">
          <li><strong>Costo Reducido</strong>: Cuánto debe mejorar el coeficiente de una variable no básica antes de que entre a la base.</li>
          <li><strong>Precio Sombra</strong>: Cambio en Z por cada unidad adicional en el RHS de la restricción (dentro del rango permisible).</li>
          <li><strong>Incremento/Decremento Permisible</strong>: Rango en el cual el cambio mantiene la base óptima actual.</li>
          <li>Un precio sombra de 0 indica que la restricción no es activa (tiene holgura).</li>
        </ul>
      </div>
    </div>`;
}

// Compute allowable range for objective coefficient c_j
function computeObjRange(tableau, varNames, basicVars, colIdx, isMin) {
  const vName = varNames[colIdx - 1];
  const bIdx = basicVars.indexOf(vName);

  if (bIdx === -1) {
    // Non-basic variable: reduced cost tells how much we can change
    const rc = tableau[0][colIdx];
    return {
      increase: isMin ? rc.toString() : '∞',
      decrease: isMin ? '∞' : rc.toString()
    };
  }

  // Basic variable: check ratios in row 0 / column entries
  let minIncrease = null;
  let minDecrease = null;
  const basicRowIdx = bIdx + 1;

  for (let j = 1; j < tableau[0].length - 1; j++) {
    if (j === colIdx) continue;
    if (basicVars.includes(varNames[j - 1])) continue;

    const zj = tableau[0][j]; // coefficient in row 0
    const aij = tableau[basicRowIdx][j]; // coefficient in basic var's row

    if (!aij.isZero()) {
      const ratio = zj.div(aij);
      if (aij.isPos()) {
        // Increase limited
        if (minIncrease === null || ratio.lt(minIncrease)) minIncrease = ratio;
      } else {
        // Decrease limited
        const absRatio = ratio.neg();
        if (minDecrease === null || absRatio.lt(minDecrease)) minDecrease = absRatio;
      }
    }
  }

  return {
    increase: minIncrease !== null ? minIncrease.abs().toString() : '∞',
    decrease: minDecrease !== null ? minDecrease.abs().toString() : '∞'
  };
}

// Compute allowable range for RHS b_i
function computeRhsRange(tableau, basicVars, slackColIdx) {
  if (slackColIdx === -1) return { increase: '—', decrease: '—' };

  let minIncrease = null;
  let minDecrease = null;

  for (let i = 0; i < basicVars.length; i++) {
    const rowIdx = i + 1;
    const rhsCol = tableau[rowIdx].length - 1;
    const coeff = tableau[rowIdx][slackColIdx]; // coefficient of slack variable in this row
    const rhs = tableau[rowIdx][rhsCol]; // current RHS

    if (!coeff.isZero()) {
      const ratio = rhs.div(coeff);
      if (coeff.isPos()) {
        // Increase is limited
        if (minIncrease === null || ratio.lt(minIncrease)) {
          minIncrease = ratio;
        }
      } else {
        // Decrease is limited
        const absRatio = ratio.neg();
        if (minDecrease === null || absRatio.lt(minDecrease)) {
          minDecrease = absRatio;
        }
      }
    }
  }

  return {
    increase: minIncrease !== null && minIncrease.isPos() ? minIncrease.toString() : '∞',
    decrease: minDecrease !== null && minDecrease.isPos() ? minDecrease.toString() : '∞'
  };
}
