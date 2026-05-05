const fs = require('fs');
const code = fs.readFileSync('simplex.js', 'utf8') + `
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
console.log('\\n=== Example 2 ===');
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
`;
require('fs').writeFileSync('_test_combined.js', code);
