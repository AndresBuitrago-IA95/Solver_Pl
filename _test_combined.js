// ============================================================
// simplex.js — Motor del Método Simplex con aritmética exacta
// ============================================================

// --- Utilidades ---
function gcd(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) { [a, b] = [b, a % b]; }
  return a || 1;
}

// --- Clase Fraction: aritmética exacta de fracciones ---
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
    if (o.num === 0) throw new Error("División por cero");
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
    const sign = this.num < 0 ? '−' : '';
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
    this.M = new Fraction(10000);
    this.useBigM = false;
  }

  solve() {
    // Copiar coeficientes objetivo
    this.objCoeffs = this.origObjective.map(c => c.clone());

    // Si es minimización, negamos el objetivo internamente
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
    return { status: this.status, solution: this.solution, iterations: this.iterations };
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

    // Determinar variables adicionales por restricción
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

    // Eliminar artificiales de fila 0 (hacer coeficiente 0 en columnas de artificiales básicas)
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
    // Óptimo si no hay coeficientes negativos en fila 0 (cols 1..totalVars)
    for (let j = 1; j <= this.totalVars; j++) {
      if (this.tableau[0][j].isNeg()) return false;
    }
    return true;
  }

  _findPivotCol() {
    // Columna con coeficiente más negativo en fila 0
    let minVal = new Fraction(0);
    let minCol = -1;
    for (let j = 1; j <= this.totalVars; j++) {
      if (this.tableau[0][j].lt(minVal)) {
        minVal = this.tableau[0][j];
        minCol = j;
      }
    }
    return minCol;
  }

  _findPivotRow(pivotCol) {
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
        const fStr = absFactor.eq(1) ? '' : absFactor.toString() + '·';
        const rowLabel = i === 0 ? '(0)' : `(${i})`;
        ops.push(`${rowLabel} = ${rowLabel} ${sign} ${fStr}(${pivotRow})`);
      }
    }

    // Actualizar variable básica
    this.basicVars[pivotRow - 1] = enteringVar;

    this._recordIteration(iterNum, {
      pivotCol, pivotRow, pivotElement,
      enteringVar, leavingVar, operations: ops
    });
  }

  _recordIteration(iterNum, pivotInfo = null) {
    const m = this.basicVars.length;
    const ratios = pivotInfo ? null : (() => {
      const pc = this._findPivotCol();
      return pc !== -1 ? this._computeRatios(pc) : null;
    })();
    const pc = pivotInfo ? pivotInfo.pivotCol : this._findPivotCol();
    const pr = pivotInfo ? pivotInfo.pivotRow : (pc !== -1 ? this._findPivotRow(pc) : -1);

    const snapshot = {
      iteration: iterNum,
      varNames: [...this.varNames],
      basicVars: [...this.basicVars],
      tableau: this.tableau.map(row => row.map(v => v.clone())),
      pivotCol: (!pivotInfo && pc !== -1) ? pc : (pivotInfo ? pivotInfo.pivotCol : null),
      pivotRow: (!pivotInfo && pr !== -1) ? pr : (pivotInfo ? pivotInfo.pivotRow : null),
      pivotElement: pivotInfo ? pivotInfo.pivotElement : null,
      enteringVar: pivotInfo ? pivotInfo.enteringVar : (pc !== -1 ? this.varNames[pc - 1] : null),
      leavingVar: pivotInfo ? pivotInfo.leavingVar : null,
      operations: pivotInfo ? pivotInfo.operations : null,
      ratios: ratios || (pc !== -1 && !pivotInfo ? this._computeRatios(pc) : null),
      isOptimal: pivotInfo ? false : this._isOptimal()
    };

    // Para iteración 0: calcular ratios y pivot info
    if (iterNum === 0 && !pivotInfo) {
      if (pc !== -1) {
        snapshot.enteringVar = this.varNames[pc - 1];
        snapshot.pivotCol = pc;
        if (pr !== -1) {
          snapshot.pivotRow = pr;
          snapshot.pivotElement = this.tableau[pr][pc].clone();
          snapshot.leavingVar = this.basicVars[pr - 1];
        }
      }
    }

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

  _checkMultipleOptimal() {
    // Si alguna variable no básica tiene coeficiente 0 en fila Z
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

  // Obtener el tablero óptimo final para análisis de sensibilidad
  getOptimalTableau() {
    if (this.iterations.length === 0) return null;
    return this.iterations[this.iterations.length - 1];
  }
}

const s = new SimplexSolver({
  type:'max', numVars:2, objective:['1','2'],
  constraints:[
    {coeffs:['1','3'],type:'<=',rhs:'200'},
    {coeffs:['2','2'],type:'<=',rhs:'300'},
    {coeffs:['0','1'],type:'<=',rhs:'60'}
  ]
});
const r = s.solve();
console.log('=== Example 1: Word Light ===');
console.log('Status:', r.status);
console.log('Z:', r.solution.z.toString(), 'X1:', r.solution.variables.X1.toString(), 'X2:', r.solution.variables.X2.toString());
console.log('Iterations:', r.iterations.length);
r.iterations.forEach(it => {
  const row0 = it.tableau[0].map(v=>v.toString());
  console.log('Iter'+it.iteration+': Row0=['+row0+'] BV=['+it.basicVars+'] opt='+it.isOptimal);
});
console.log('\n=== Example 2 ===');
const s2 = new SimplexSolver({
  type:'max', numVars:2, objective:['60','30'],
  constraints:[
    {coeffs:['1','0'],type:'<=',rhs:'5'},
    {coeffs:['0','1'],type:'<=',rhs:'4'},
    {coeffs:['6','8'],type:'<=',rhs:'48'}
  ]
});
const r2 = s2.solve();
console.log('Status:', r2.status);
console.log('Z:', r2.solution.z.toString(), 'X1:', r2.solution.variables.X1.toString(), 'X2:', r2.solution.variables.X2.toString());
