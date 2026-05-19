// ============================================================
// simplex.js â€” Motor del MÃ©todo Simplex con aritmÃ©tica exacta
// ============================================================

// --- Utilidades ---
function gcd(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) { [a, b] = [b, a % b]; }
  return a || 1;
}

// --- Clase Fraction: aritmÃ©tica exacta de fracciones ---
class Fraction {
  constructor(num = 0, den = 1) {
    if (den === 0) throw new Error("Denominador cero");
    if (!Number.isFinite(num) || !Number.isFinite(den)) {
      this.num = 0; this.den = 1; return;
    }
    num = Math.round(num);
    den = Math.round(den);
    if (den < 0) { num = -num; den = -den; }
    const g = gcd(Math.abs(num), den);
    this.num = num / g;
    this.den = den / g;
  }

  static parse(value) {
    if (value instanceof Fraction) return value.clone();
    if (typeof value === 'number') {
      if (Number.isInteger(value)) return new Fraction(value);
      const s = value.toString();
      const d = s.indexOf('.');
      if (d === -1) return new Fraction(value);
      const dec = s.length - d - 1;
      const den = Math.pow(10, dec);
      return new Fraction(Math.round(value * den), den);
    }
    if (typeof value === 'string') {
      value = value.trim().replace(/\s/g, '');
      if (value === '' || value === '-') return new Fraction(0);
      if (value.includes('/')) {
        const parts = value.split('/');
        return new Fraction(parseInt(parts[0]), parseInt(parts[1]));
      }
      return Fraction.parse(parseFloat(value));
    }
    return new Fraction(0);
  }

  static ZERO = new Fraction(0);
  static ONE = new Fraction(1);

  clone() { return new Fraction(this.num, this.den); }
  add(o) { o = Fraction.parse(o); return new Fraction(this.num * o.den + o.num * this.den, this.den * o.den); }
  sub(o) { o = Fraction.parse(o); return new Fraction(this.num * o.den - o.num * this.den, this.den * o.den); }
  mul(o) { o = Fraction.parse(o); return new Fraction(this.num * o.num, this.den * o.den); }
  div(o) {
    o = Fraction.parse(o);
    if (o.num === 0) throw new Error("DivisiÃ³n por cero");
    return new Fraction(this.num * o.den, this.den * o.num);
  }
  neg() { return new Fraction(-this.num, this.den); }
  abs() { return new Fraction(Math.abs(this.num), this.den); }
  isZero() { return this.num === 0; }
  isNeg() { return this.num < 0; }
  isPos() { return this.num > 0; }
  eq(o) { o = Fraction.parse(o); return this.num * o.den === o.num * this.den; }
  lt(o) { o = Fraction.parse(o); return this.num * o.den < o.num * this.den; }
  gt(o) { o = Fraction.parse(o); return this.num * o.den > o.num * this.den; }
  le(o) { return this.lt(o) || this.eq(o); }
  ge(o) { return this.gt(o) || this.eq(o); }
  toDecimal() { return this.num / this.den; }

  toString() {
    if (this.den === 1) return String(this.num);
    return `${this.num}/${this.den}`;
  }

  toHTML() {
    if (this.den === 1) return `<span>${this.num}</span>`;
    const sign = this.num < 0 ? 'âˆ’' : '';
    const n = Math.abs(this.num);
    return `<span class="frac">${sign}<sup>${n}</sup>&frasl;<sub>${this.den}</sub></span>`;
  }
}

// --- Clase SimplexSolver ---
class SimplexSolver {
  constructor({ type, numVars, objective, constraints }) {
    this.type = type;                 // 'max' o 'min'
    this.numDecVars = numVars;
    this.origObjective = objective.map(v => Fraction.parse(v));
    this.origConstraints = constraints.map(c => ({
      coeffs: c.coeffs.map(v => Fraction.parse(v)),
      type: c.type,   // '<=', '>=', '='
      rhs: Fraction.parse(c.rhs)
    }));

    this.iterations = [];
    this.status = null;       // 'optimal','unbounded','infeasible','multiple'
    this.solution = null;
    this.M = new Fraction(100000);
    this.useBigM = false;
  }

  solve() {
    // Copiar coeficientes objetivo
    this.objCoeffs = this.origObjective.map(c => c.clone());

    // Si es minimizaciÃ³n, negamos el objetivo internamente
    this.isMin = this.type === 'min';
    if (this.isMin) {
      this.objCoeffs = this.objCoeffs.map(c => c.neg());
    }

    // Asegurar RHS no negativo
    this.constraints = this.origConstraints.map(c => {
      const nc = {
        coeffs: c.coeffs.map(v => v.clone()),
        type: c.type,
        rhs: c.rhs.clone()
      };
      if (nc.rhs.isNeg()) {
        nc.coeffs = nc.coeffs.map(v => v.neg());
        nc.rhs = nc.rhs.neg();
        if (nc.type === '<=') nc.type = '>=';
        else if (nc.type === '>=') nc.type = '<=';
      }
      return nc;
    });

    this._buildAugmented();
    this._recordIteration(0);

    let iter = 1;
    const maxIter = 100;
    while (iter <= maxIter) {
      if (this._isOptimal()) break;
      const pivotCol = this._findPivotCol();
      if (pivotCol === -1) { this.status = 'optimal'; break; }
      const pivotRow = this._findPivotRow(pivotCol);
      if (pivotRow === -1) { this.status = 'unbounded'; this._recordIteration(iter); break; }
      this._pivot(pivotRow, pivotCol, iter);
      iter++;
    }

    if (this.status !== 'unbounded') {
      if (this._hasArtificialInBasis()) {
        this.status = 'infeasible';
      } else {
        this.status = 'optimal';
        this._checkMultipleOptimal();
      }
    }

    this._extractSolution();
    return {
      status: this.status,
      solution: this.solution,
      iterations: this.iterations,
      metadata: {
        useBigM: this.useBigM,
        isDegenerado: this._checkDegeneracy(),
        numIterations: this.iterations.length,
        method: this.useBigM ? 'Big-M' : 'Simplex EstÃ¡ndar'
      }
    };
  }

  _buildAugmented() {
    const n = this.numDecVars;
    const m = this.constraints.length;

    this.varNames = [];
    for (let i = 0; i < n; i++) this.varNames.push(`X${i + 1}`);

    this.slackInfo = [];
    this.artificialInfo = [];
    this.useBigM = false;
    let sCount = 0, aCount = 0;

    // Determinar variables adicionales por restricciÃ³n
    for (let i = 0; i < m; i++) {
      const ct = this.constraints[i].type;
      if (ct === '<=') {
        sCount++;
        this.slackInfo.push({ row: i, name: `S${sCount}`, type: 'slack' });
        this.varNames.push(`S${sCount}`);
      } else if (ct === '>=') {
        sCount++;
        this.slackInfo.push({ row: i, name: `S${sCount}`, type: 'surplus' });
        this.varNames.push(`S${sCount}`);
        aCount++;
        this.artificialInfo.push({ row: i, name: `A${aCount}` });
        this.varNames.push(`A${aCount}`);
        this.useBigM = true;
      } else { // '='
        aCount++;
        this.artificialInfo.push({ row: i, name: `A${aCount}` });
        this.varNames.push(`A${aCount}`);
        this.useBigM = true;
      }
    }

    this.totalVars = this.varNames.length;
    const cols = 1 + this.totalVars + 1; // Z + vars + RHS
    this.numCols = cols;
    this.rhsCol = cols - 1;

    // Construir tablero
    this.tableau = [];

    // Fila 0 (objetivo): Z - c1X1 - c2X2 ... = 0
    let row0 = Array.from({ length: cols }, () => new Fraction(0));
    row0[0] = new Fraction(1);
    for (let j = 0; j < n; j++) {
      row0[1 + j] = this.objCoeffs[j].neg();
    }
    this.tableau.push(row0);

    // Filas de restricciones
    this.basicVars = [];
    for (let i = 0; i < m; i++) {
      let row = Array.from({ length: cols }, () => new Fraction(0));
      for (let j = 0; j < n; j++) {
        row[1 + j] = this.constraints[i].coeffs[j].clone();
      }
      row[this.rhsCol] = this.constraints[i].rhs.clone();
      this.tableau.push(row);
      this.basicVars.push(null);
    }

    // Ubicar coeficientes de slack/surplus
    let varIdx = n;
    for (const si of this.slackInfo) {
      const col = 1 + varIdx;
      if (si.type === 'slack') {
        this.tableau[si.row + 1][col] = new Fraction(1);
        this.basicVars[si.row] = si.name;
      } else {
        this.tableau[si.row + 1][col] = new Fraction(-1);
      }
      varIdx++;
      // Si es surplus, la artificial va en la siguiente columna
      if (si.type === 'surplus') {
        const ai = this.artificialInfo.find(a => a.row === si.row);
        if (ai) {
          const aCol = 1 + varIdx;
          this.tableau[si.row + 1][aCol] = new Fraction(1);
          this.basicVars[si.row] = ai.name;
          // Big-M en fila objetivo
          this.tableau[0][aCol] = this.M.clone();
          varIdx++;
        }
      }
    }

    // Variables artificiales para restricciones '='
    for (const ai of this.artificialInfo) {
      if (this.constraints[ai.row].type === '=') {
        const col = 1 + varIdx;
        this.tableau[ai.row + 1][col] = new Fraction(1);
        this.basicVars[ai.row] = ai.name;
        this.tableau[0][col] = this.M.clone();
        varIdx++;
      }
    }

    // Eliminar artificiales de fila 0 (hacer coeficiente 0 en columnas de artificiales bÃ¡sicas)
    for (const ai of this.artificialInfo) {
      const rowIdx = ai.row + 1;
      const colIdx = 1 + this.varNames.indexOf(ai.name);
      const factor = this.tableau[0][colIdx];
      if (!factor.isZero()) {
        for (let j = 0; j < cols; j++) {
          this.tableau[0][j] = this.tableau[0][j].sub(factor.mul(this.tableau[rowIdx][j]));
        }
      }
    }
  }

  _isOptimal() {
    // Ã“ptimo si no hay coeficientes negativos en fila 0 (cols 1..totalVars)
    for (let j = 1; j <= this.totalVars; j++) {
      if (this.tableau[0][j].isNeg()) return false;
    }
    return true;
  }

  _findPivotCol() {
    // Regla de Bland: seleccionar la PRIMERA variable (menor Ã­ndice)
    // con coeficiente negativo en fila 0, para evitar ciclado
    for (let j = 1; j <= this.totalVars; j++) {
      if (this.tableau[0][j].isNeg()) {
        return j;
      }
    }
    return -1;
  }

  _findPivotRow(pivotCol) {
    // Prueba de razÃ³n mÃ­nima con regla de Bland:
    // En caso de empate, se selecciona la fila con menor Ã­ndice
    // (el uso de '<' estricto ya garantiza esto al recorrer en orden ascendente)
    const m = this.basicVars.length;
    let minRatio = null;
    let minRow = -1;
    for (let i = 0; i < m; i++) {
      const val = this.tableau[i + 1][pivotCol];
      if (val.isPos()) {
        const ratio = this.tableau[i + 1][this.rhsCol].div(val);
        if (minRatio === null || ratio.lt(minRatio)) {
          minRatio = ratio;
          minRow = i + 1;
        }
      }
    }
    return minRow;
  }

  _computeRatios(pivotCol) {
    const m = this.basicVars.length;
    const ratios = [];
    for (let i = 0; i < m; i++) {
      const val = this.tableau[i + 1][pivotCol];
      if (val.isPos()) {
        ratios.push(this.tableau[i + 1][this.rhsCol].div(val));
      } else {
        ratios.push(null);
      }
    }
    return ratios;
  }

  _pivot(pivotRow, pivotCol, iterNum) {
    const pivotElement = this.tableau[pivotRow][pivotCol].clone();
    const leavingVar = this.basicVars[pivotRow - 1];
    const enteringVar = this.varNames[pivotCol - 1];
    const ops = [];

    // Dividir fila pivote por elemento pivote
    if (!pivotElement.eq(1)) {
      for (let j = 0; j < this.numCols; j++) {
        this.tableau[pivotRow][j] = this.tableau[pivotRow][j].div(pivotElement);
      }
      ops.push(`R${pivotRow} = R${pivotRow} / ${pivotElement.toString()}`);
    }

    // Hacer ceros en la columna pivote
    const numRows = this.tableau.length;
    for (let i = 0; i < numRows; i++) {
      if (i === pivotRow) continue;
      const factor = this.tableau[i][pivotCol].clone();
      if (!factor.isZero()) {
        for (let j = 0; j < this.numCols; j++) {
          this.tableau[i][j] = this.tableau[i][j].sub(factor.mul(this.tableau[pivotRow][j]));
        }
        const sign = factor.isPos() ? '-' : '+';
        const absFactor = factor.abs();
        const fStr = absFactor.eq(1) ? '' : absFactor.toString() + 'Â·';
        const rowLabel = i === 0 ? '(0)' : `(${i})`;
        ops.push(`${rowLabel} = ${rowLabel} ${sign} ${fStr}(${pivotRow})`);
      }
    }

    // Actualizar variable bÃ¡sica
    this.basicVars[pivotRow - 1] = enteringVar;

    this._recordIteration(iterNum, {
      pivotCol, pivotRow, pivotElement,
      enteringVar, leavingVar, operations: ops
    });
  }

  _recordIteration(iterNum, pivotInfo = null) {
    const optimal = this._isOptimal();

    // After a pivot, compute next pivot info and ratios for display
    let nextPivotCol = null, nextPivotRow = null, nextRatios = null, nextEntering = null, nextLeaving = null;
    if (!optimal) {
      nextPivotCol = this._findPivotCol();
      if (nextPivotCol !== -1) {
        nextRatios = this._computeRatios(nextPivotCol);
        nextPivotRow = this._findPivotRow(nextPivotCol);
        nextEntering = this.varNames[nextPivotCol - 1];
        if (nextPivotRow !== -1) {
          nextLeaving = this.basicVars[nextPivotRow - 1];
        }
      }
    }

    const snapshot = {
      iteration: iterNum,
      varNames: [...this.varNames],
      basicVars: [...this.basicVars],
      tableau: this.tableau.map(row => row.map(v => v.clone())),
      // Para visualizaciÃ³n: muestra la info del SIGUIENTE pivote
      pivotCol: nextPivotCol,
      pivotRow: nextPivotRow,
      pivotElement: (nextPivotRow !== null && nextPivotCol !== null && nextPivotRow !== -1)
        ? this.tableau[nextPivotRow][nextPivotCol].clone() : null,
      enteringVar: nextEntering,
      leavingVar: nextLeaving,
      ratios: nextRatios,
      // Operaciones realizadas para llegar a este tablero (iteraciÃ³n anterior)
      operations: pivotInfo ? pivotInfo.operations : null,
      prevEntering: pivotInfo ? pivotInfo.enteringVar : null,
      prevLeaving: pivotInfo ? pivotInfo.leavingVar : null,
      isOptimal: optimal,
      // DetecciÃ³n de degeneraciÃ³n: alguna variable bÃ¡sica tiene RHS = 0
      isDegenerado: this._checkDegeneracy()
    };

    this.iterations.push(snapshot);
  }

  _hasArtificialInBasis() {
    for (const bv of this.basicVars) {
      if (bv && bv.startsWith('A')) {
        const rowIdx = this.basicVars.indexOf(bv) + 1;
        if (!this.tableau[rowIdx][this.rhsCol].isZero()) return true;
      }
    }
    return false;
  }

  // DetecciÃ³n de degeneraciÃ³n: retorna true si alguna variable bÃ¡sica tiene RHS = 0
  _checkDegeneracy() {
    const m = this.basicVars.length;
    for (let i = 0; i < m; i++) {
      if (this.tableau[i + 1][this.rhsCol].isZero()) return true;
    }
    return false;
  }

  _checkMultipleOptimal() {
    // Si alguna variable no bÃ¡sica tiene coeficiente 0 en fila Z
    for (let j = 1; j <= this.totalVars; j++) {
      const vName = this.varNames[j - 1];
      if (!this.basicVars.includes(vName) && this.tableau[0][j].isZero() && !vName.startsWith('A')) {
        this.status = 'multiple';
        break;
      }
    }
  }

  _extractSolution() {
    if (this.status === 'unbounded' || this.status === 'infeasible') {
      this.solution = { z: null, variables: {} };
      return;
    }

    let zVal = this.tableau[0][this.rhsCol].clone();
    if (this.isMin) zVal = zVal.neg();

    const variables = {};
    for (let i = 0; i < this.numDecVars; i++) {
      const vName = `X${i + 1}`;
      const bIdx = this.basicVars.indexOf(vName);
      variables[vName] = bIdx !== -1 ? this.tableau[bIdx + 1][this.rhsCol].clone() : new Fraction(0);
    }

    // Holguras
    for (const si of this.slackInfo) {
      const bIdx = this.basicVars.indexOf(si.name);
      variables[si.name] = bIdx !== -1 ? this.tableau[bIdx + 1][this.rhsCol].clone() : new Fraction(0);
    }

    this.solution = { z: zVal, variables };
  }

  // Obtener el tablero Ã³ptimo final para anÃ¡lisis de sensibilidad
  getOptimalTableau() {
    if (this.iterations.length === 0) return null;
    return this.iterations[this.iterations.length - 1];
  }
}
// ============================================================
// test.js â€” Suite de Pruebas para SimplexSolver
// Ejecutar con: node _test_combined.js
// ============================================================

// --- Test Runner ---
let testsPassed = 0;
let testsFailed = 0;
const testResults = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`AserciÃ³n fallida: ${message}`);
  }
}

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: esperado ${expected}, obtuvo ${actual}`);
  }
}

function assertFracEq(frac, expectedStr, message) {
  if (frac.toString() !== expectedStr) {
    throw new Error(`${message}: esperado ${expectedStr}, obtuvo ${frac.toString()}`);
  }
}

function runTest(name, fn) {
  try {
    fn();
    testsPassed++;
    testResults.push({ name, status: 'PASS' });
    console.log(`  âœ… ${name}`);
  } catch (e) {
    testsFailed++;
    testResults.push({ name, status: 'FAIL', error: e.message });
    console.log(`  âŒ ${name}`);
    console.log(`     ${e.message}`);
  }
}

// ============================================================
// TESTS
// ============================================================

console.log('\n====================================');
console.log('  Suite de Pruebas â€” Solver PL');
console.log('====================================\n');

// --- Test 1: Ejemplo Word Light (Max estÃ¡ndar con <=) ---
runTest('1. Word Light â€” Max estÃ¡ndar con <=', () => {
  const s = new SimplexSolver({
    type: 'max', numVars: 2, objective: ['1', '2'],
    constraints: [
      { coeffs: ['1', '3'], type: '<=', rhs: '200' },
      { coeffs: ['2', '2'], type: '<=', rhs: '300' },
      { coeffs: ['0', '1'], type: '<=', rhs: '60' }
    ]
  });
  const r = s.solve();
  assertEq(r.status, 'optimal', 'Status');
  assertFracEq(r.solution.z, '170', 'Z');
  assertFracEq(r.solution.variables.X1, '90', 'X1');
  assertFracEq(r.solution.variables.X2, '40', 'X2');
  assertEq(r.metadata.useBigM, false, 'No debe usar Big-M');
  assertEq(r.metadata.method, 'Simplex EstÃ¡ndar', 'MÃ©todo');
});

// --- Test 2: Ejemplo ProducciÃ³n (Max estÃ¡ndar con <=) ---
runTest('2. ProducciÃ³n â€” Max estÃ¡ndar con <=', () => {
  const s = new SimplexSolver({
    type: 'max', numVars: 2, objective: ['60', '30'],
    constraints: [
      { coeffs: ['1', '0'], type: '<=', rhs: '5' },
      { coeffs: ['0', '1'], type: '<=', rhs: '4' },
      { coeffs: ['6', '8'], type: '<=', rhs: '48' }
    ]
  });
  const r = s.solve();
  assertEq(r.status, 'optimal', 'Status');
  assertFracEq(r.solution.z, '360', 'Z');
  assertFracEq(r.solution.variables.X1, '5', 'X1');
  assertFracEq(r.solution.variables.X2, '2', 'X2');
});

// --- Test 3: Big-M con restricciÃ³n >= ---
runTest('3. Big-M â€” Con restricciÃ³n >=', () => {
  const s = new SimplexSolver({
    type: 'max', numVars: 2, objective: ['5', '4'],
    constraints: [
      { coeffs: ['6', '4'], type: '<=', rhs: '24' },
      { coeffs: ['1', '2'], type: '<=', rhs: '6' },
      { coeffs: ['1', '1'], type: '>=', rhs: '2' }
    ]
  });
  const r = s.solve();
  assertEq(r.status, 'optimal', 'Status');
  assertEq(r.metadata.useBigM, true, 'Debe usar Big-M');
  assertEq(r.metadata.method, 'Big-M', 'MÃ©todo');
  // La soluciÃ³n debe ser factible: Z > 0
  assert(r.solution.z.isPos(), 'Z debe ser positivo');
  // Verificar que X1 + X2 >= 2 (restricciÃ³n >=)
  const x1 = r.solution.variables.X1.toDecimal();
  const x2 = r.solution.variables.X2.toDecimal();
  assert(x1 + x2 >= 2 - 0.001, `X1+X2=${x1 + x2} debe ser >= 2`);
});

// --- Test 4: Big-M con restricciÃ³n = y minimizaciÃ³n ---
runTest('4. MinimizaciÃ³n con restricciones >= y =', () => {
  const s = new SimplexSolver({
    type: 'min', numVars: 2, objective: ['2', '3'],
    constraints: [
      { coeffs: ['1', '1'], type: '>=', rhs: '4' },
      { coeffs: ['1', '3'], type: '>=', rhs: '6' },
      { coeffs: ['1', '0'], type: '<=', rhs: '5' }
    ]
  });
  const r = s.solve();
  assertEq(r.status, 'optimal', 'Status');
  assertEq(r.metadata.useBigM, true, 'Debe usar Big-M');
  // La soluciÃ³n debe ser factible
  assert(r.solution.z !== null, 'Z no debe ser null');
  const x1 = r.solution.variables.X1.toDecimal();
  const x2 = r.solution.variables.X2.toDecimal();
  // Verificar restricciones
  assert(x1 + x2 >= 4 - 0.001, `R1: X1+X2=${x1 + x2} >= 4`);
  assert(x1 + 3 * x2 >= 6 - 0.001, `R2: X1+3X2=${x1 + 3 * x2} >= 6`);
  assert(x1 <= 5 + 0.001, `R3: X1=${x1} <= 5`);
});

// --- Test 5: RestricciÃ³n de igualdad ---
runTest('5. Con restricciÃ³n de igualdad (=)', () => {
  const s = new SimplexSolver({
    type: 'max', numVars: 2, objective: ['3', '5'],
    constraints: [
      { coeffs: ['1', '0'], type: '<=', rhs: '4' },
      { coeffs: ['0', '1'], type: '<=', rhs: '6' },
      { coeffs: ['1', '1'], type: '=', rhs: '8' }
    ]
  });
  const r = s.solve();
  assertEq(r.status, 'optimal', 'Status');
  assertEq(r.metadata.useBigM, true, 'Debe usar Big-M con =');
  const x1 = r.solution.variables.X1.toDecimal();
  const x2 = r.solution.variables.X2.toDecimal();
  // Verificar igualdad
  assert(Math.abs(x1 + x2 - 8) < 0.001, `X1+X2=${x1 + x2} debe ser = 8`);
});

// --- Test 6: Problema Infactible ---
runTest('6. Problema Infactible', () => {
  const s = new SimplexSolver({
    type: 'max', numVars: 2, objective: ['1', '1'],
    constraints: [
      { coeffs: ['1', '1'], type: '<=', rhs: '4' },
      { coeffs: ['1', '1'], type: '>=', rhs: '6' }
    ]
  });
  const r = s.solve();
  assertEq(r.status, 'infeasible', 'Status debe ser infeasible');
});

// --- Test 7: Problema No Acotado ---
runTest('7. Problema No Acotado', () => {
  const s = new SimplexSolver({
    type: 'max', numVars: 2, objective: ['2', '1'],
    constraints: [
      { coeffs: ['1', '-1'], type: '<=', rhs: '10' },
      { coeffs: ['-1', '1'], type: '<=', rhs: '10' }
    ]
  });
  const r = s.solve();
  assertEq(r.status, 'unbounded', 'Status debe ser unbounded');
});

// --- Test 8: MÃºltiples Ã“ptimos ---
runTest('8. MÃºltiples Ã“ptimos', () => {
  const s = new SimplexSolver({
    type: 'max', numVars: 2, objective: ['2', '4'],
    constraints: [
      { coeffs: ['1', '2'], type: '<=', rhs: '10' },
      { coeffs: ['1', '1'], type: '<=', rhs: '8' },
      { coeffs: ['1', '0'], type: '<=', rhs: '6' }
    ]
  });
  const r = s.solve();
  // La funciÃ³n objetivo es paralela a una restricciÃ³n => mÃºltiples Ã³ptimos
  assertEq(r.status, 'multiple', 'Status debe ser multiple');
  assertFracEq(r.solution.z, '20', 'Z Ã³ptimo');
});

// --- Test 9: MinimizaciÃ³n estÃ¡ndar ---
runTest('9. MinimizaciÃ³n estÃ¡ndar con <=', () => {
  const s = new SimplexSolver({
    type: 'min', numVars: 2, objective: ['6', '4'],
    constraints: [
      { coeffs: ['1', '0'], type: '<=', rhs: '5' },
      { coeffs: ['0', '1'], type: '<=', rhs: '4' },
      { coeffs: ['1', '1'], type: '<=', rhs: '7' }
    ]
  });
  const r = s.solve();
  assertEq(r.status, 'optimal', 'Status');
  // Min Z ocurre en el origen: Z = 0
  assertFracEq(r.solution.z, '0', 'Z mÃ­nimo');
  assertFracEq(r.solution.variables.X1, '0', 'X1');
  assertFracEq(r.solution.variables.X2, '0', 'X2');
});

// --- Test 10: DegeneraciÃ³n ---
runTest('10. DetecciÃ³n de DegeneraciÃ³n', () => {
  // Problema con degeneraciÃ³n: 3 restricciones se cruzan en un punto
  const s = new SimplexSolver({
    type: 'max', numVars: 2, objective: ['3', '5'],
    constraints: [
      { coeffs: ['1', '1'], type: '<=', rhs: '4' },
      { coeffs: ['1', '0'], type: '<=', rhs: '2' },
      { coeffs: ['0', '1'], type: '<=', rhs: '2' }
    ]
  });
  const r = s.solve();
  assertEq(r.status, 'optimal', 'Status');
  assertFracEq(r.solution.z, '16', 'Z');
  assertFracEq(r.solution.variables.X1, '2', 'X1');
  assertFracEq(r.solution.variables.X2, '2', 'X2');
  // Este problema es degenerado (3 restricciones activas, 2 variables)
  assertEq(r.metadata.isDegenerado, true, 'Debe detectar degeneraciÃ³n');
});

// --- Test 11: Metadata correcta ---
runTest('11. Metadata del resultado', () => {
  const s = new SimplexSolver({
    type: 'max', numVars: 2, objective: ['1', '2'],
    constraints: [
      { coeffs: ['1', '3'], type: '<=', rhs: '200' },
      { coeffs: ['2', '2'], type: '<=', rhs: '300' },
      { coeffs: ['0', '1'], type: '<=', rhs: '60' }
    ]
  });
  const r = s.solve();
  assert(r.metadata !== undefined, 'Metadata debe existir');
  assertEq(typeof r.metadata.useBigM, 'boolean', 'useBigM tipo');
  assertEq(typeof r.metadata.isDegenerado, 'boolean', 'isDegenerado tipo');
  assertEq(typeof r.metadata.numIterations, 'number', 'numIterations tipo');
  assertEq(typeof r.metadata.method, 'string', 'method tipo');
  assert(r.metadata.numIterations > 0, 'Debe tener >= 1 iteraciÃ³n');
});

// --- Test 12: Iteraciones tienen isDegenerado ---
runTest('12. isDegenerado en iteraciones', () => {
  const s = new SimplexSolver({
    type: 'max', numVars: 2, objective: ['1', '1'],
    constraints: [
      { coeffs: ['1', '0'], type: '<=', rhs: '5' },
      { coeffs: ['0', '1'], type: '<=', rhs: '5' }
    ]
  });
  const r = s.solve();
  r.iterations.forEach((it, idx) => {
    assert(typeof it.isDegenerado === 'boolean',
      `IteraciÃ³n ${idx} debe tener isDegenerado (booleano)`);
  });
});

// ============================================================
// RESUMEN
// ============================================================
console.log('\n====================================');
console.log(`  Resultados: ${testsPassed} pasaron, ${testsFailed} fallaron`);
console.log('====================================\n');

if (testsFailed > 0) {
  console.log('Tests fallidos:');
  testResults.filter(t => t.status === 'FAIL').forEach(t => {
    console.log(`  - ${t.name}: ${t.error}`);
  });
  console.log('');
}

// Exit code para CI
if (typeof process !== 'undefined') {
  process.exit(testsFailed > 0 ? 1 : 0);
}
