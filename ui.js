// ============================================================
// ui.js — Interfaz de usuario y renderizado de tableros
// ============================================================

// --- Navegación ---
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('section-' + tab.dataset.section).classList.add('active');
  });
});

function switchTab(name) {
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.section === name);
  });
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
}

// --- Estado global ---
let currentResult = null;
let currentConfig = null;

// --- Generar formulario dinámico ---
function generateForm() {
  const nv = parseInt(document.getElementById('num-vars').value) || 2;
  const nc = parseInt(document.getElementById('num-constraints').value) || 3;
  renderObjectiveInputs(nv);
  renderConstraintInputs(nv, nc);
}

function renderObjectiveInputs(nv) {
  const ct = document.getElementById('objective-container');
  let html = '<div class="objective-row">';
  html += '<span class="eq-label">Z =</span>';
  for (let j = 0; j < nv; j++) {
    if (j > 0) html += '<span class="plus-label">+</span>';
    html += `<input type="text" class="coeff-input" id="obj-c${j}" value="0" placeholder="c${j+1}">`;
    html += `<span class="var-label">X<sub>${j+1}</sub></span>`;
  }
  html += '</div>';
  ct.innerHTML = html;
}

function renderConstraintInputs(nv, nc) {
  const ct = document.getElementById('constraints-container');
  let html = '';
  for (let i = 0; i < nc; i++) {
    html += `<div class="constraint-row" id="cons-row-${i}">`;
    for (let j = 0; j < nv; j++) {
      if (j > 0) html += '<span class="plus-label">+</span>';
      html += `<input type="text" class="coeff-input" id="cons-${i}-c${j}" value="0" placeholder="a${i+1}${j+1}">`;
      html += `<span class="var-label">X<sub>${j+1}</sub></span>`;
    }
    html += `<select class="constraint-type" id="cons-${i}-type">
      <option value="<=">&le;</option>
      <option value=">=">&ge;</option>
      <option value="=">=</option>
    </select>`;
    html += `<input type="text" class="rhs-input" id="cons-${i}-rhs" value="0" placeholder="b${i+1}">`;
    html += `</div>`;
  }
  ct.innerHTML = html;
}

window.addEventListener('DOMContentLoaded', () => generateForm());

// --- Leer datos del formulario ---
function parseInput() {
  const type = document.getElementById('opt-type').value;
  const nv = parseInt(document.getElementById('num-vars').value) || 2;
  const nc = parseInt(document.getElementById('num-constraints').value) || 3;
  const objective = [];
  for (let j = 0; j < nv; j++) {
    objective.push(document.getElementById(`obj-c${j}`).value || '0');
  }
  const constraints = [];
  for (let i = 0; i < nc; i++) {
    const coeffs = [];
    for (let j = 0; j < nv; j++) {
      coeffs.push(document.getElementById(`cons-${i}-c${j}`).value || '0');
    }
    constraints.push({
      coeffs,
      type: document.getElementById(`cons-${i}-type`).value,
      rhs: document.getElementById(`cons-${i}-rhs`).value || '0'
    });
  }
  return { type, numVars: nv, objective, constraints };
}

// --- Resolver ---
function solveProblem() {
  const config = parseInput();
  currentConfig = config;
  try {
    const solver = new SimplexSolver(config);
    const result = solver.solve();
    currentResult = result;
    renderSolution(config, result);
    switchTab('solution');
    if (config.numVars === 2 && result.status !== 'unbounded' && result.status !== 'infeasible') {
      if (typeof renderGraph === 'function') renderGraph(config, result);
    }
    if ((result.status === 'optimal' || result.status === 'multiple') && typeof renderSensitivity === 'function') {
      renderSensitivity(config, result);
    }
  } catch (e) {
    document.getElementById('solution-content').innerHTML =
      `<div class="card solution-card error">
        <div class="card-title"><div class="icon">❌</div> Error</div>
        <p>${e.message}</p>
      </div>`;
    switchTab('solution');
  }
}

// --- Renderizar solución completa ---
function renderSolution(config, result) {
  const ct = document.getElementById('solution-content');
  let html = '';
  html += renderFormulation(config);
  html += renderAugmentedForm(result);
  html += '<div class="card"><div class="card-title"><div class="icon">📊</div> Tableros Simplex — Paso a Paso</div>';
  for (let idx = 0; idx < result.iterations.length; idx++) {
    const iter = result.iterations[idx];
    const isLast = idx === result.iterations.length - 1;
    html += renderTableau(iter, isLast, result.status);
    if (!isLast) html += '<div class="tableau-arrow">⬇</div>';
  }
  html += '</div>';
  html += renderFinalSolution(config, result);
  ct.innerHTML = html;
}

// --- Formulación original ---
function renderFormulation(config) {
  const type = config.type === 'max' ? 'Max' : 'Min';
  let obj = 'Z = ';
  for (let j = 0; j < config.numVars; j++) {
    const c = config.objective[j];
    if (j > 0) {
      const val = parseFloat(c);
      obj += val < 0 ? ` − ${Math.abs(val)}` : ` + ${c}`;
    } else {
      obj += c;
    }
    obj += `X<sub>${j+1}</sub>`;
  }
  let cons = '';
  config.constraints.forEach((c) => {
    let line = '';
    for (let j = 0; j < config.numVars; j++) {
      const val = c.coeffs[j];
      if (j > 0) {
        const v = parseFloat(val);
        line += v < 0 ? ` − ${Math.abs(v)}` : ` + ${val}`;
      } else {
        line += val;
      }
      line += `X<sub>${j+1}</sub>`;
    }
    const sym = c.type === '<=' ? '≤' : c.type === '>=' ? '≥' : '=';
    line += ` ${sym} ${c.rhs}`;
    cons += `<div class="form-constraint">${line}</div>`;
  });
  let nonNeg = '';
  for (let j = 0; j < config.numVars; j++) {
    nonNeg += (j > 0 ? ', ' : '') + `X<sub>${j+1}</sub>`;
  }
  return `<div class="card">
    <div class="card-title"><div class="icon">📐</div> Formulación del Problema</div>
    <div class="formulation-display">
      <div class="form-type">${type} ${obj}</div>
      <div style="color:var(--text-secondary);margin:0.5rem 0;">Sujeto a:</div>
      ${cons}
      <div class="form-noneg">${nonNeg} ≥ 0</div>
    </div>
  </div>`;
}

// --- Forma aumentada ---
function renderAugmentedForm(result) {
  if (!result.iterations.length) return '';
  const iter0 = result.iterations[0];
  const vn = iter0.varNames;
  let obj = 'Z';
  for (let j = 0; j < vn.length; j++) {
    const c = iter0.tableau[0][j + 1];
    if (!c.isZero()) {
      const sign = c.isPos() ? ' + ' : ' − ';
      const abs = c.abs();
      const coefStr = abs.eq(1) ? '' : abs.toString();
      obj += `${sign}${coefStr}${vn[j]}`;
    }
  }
  obj += ' = 0';
  let eqs = '';
  for (let i = 0; i < iter0.basicVars.length; i++) {
    let line = '';
    let first = true;
    for (let j = 0; j < vn.length; j++) {
      const c = iter0.tableau[i + 1][j + 1];
      if (!c.isZero()) {
        if (!first) {
          line += c.isPos() ? ' + ' : ' − ';
        } else {
          if (c.isNeg()) line += '−';
          first = false;
        }
        const abs = c.abs();
        const coefStr = abs.eq(1) ? '' : abs.toString();
        line += `${coefStr}${vn[j]}`;
      }
    }
    line += ` = ${iter0.tableau[i + 1][iter0.tableau[i + 1].length - 1].toString()}`;
    eqs += `<div class="form-constraint">${line}</div>`;
  }
  let allVars = vn.join(', ');
  return `<div class="card">
    <div class="card-title"><div class="icon">🔄</div> Forma Aumentada</div>
    <div class="augmented-arrow">⬇</div>
    <div class="formulation-display">
      <div class="form-type">${obj}</div>
      ${eqs}
      <div class="form-noneg">${allVars} ≥ 0</div>
    </div>
  </div>`;
}

// --- Renderizar un tablero ---
function renderTableau(iter, isLast, status) {
  const vn = iter.varNames;
  const numRows = iter.basicVars.length;
  const pc = iter.pivotCol;
  const pr = iter.pivotRow;
  const showRatios = !isLast && iter.ratios;
  let html = '<div class="iteration-block">';

  // Header
  html += '<div class="iteration-header">';
  html += `<span class="iteration-badge">Iteración ${iter.iteration}</span>`;
  if (iter.enteringVar && !isLast) {
    html += `<span class="iteration-info">Entra: <span class="var-enter">${iter.enteringVar}</span>`;
    if (iter.leavingVar) html += ` | Sale: <span class="var-leave">${iter.leavingVar}</span>`;
    html += '</span>';
  }
  if (isLast && iter.isOptimal) {
    const badge = status === 'multiple' ? 'multiple' : 'optimal';
    const label = status === 'multiple' ? '✨ Óptimo (Soluciones Múltiples)' : '✅ Solución Óptima';
    html += `<span class="status-badge ${badge}">${label}</span>`;
  }
  if (isLast && status === 'unbounded') html += '<span class="status-badge unbounded">⚠️ No Acotado</span>';
  if (isLast && status === 'infeasible') html += '<span class="status-badge infeasible">❌ Infactible</span>';
  html += '</div>';

  // Row operations that produced THIS tableau
  if (iter.operations && iter.operations.length > 0) {
    html += '<div class="row-operations"><strong>Operaciones: </strong>';
    iter.operations.forEach(op => { html += `<span>${op}</span>`; });
    html += '</div>';
  }

  // Table
  html += '<div class="simplex-table-wrapper"><table class="simplex-table"><thead><tr>';
  html += '<th>Ec#</th><th>VB</th><th>Z</th>';
  for (let j = 0; j < vn.length; j++) {
    const colIdx = j + 1;
    const sty = (pc === colIdx && !isLast) ? ' style="color:#fbbf24;"' : '';
    html += `<th${sty}>${vn[j]}</th>`;
  }
  html += '<th>LD</th>';
  if (showRatios) html += '<th>Razón</th>';
  html += '</tr></thead><tbody>';

  // Render a single row
  function mkRow(tRowIdx, eqLabel, vbLabel, isZRow) {
    const isPR = (pr === tRowIdx && !isLast);
    let cls = isZRow ? 'row-z' : '';
    if (isPR) cls += (cls ? ' ' : '') + 'pivot-row';
    let r = `<tr${cls ? ` class="${cls}"` : ''}>`;
    r += `<td class="col-eq">${eqLabel}</td><td class="col-vb">${vbLabel}</td>`;

    // Z column (index 0 in tableau)
    const zv = iter.tableau[tRowIdx][0];
    r += `<td class="${zv.isZero() ? 'zero' : ''}">${zv.toString()}</td>`;

    // Variable columns (index 1..vn.length in tableau)
    for (let j = 0; j < vn.length; j++) {
      const ci = j + 1;
      const v = iter.tableau[tRowIdx][ci];
      const isPC = (pc === ci && !isLast);
      const isPE = (isPR && pc === ci);
      let c = isPE ? 'pivot-element' : isPC ? 'pivot-col' : '';
      c += v.isNeg() ? ' negative' : v.isZero() ? ' zero' : '';
      r += `<td class="${c.trim()}">${v.toString()}</td>`;
    }

    // RHS (last column)
    const rhs = iter.tableau[tRowIdx][iter.tableau[tRowIdx].length - 1];
    r += `<td>${rhs.toString()}</td>`;

    // Ratio
    if (showRatios) {
      if (isZRow) {
        r += '<td class="zero">—</td>';
      } else {
        const ratio = iter.ratios[tRowIdx - 1];
        if (ratio !== null) {
          const isMin = (pr === tRowIdx);
          r += `<td${isMin ? ' style="color:#fbbf24;font-weight:700;"' : ''}>${ratio.toString()}${isMin ? ' ← Mín' : ''}</td>`;
        } else {
          r += '<td class="zero">—</td>';
        }
      }
    }
    r += '</tr>';
    return r;
  }

  html += mkRow(0, '(0)', 'Z', true);
  for (let i = 0; i < numRows; i++) {
    html += mkRow(i + 1, `(${i + 1})`, iter.basicVars[i], false);
  }

  html += '</tbody></table></div></div>';
  return html;
}

// --- Resultado final ---
function renderFinalSolution(config, result) {
  if (result.status === 'unbounded') {
    return `<div class="card solution-card error">
      <div class="card-title"><div class="icon">⚠️</div> Problema No Acotado</div>
      <p>La función objetivo puede crecer indefinidamente.</p></div>`;
  }
  if (result.status === 'infeasible') {
    return `<div class="card solution-card error">
      <div class="card-title"><div class="icon">❌</div> Problema Infactible</div>
      <p>No existe solución factible.</p></div>`;
  }
  let html = `<div class="card solution-card">
    <div class="card-title"><div class="icon">🏆</div> Solución ${result.status === 'multiple' ? '(Múltiples Óptimos)' : 'Óptima'}</div>
    <div class="solution-value">Z = ${result.solution.z.toString()} (${result.solution.z.toDecimal().toFixed(4).replace(/\.?0+$/, '')})</div>
    <div class="solution-vars">`;
  for (let j = 0; j < config.numVars; j++) {
    const vn = `X${j + 1}`;
    const val = result.solution.variables[vn] || new Fraction(0);
    html += `<div class="solution-var"><div class="var-name">${vn}</div><div class="var-value">${val.toString()}</div></div>`;
  }
  for (const key in result.solution.variables) {
    if (key.startsWith('S')) {
      const val = result.solution.variables[key];
      html += `<div class="solution-var"><div class="var-name">${key} (holgura)</div><div class="var-value">${val.toString()}</div></div>`;
    }
  }
  html += '</div></div>';
  return html;
}

// --- Ejemplos rápidos ---
function loadExample(num) {
  if (num === 1) {
    document.getElementById('opt-type').value = 'max';
    document.getElementById('num-vars').value = '2';
    document.getElementById('num-constraints').value = '3';
    generateForm();
    setTimeout(() => {
      document.getElementById('obj-c0').value = '1';
      document.getElementById('obj-c1').value = '2';
      document.getElementById('cons-0-c0').value = '1';
      document.getElementById('cons-0-c1').value = '3';
      document.getElementById('cons-0-type').value = '<=';
      document.getElementById('cons-0-rhs').value = '200';
      document.getElementById('cons-1-c0').value = '2';
      document.getElementById('cons-1-c1').value = '2';
      document.getElementById('cons-1-type').value = '<=';
      document.getElementById('cons-1-rhs').value = '300';
      document.getElementById('cons-2-c0').value = '0';
      document.getElementById('cons-2-c1').value = '1';
      document.getElementById('cons-2-type').value = '<=';
      document.getElementById('cons-2-rhs').value = '60';
    }, 50);
  } else if (num === 2) {
    document.getElementById('opt-type').value = 'max';
    document.getElementById('num-vars').value = '2';
    document.getElementById('num-constraints').value = '3';
    generateForm();
    setTimeout(() => {
      document.getElementById('obj-c0').value = '60';
      document.getElementById('obj-c1').value = '30';
      document.getElementById('cons-0-c0').value = '1';
      document.getElementById('cons-0-c1').value = '0';
      document.getElementById('cons-0-type').value = '<=';
      document.getElementById('cons-0-rhs').value = '5';
      document.getElementById('cons-1-c0').value = '0';
      document.getElementById('cons-1-c1').value = '1';
      document.getElementById('cons-1-type').value = '<=';
      document.getElementById('cons-1-rhs').value = '4';
      document.getElementById('cons-2-c0').value = '6';
      document.getElementById('cons-2-c1').value = '8';
      document.getElementById('cons-2-type').value = '<=';
      document.getElementById('cons-2-rhs').value = '48';
    }, 50);
  }
}
