// ============================================================
// graph.js — Método Gráfico para problemas con 2 variables
// ============================================================

const GRAPH_COLORS = [
  '#6366f1', '#f59e0b', '#22c55e', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4'
];

function renderGraph(config, result) {
  const ct = document.getElementById('graph-content');

  if (config.numVars !== 2) {
    ct.innerHTML = '<div class="empty-state"><div class="empty-icon">📈</div><p>El método gráfico solo está disponible para problemas con 2 variables de decisión.</p></div>';
    return;
  }

  ct.innerHTML = `
    <div class="card">
      <div class="card-title"><div class="icon">📈</div> Método Gráfico</div>
      <canvas id="graph-canvas" width="800" height="800"></canvas>
      <div class="graph-legend" id="graph-legend"></div>
    </div>`;

  const canvas = document.getElementById('graph-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const pad = 70;

  // Parse constraints
  const constraints = config.constraints.map(c => ({
    a1: parseFloat(c.coeffs[0]) || 0,
    a2: parseFloat(c.coeffs[1]) || 0,
    type: c.type,
    b: parseFloat(c.rhs) || 0
  }));

  const c1 = parseFloat(config.objective[0]) || 0;
  const c2 = parseFloat(config.objective[1]) || 0;

  // Find axis limits
  let maxX1 = 10, maxX2 = 10;
  constraints.forEach(c => {
    if (c.a1 !== 0) maxX1 = Math.max(maxX1, (c.b / c.a1) * 1.2);
    if (c.a2 !== 0) maxX2 = Math.max(maxX2, (c.b / c.a2) * 1.2);
    if (c.a1 === 0 && c.a2 !== 0) maxX2 = Math.max(maxX2, (c.b / c.a2) * 1.3);
    if (c.a2 === 0 && c.a1 !== 0) maxX1 = Math.max(maxX1, (c.b / c.a1) * 1.3);
  });
  // Round up nicely
  maxX1 = Math.ceil(maxX1 / 10) * 10;
  maxX2 = Math.ceil(maxX2 / 10) * 10;

  function toCanvasX(x) { return pad + (x / maxX1) * (W - 2 * pad); }
  function toCanvasY(y) { return H - pad - (y / maxX2) * (H - 2 * pad); }

  // Background
  ctx.fillStyle = '#0a0a1f';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.08)';
  ctx.lineWidth = 1;
  const gridStepX = maxX1 <= 20 ? 1 : maxX1 <= 100 ? 10 : 50;
  const gridStepY = maxX2 <= 20 ? 1 : maxX2 <= 100 ? 10 : 50;
  for (let x = 0; x <= maxX1; x += gridStepX) {
    ctx.beginPath(); ctx.moveTo(toCanvasX(x), pad); ctx.lineTo(toCanvasX(x), H - pad); ctx.stroke();
  }
  for (let y = 0; y <= maxX2; y += gridStepY) {
    ctx.beginPath(); ctx.moveTo(pad, toCanvasY(y)); ctx.lineTo(W - pad, toCanvasY(y)); ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(pad, H - pad); ctx.lineTo(W - pad, H - pad); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pad, H - pad); ctx.lineTo(pad, pad); ctx.stroke();

  // Axis labels
  ctx.fillStyle = '#9495b7';
  ctx.font = '14px Inter, sans-serif';
  ctx.textAlign = 'center';
  for (let x = 0; x <= maxX1; x += gridStepX) {
    if (x === 0) continue;
    ctx.fillText(x, toCanvasX(x), H - pad + 20);
  }
  ctx.textAlign = 'right';
  for (let y = 0; y <= maxX2; y += gridStepY) {
    if (y === 0) continue;
    ctx.fillText(y, pad - 10, toCanvasY(y) + 4);
  }
  ctx.fillStyle = '#a78bfa';
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('X₁', W / 2, H - 15);
  ctx.save();
  ctx.translate(20, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('X₂', 0, 0);
  ctx.restore();

  // Find feasible region vertices using polygon clipping
  let region = [
    [0, 0], [maxX1 * 2, 0], [maxX1 * 2, maxX2 * 2], [0, maxX2 * 2]
  ];

  // Clip with X1 >= 0
  region = clipPolygon(region, 1, 0, 0, '>=');
  // Clip with X2 >= 0
  region = clipPolygon(region, 0, 1, 0, '>=');

  constraints.forEach(c => {
    region = clipPolygon(region, c.a1, c.a2, c.b, c.type);
  });

  // Draw feasible region
  if (region.length >= 3) {
    ctx.fillStyle = 'rgba(99, 102, 241, 0.12)';
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toCanvasX(region[0][0]), toCanvasY(region[0][1]));
    for (let i = 1; i < region.length; i++) {
      ctx.lineTo(toCanvasX(region[i][0]), toCanvasY(region[i][1]));
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Draw constraint lines
  const legendHtml = [];
  constraints.forEach((c, idx) => {
    const color = GRAPH_COLORS[idx % GRAPH_COLORS.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);

    const pts = getLinePoints(c.a1, c.a2, c.b, maxX1, maxX2);
    if (pts.length === 2) {
      ctx.beginPath();
      ctx.moveTo(toCanvasX(pts[0][0]), toCanvasY(pts[0][1]));
      ctx.lineTo(toCanvasX(pts[1][0]), toCanvasY(pts[1][1]));
      ctx.stroke();
    }

    const sym = c.type === '<=' ? '≤' : c.type === '>=' ? '≥' : '=';
    legendHtml.push(`<div class="legend-item"><div class="legend-color" style="background:${color};"></div>${c.a1}X₁ + ${c.a2}X₂ ${sym} ${c.b}</div>`);
  });

  // Draw feasible vertices
  const vertices = region.filter(p => p[0] >= -0.001 && p[1] >= -0.001 && p[0] <= maxX1 * 1.5 && p[1] <= maxX2 * 1.5);
  vertices.forEach(v => {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(toCanvasX(v[0]), toCanvasY(v[1]), 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    const label = `(${round2(v[0])}, ${round2(v[1])})`;
    ctx.fillText(label, toCanvasX(v[0]) + 8, toCanvasY(v[1]) - 8);
  });

  // Draw objective function iso-profit line at optimal
  if (result.solution && result.solution.z) {
    const zOpt = result.solution.z.toDecimal();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    const objPts = getLinePoints(c1, c2, zOpt, maxX1, maxX2);
    if (objPts.length === 2) {
      ctx.beginPath();
      ctx.moveTo(toCanvasX(objPts[0][0]), toCanvasY(objPts[0][1]));
      ctx.lineTo(toCanvasX(objPts[1][0]), toCanvasY(objPts[1][1]));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    legendHtml.push(`<div class="legend-item"><div class="legend-color" style="background:#fbbf24;"></div>Z = ${zOpt} (óptimo)</div>`);

    // Draw optimal point
    const x1Opt = result.solution.variables.X1.toDecimal();
    const x2Opt = result.solution.variables.X2.toDecimal();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(toCanvasX(x1Opt), toCanvasY(x2Opt), 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a0a1f';
    ctx.font = 'bold 10px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('★', toCanvasX(x1Opt), toCanvasY(x2Opt) + 4);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 13px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Óptimo (${round2(x1Opt)}, ${round2(x2Opt)})`, toCanvasX(x1Opt) + 14, toCanvasY(x2Opt) - 4);
    ctx.fillText(`Z = ${zOpt}`, toCanvasX(x1Opt) + 14, toCanvasY(x2Opt) + 14);
  }

  legendHtml.push(`<div class="legend-item"><div class="legend-color" style="background:rgba(99,102,241,0.3);"></div>Región Factible</div>`);
  document.getElementById('graph-legend').innerHTML = legendHtml.join('');
}

function round2(n) { return Math.round(n * 100) / 100; }

function getLinePoints(a1, a2, b, maxX1, maxX2) {
  const pts = [];
  if (a2 !== 0) {
    const y0 = b / a2;
    if (y0 >= 0 && y0 <= maxX2 * 2) pts.push([0, y0]);
    const yMax = (b - a1 * maxX1) / a2;
    if (yMax >= 0) pts.push([maxX1, yMax]);
  }
  if (a1 !== 0) {
    const x0 = b / a1;
    if (x0 >= 0 && x0 <= maxX1 * 2) pts.push([x0, 0]);
    if (a2 !== 0) {
      const xMax = (b - a2 * maxX2) / a1;
      if (xMax >= 0) pts.push([xMax, maxX2]);
    }
  }
  if (a1 === 0 && a2 !== 0) {
    const y = b / a2;
    pts.length = 0;
    pts.push([0, y], [maxX1, y]);
  }
  if (a2 === 0 && a1 !== 0) {
    const x = b / a1;
    pts.length = 0;
    pts.push([x, 0], [x, maxX2]);
  }
  return pts.slice(0, 2);
}

// Sutherland-Hodgman polygon clipping
function clipPolygon(polygon, a, b, c, type) {
  // Constraint: a*x1 + b*x2 (<=/>=/=) c
  if (polygon.length === 0) return polygon;
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const curr = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const currVal = a * curr[0] + b * curr[1];
    const nextVal = a * next[0] + b * next[1];

    let currInside, nextInside;
    if (type === '<=' || type === '=') {
      currInside = currVal <= c + 1e-9;
      nextInside = nextVal <= c + 1e-9;
    } else {
      currInside = currVal >= c - 1e-9;
      nextInside = nextVal >= c - 1e-9;
    }

    if (currInside && nextInside) {
      out.push(next);
    } else if (currInside && !nextInside) {
      out.push(intersect(curr, next, a, b, c));
    } else if (!currInside && nextInside) {
      out.push(intersect(curr, next, a, b, c));
      out.push(next);
    }
  }
  return out;
}

function intersect(p1, p2, a, b, c) {
  const d1 = a * p1[0] + b * p1[1] - c;
  const d2 = a * p2[0] + b * p2[1] - c;
  const t = d1 / (d1 - d2);
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}
