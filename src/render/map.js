import './city.js';

const app = window.PhantomApp;
const { state, el, clamp } = app;
const curvatureAt = (...args) => app.curvatureAt(...args);

  /* ============================================================================
     MAP (navigation) rendering
     ============================================================================ */
  let mapCtx = null;
  function drawMap() {
    if (!el.mapCanvas) return;
    if (!mapCtx) mapCtx = el.mapCanvas.getContext("2d");
    const c = el.mapCanvas, dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rw = c.clientWidth || 300, rh = c.clientHeight || 380;
    if (c.width !== rw * dpr) { c.width = rw * dpr; c.height = rh * dpr; mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    const g = mapCtx;
    g.clearRect(0, 0, rw, rh);
    g.fillStyle = "#0a121b"; g.fillRect(0, 0, rw, rh);
    // grid
    g.strokeStyle = "rgba(255,255,255,0.05)"; g.lineWidth = 1;
    for (let x = 0; x < rw; x += 36) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, rh); g.stroke(); }
    for (let y = 0; y < rh; y += 36) { g.beginPath(); g.moveTo(0, y); g.lineTo(rw, y); g.stroke(); }
    // some district blocks
    g.fillStyle = "rgba(47,121,174,0.10)";
    g.fillRect(rw * 0.08, rh * 0.1, rw * 0.3, rh * 0.22);
    g.fillRect(rw * 0.55, rh * 0.6, rw * 0.32, rh * 0.26);

    // route polyline derived from the corner list
    const total = state.route.active ? state.route.totalM : 6000;
    const pts = [];
    const N = 60;
    let heading = 0, x = rw * 0.2, y = rh * 0.85;
    let lateral = 0;
    for (let i = 0; i <= N; i++) {
      const d = (i / N) * total;
      const k = curvatureAt(d);
      heading += k * (total / N) * 0.5;
      x += Math.cos(-Math.PI / 2 + heading) * (rw * 0.6 / N);
      y += Math.sin(-Math.PI / 2 + heading) * (rh * 0.7 / N);
      pts.push({ x, y });
    }
    // draw route
    g.strokeStyle = state.route.active ? "rgba(236,211,152,0.9)" : "rgba(120,130,140,0.5)";
    g.lineWidth = 4; g.lineCap = "round";
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke();

    // destination flag
    if (state.route.active) {
      const dp = pts[pts.length - 1];
      g.fillStyle = "#6cd49a"; g.beginPath(); g.arc(dp.x, dp.y, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#06210f"; g.font = "10px sans-serif"; g.textAlign = "center";
      g.fillText("◆", dp.x, dp.y + 3);
      g.fillStyle = "rgba(244,239,226,0.9)"; g.font = "11px sans-serif";
      g.fillText(state.route.name, dp.x, dp.y - 12);
    }

    // car position along the route
    const prog = state.route.active ? clamp(1 - state.route.remainingM / Math.max(1, total), 0, 1) : (state.distanceM % 6000) / 6000;
    const idx = clamp(Math.floor(prog * N), 0, N);
    const cp = pts[idx];
    g.fillStyle = "#f4efe2"; g.strokeStyle = "#c9a85f"; g.lineWidth = 3;
    g.beginPath(); g.arc(cp.x, cp.y, 7, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "rgba(236,211,152,0.25)"; g.beginPath(); g.arc(cp.x, cp.y, 14, 0, Math.PI * 2); g.fill();
  }


app.drawMap = drawMap;
