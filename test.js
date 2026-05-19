// ============================================================
// test.js — Suite de Pruebas para SimplexSolver
// Ejecutar con: node _test_combined.js
// ============================================================

// --- Test Runner ---
let testsPassed = 0;
let testsFailed = 0;
const testResults = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Aserción fallida: ${message}`);
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
    console.log(`  ✅ ${name}`);
  } catch (e) {
    testsFailed++;
    testResults.push({ name, status: 'FAIL', error: e.message });
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

// ============================================================
// TESTS
// ============================================================

console.log('\n====================================');
console.log('  Suite de Pruebas — Solver PL');
console.log('====================================\n');

// --- Test 1: Ejemplo Word Light (Max estándar con <=) ---
runTest('1. Word Light — Max estándar con <=', () => {
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
  assertEq(r.metadata.method, 'Simplex Estándar', 'Método');
});

// --- Test 2: Ejemplo Producción (Max estándar con <=) ---
runTest('2. Producción — Max estándar con <=', () => {
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

// --- Test 3: Big-M con restricción >= ---
runTest('3. Big-M — Con restricción >=', () => {
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
  assertEq(r.metadata.method, 'Big-M', 'Método');
  // La solución debe ser factible: Z > 0
  assert(r.solution.z.isPos(), 'Z debe ser positivo');
  // Verificar que X1 + X2 >= 2 (restricción >=)
  const x1 = r.solution.variables.X1.toDecimal();
  const x2 = r.solution.variables.X2.toDecimal();
  assert(x1 + x2 >= 2 - 0.001, `X1+X2=${x1 + x2} debe ser >= 2`);
});

// --- Test 4: Big-M con restricción = y minimización ---
runTest('4. Minimización con restricciones >= y =', () => {
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
  // La solución debe ser factible
  assert(r.solution.z !== null, 'Z no debe ser null');
  const x1 = r.solution.variables.X1.toDecimal();
  const x2 = r.solution.variables.X2.toDecimal();
  // Verificar restricciones
  assert(x1 + x2 >= 4 - 0.001, `R1: X1+X2=${x1 + x2} >= 4`);
  assert(x1 + 3 * x2 >= 6 - 0.001, `R2: X1+3X2=${x1 + 3 * x2} >= 6`);
  assert(x1 <= 5 + 0.001, `R3: X1=${x1} <= 5`);
});

// --- Test 5: Restricción de igualdad ---
runTest('5. Con restricción de igualdad (=)', () => {
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

// --- Test 8: Múltiples Óptimos ---
runTest('8. Múltiples Óptimos', () => {
  const s = new SimplexSolver({
    type: 'max', numVars: 2, objective: ['2', '4'],
    constraints: [
      { coeffs: ['1', '2'], type: '<=', rhs: '10' },
      { coeffs: ['1', '1'], type: '<=', rhs: '8' },
      { coeffs: ['1', '0'], type: '<=', rhs: '6' }
    ]
  });
  const r = s.solve();
  // La función objetivo es paralela a una restricción => múltiples óptimos
  assertEq(r.status, 'multiple', 'Status debe ser multiple');
  assertFracEq(r.solution.z, '20', 'Z óptimo');
});

// --- Test 9: Minimización estándar ---
runTest('9. Minimización estándar con <=', () => {
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
  assertFracEq(r.solution.z, '0', 'Z mínimo');
  assertFracEq(r.solution.variables.X1, '0', 'X1');
  assertFracEq(r.solution.variables.X2, '0', 'X2');
});

// --- Test 10: Degeneración ---
runTest('10. Detección de Degeneración', () => {
  // Problema con degeneración: 3 restricciones se cruzan en un punto
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
  assertEq(r.metadata.isDegenerado, true, 'Debe detectar degeneración');
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
  assert(r.metadata.numIterations > 0, 'Debe tener >= 1 iteración');
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
      `Iteración ${idx} debe tener isDegenerado (booleano)`);
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
