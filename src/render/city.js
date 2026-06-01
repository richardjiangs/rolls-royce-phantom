import '../vehicle/physics.js';

const app = window.PhantomApp;
const { state, canvas, ctx, clamp, lerp } = app;
const curvatureAt = (...args) => app.curvatureAt(...args);

  /* ============================================================================
     RENDERING — the driving view
     ============================================================================ */
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resizeCanvas);

  // perspective helpers
  const FOCAL = 380;
  const CAM_H = 1.6;
  let horizonY = 0;

  function envColors() {
    const env = state.route.active ? state.route.env : "avenue";
    const day = state.dayPhase;
    const night = state.nightVision || day > 0.82;
    const palettes = {
      avenue:  { road: "#22262c", grass: "#1d2a1f", far: "#2a3640" },
      city:    { road: "#23252b", grass: "#23262b", far: "#2b333d" },
      coast:   { road: "#23272d", grass: "#1c3a3a", far: "#244a55" },
      highway: { road: "#212429", grass: "#23301f", far: "#2a3640" },
      palace:  { road: "#2a2722", grass: "#243018", far: "#3a3a44" }
    };
    return { env, night, ...palettes[env] };
  }

  /* The road is a path in the ground plane. We sample its centreline around the car
     (behind and ahead), then project every world point through a camera that yaws with
     the car's heading. Because the camera can face any direction, the car can corner
     hard and even turn all the way around (a U-turn). */
  const ROAD = { AHEAD: 240, BEHIND: 96, STEP: 4, samples: [] };
  function rebuildRoadTable() {
    const s0 = state.distanceM, STEP = ROAD.STEP, arr = [];
    let psi = 0, X = 0, Z = 0;
    const back = [];
    for (let d = -STEP; d >= -ROAD.BEHIND; d -= STEP) {
      const k = curvatureAt(s0 + d + STEP / 2);
      psi -= k * STEP; X -= Math.sin(psi) * STEP; Z -= Math.cos(psi) * STEP;
      back.push({ off: d, X, Z, psi });
    }
    for (let i = back.length - 1; i >= 0; i--) arr.push(back[i]);
    arr.push({ off: 0, X: 0, Z: 0, psi: 0 });
    psi = 0; X = 0; Z = 0;
    for (let d = STEP; d <= ROAD.AHEAD; d += STEP) {
      const k = curvatureAt(s0 + d - STEP / 2);
      psi += k * STEP; X += Math.sin(psi) * STEP; Z += Math.cos(psi) * STEP;
      arr.push({ off: d, X, Z, psi });
    }
    ROAD.samples = arr;
  }
  function centerlineAt(off) {
    const t = ROAD.samples;
    if (!t.length) return { X: 0, Z: Math.max(0.1, off), psi: 0 };
    const first = t[0], last = t[t.length - 1];
    if (off <= first.off) { const e = off - first.off; return { X: first.X + Math.sin(first.psi) * e, Z: first.Z + Math.cos(first.psi) * e, psi: first.psi }; }
    if (off >= last.off) { const e = off - last.off; return { X: last.X + Math.sin(last.psi) * e, Z: last.Z + Math.cos(last.psi) * e, psi: last.psi }; }
    const idx = (off - first.off) / ROAD.STEP;
    const i0 = Math.floor(idx), i1 = Math.min(t.length - 1, i0 + 1), f = idx - i0;
    const a = t[i0], b = t[i1];
    return { X: lerp(a.X, b.X, f), Z: lerp(a.Z, b.Z, f), psi: lerp(a.psi, b.psi, f) };
  }
  // project a point given in the road frame (X lateral, Z forward) through the car camera
  function projectRoad(Xr, Zr) {
    const phi = state.headingRel, n0 = state.laneOffset;
    const dX = Xr - n0, dZ = Zr;
    const fwd = dX * Math.sin(phi) + dZ * Math.cos(phi);
    const rgt = dX * Math.cos(phi) - dZ * Math.sin(phi);
    if (fwd <= 0.12) return { x: innerWidth / 2, y: horizonY, scale: -1, fwd };  // near plane
    const scale = FOCAL / fwd;
    return { x: innerWidth / 2 + rgt * scale, y: horizonY + CAM_H * scale, scale, fwd };
  }
  // compatibility entry point used by every draw routine: a point distAhead along the
  // road, lateralM to the side of the centreline.
  function projectAhead(distAhead, lateralM) {
    const c = centerlineAt(distAhead);
    const nx = Math.cos(c.psi), nz = -Math.sin(c.psi);   // road right-normal
    return projectRoad(c.X + (lateralM || 0) * nx, c.Z + (lateralM || 0) * nz);
  }

  function drawCity() {
    const w = innerWidth, h = innerHeight;
    horizonY = h * 0.46;
    const pal = envColors();
    rebuildRoadTable();

    ctx.save();
    // screen shake (Sport) applied to the world
    ctx.translate(w / 2 + state.shake.x, h / 2 + state.shake.y);
    ctx.rotate(state.shake.rot);
    ctx.translate(-w / 2, -h / 2);

    drawSky(w, h, pal);
    drawScenery(w, h, pal);
    drawRoad(w, h, pal);
    drawRoadside(w, h, pal);
    drawTraffic(w, h, pal);
    if (state.route.active && state.route.env === "palace") drawPalace(w, h);
    drawCabinFrame(w, h, pal);
    if (pal.night) drawHeadlights(w, h);
    if (state.nightVision) drawNightVision(w, h);
    if (state.hazards && state.blinkOn) { ctx.fillStyle = "rgba(255,200,90,0.10)"; ctx.fillRect(0, horizonY, w, h - horizonY); }

    ctx.restore();
  }

  function drawSky(w, h, pal) {
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
    if (pal.night) {
      sky.addColorStop(0, "#05101f"); sky.addColorStop(0.6, "#0a1622"); sky.addColorStop(1, "#0d1a22");
    } else {
      const dusk = state.dayPhase > 0.66;
      sky.addColorStop(0, dusk ? "#39506e" : "#7fb1d6");
      sky.addColorStop(0.55, dusk ? "#9c6f5a" : "#bcd0da");
      sky.addColorStop(1, dusk ? "#caa07e" : "#dfe6e6");
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizonY + 40);

    // sun / moon
    ctx.fillStyle = pal.night ? "rgba(220,228,240,0.85)" : "rgba(255,244,210,0.9)";
    ctx.beginPath(); ctx.arc(w * 0.7, horizonY * 0.4, pal.night ? 16 : 26, 0, Math.PI * 2); ctx.fill();
    if (pal.night) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (let i = 0; i < 40; i++) {
        const sx = (i * 137.5) % w, sy = (i * 53.3) % (horizonY * 0.8);
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }
    }
  }

  function drawScenery(w, h, pal) {
    // distant skyline / hills that follow the road bend
    ctx.save();
    for (const b of state.buildings) {
      let z = ((b.z - state.distanceM * 0.5) % 3000 + 3000) % 3000;
      if (z < 6) continue;
      const p = projectAhead(z + 30, b.side * (18 + z * 0.05));
      const scale = p.scale;
      if (scale < 0.12 || scale > 6) continue;
      const bw = b.width * scale * 0.5;
      const bh = b.height * scale * 0.5;
      const x = p.x, y = horizonY - bh;
      if (state.route.active && (state.route.env === "coast")) {
        // low seafront — skip tall towers
        if (b.height > 160) continue;
      }
      ctx.fillStyle = pal.night ? `hsl(${b.hue},18%,${b.lit ? 17 : 11}%)` : `hsl(${b.hue},16%,${b.lit ? 60 : 48}%)`;
      ctx.fillRect(x - bw / 2, y, bw, bh + 2);
      // windows
      ctx.fillStyle = b.lit && pal.night ? "rgba(240,213,142,0.5)" : "rgba(255,255,255,0.10)";
      const sx = Math.max(4, bw / 4), sy = Math.max(5, 12 * scale);
      for (let wx = x - bw / 2 + 3; wx < x + bw / 2 - 3; wx += sx)
        for (let wy = y + 5; wy < horizonY - 3; wy += sy)
          if ((Math.floor(wx + wy + b.z) % 3) !== 0) ctx.fillRect(wx, wy, Math.max(1.5, sx * 0.4), Math.max(1.5, sy * 0.4));
    }
    ctx.restore();
  }

  const HALF_ROAD = 6.0; // metres half-width (two lanes each way-ish)
  // Offsets along the road to draw, sampled DENSELY right around the camera so the tarmac
  // fills the foreground (no grass gap between the car and the road), then coarser into the
  // distance. Spans behind the car too, so a U-turn still shows the road you came from.
  const ROAD_OFFS = (function () {
    const o = [];
    for (let d = -80; d < -6; d += 8) o.push(d);
    for (let d = -6; d < 6; d += 0.6) o.push(d);     // dense through the camera plane
    for (let d = 6; d < 32; d += 2.4) o.push(d);
    for (let d = 32; d <= 240; d += 6) o.push(d);
    return o;
  })();

  // a road-frame point -> camera coords {rgt, fwd} (forward distance, lateral). We work in
  // these coords so we can clip against the near plane before projecting (no foreground gaps).
  const NEAR_PLANE = 0.15;
  function roadCorner(Xr, Zr) {
    const phi = state.headingRel, n0 = state.laneOffset;
    const dX = Xr - n0, dZ = Zr;
    return { rgt: dX * Math.cos(phi) - dZ * Math.sin(phi), fwd: dX * Math.sin(phi) + dZ * Math.cos(phi) };
  }
  function projPoint(p) { const s = FOCAL / p.fwd; return { x: innerWidth / 2 + p.rgt * s, y: horizonY + CAM_H * s }; }

  function drawRoad(w, h, pal) {
    const HALF = HALF_ROAD;
    // ground (grass) fills everything below the horizon
    ctx.fillStyle = pal.grass;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // tarmac: fill the strip between adjacent road cross-sections, clipped to the near plane
    const rg = ctx.createLinearGradient(0, horizonY, 0, h);
    rg.addColorStop(0, pal.road);
    rg.addColorStop(1, pal.night ? "#15181d" : "#2c3036");
    ctx.fillStyle = rg;
    let prevL = null, prevR = null;
    for (let i = 0; i < ROAD_OFFS.length; i++) {
      const c = centerlineAt(ROAD_OFFS[i]);
      const cs = Math.cos(c.psi), sn = Math.sin(c.psi);          // right-normal = (cos, -sin)
      const L = roadCorner(c.X - HALF * cs, c.Z + HALF * sn);
      const R = roadCorner(c.X + HALF * cs, c.Z - HALF * sn);
      if (prevL) fillClippedQuad([prevL, prevR, R, L]);
      prevL = L; prevR = R;
    }

    // edge lines (solid) + centre & lane dashes (scrolling by world distance)
    ctx.strokeStyle = "rgba(236,228,210,0.5)";
    drawRoadLine(-HALF + 0.25, false, 2);
    drawRoadLine(HALF - 0.25, false, 2);
    ctx.strokeStyle = "rgba(245,240,225,0.7)"; drawRoadLine(0, true, 2.2);
    ctx.strokeStyle = "rgba(245,235,210,0.45)"; drawRoadLine(-HALF / 2, true, 1.8); drawRoadLine(HALF / 2, true, 1.8);
  }

  // Sutherland-Hodgman clip of a quad (corners in {rgt,fwd}) against fwd >= NEAR_PLANE, then fill.
  function fillClippedQuad(poly) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i], nxt = poly[(i + 1) % poly.length];
      const curIn = cur.fwd >= NEAR_PLANE, nxtIn = nxt.fwd >= NEAR_PLANE;
      if (curIn) out.push(cur);
      if (curIn !== nxtIn) {
        const t = (NEAR_PLANE - cur.fwd) / (nxt.fwd - cur.fwd);
        out.push({ rgt: cur.rgt + (nxt.rgt - cur.rgt) * t, fwd: NEAR_PLANE });
      }
    }
    if (out.length < 3) return;
    ctx.beginPath();
    for (let i = 0; i < out.length; i++) { const p = projPoint(out[i]); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
    ctx.closePath(); ctx.fill();
  }

  function drawRoadLine(lateralM, dashed, width) {
    let prev = null;
    for (let i = 0; i < ROAD_OFFS.length; i++) {
      const off = ROAD_OFFS[i];
      const c = centerlineAt(off);
      const pc = roadCorner(c.X + lateralM * Math.cos(c.psi), c.Z - lateralM * Math.sin(c.psi));
      if (prev) {
        const onDash = !dashed || ((((state.distanceM + ROAD_OFFS[i - 1]) % 12) + 12) % 12) < 6;
        if (onDash && (prev.fwd >= NEAR_PLANE || pc.fwd >= NEAR_PLANE)) {
          let a = prev, b = pc;
          if (a.fwd < NEAR_PLANE) { const t = (NEAR_PLANE - a.fwd) / (b.fwd - a.fwd); a = { rgt: a.rgt + (b.rgt - a.rgt) * t, fwd: NEAR_PLANE }; }
          else if (b.fwd < NEAR_PLANE) { const t = (NEAR_PLANE - a.fwd) / (b.fwd - a.fwd); b = { rgt: a.rgt + (b.rgt - a.rgt) * t, fwd: NEAR_PLANE }; }
          const pa = projPoint(a), pb = projPoint(b);
          ctx.lineWidth = clamp(width * (FOCAL / Math.max(a.fwd, b.fwd)) * 0.5, 1, 14);
          ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        }
      }
      prev = pc;
    }
  }

  function drawRoadside(w, h, pal) {
    const env = state.route.active ? state.route.env : "avenue";
    for (const r of state.roadside) {
      let z = ((r.z - state.distanceM) % 240 + 240) % 240;
      if (z < 7 || z > 220) continue;                 // skip objects beside/behind the camera
      const lateral = r.side * 8.6;
      const p = projectAhead(z, lateral);
      const sc = Math.min(p.scale, 3.0);               // cap so near objects never explode
      if (p.scale < 0.18 || p.x < -120 || p.x > w + 120) continue;
      if (env === "coast" && r.side === 1) {
        // sea on the right
        continue;
      }
      if (env === "highway") {
        // guardrail posts + lamp
        ctx.fillStyle = "rgba(180,185,190,0.7)";
        ctx.fillRect(p.x - 1.2 * sc, p.y - 14 * sc, 2.4 * sc, 14 * sc);
      } else if (env === "palace") {
        // ornate lamp posts / clipped hedges
        ctx.fillStyle = pal.night ? "#1a2410" : "#2c3a1a";
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 7 * sc, 6 * sc, 9 * sc, 0, 0, Math.PI * 2); ctx.fill();
      } else if (r.kind > 0.5) {
        // street tree
        ctx.fillStyle = pal.night ? "#15240f" : "#2c5226";
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 17 * sc, 7 * sc, 12 * sc, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#3a2a18"; ctx.fillRect(p.x - 1.3 * sc, p.y - 8 * sc, 2.6 * sc, 8 * sc);
      } else {
        // lamp post
        ctx.strokeStyle = "rgba(150,155,160,0.7)"; ctx.lineWidth = Math.max(1, 2 * sc);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 34 * sc); ctx.stroke();
        ctx.fillStyle = pal.night ? "rgba(255,224,150,0.9)" : "rgba(200,205,210,0.8)";
        ctx.beginPath(); ctx.arc(p.x, p.y - 34 * sc, 3 * sc, 0, Math.PI * 2); ctx.fill();
        if (pal.night) { const g = ctx.createRadialGradient(p.x, p.y - 34 * sc, 0, p.x, p.y - 34 * sc, 40 * sc); g.addColorStop(0, "rgba(255,224,150,0.25)"); g.addColorStop(1, "rgba(255,224,150,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y - 34 * sc, 40 * sc, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    if (env === "coast") {
      // sea band on the right
      const seaTop = horizonY;
      const g = ctx.createLinearGradient(0, seaTop, 0, h);
      g.addColorStop(0, pal.night ? "#0d2733" : "#2f6f86");
      g.addColorStop(1, pal.night ? "#08161d" : "#1c4a5c");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(w, seaTop); ctx.lineTo(w, h);
      const p0 = projectAhead(2, 7); const p1 = projectAhead(240, 7);
      ctx.lineTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawTraffic(w, h, pal) {
    // sort far-to-near
    const list = state.traffic.slice().sort((a, b) => b.z - a.z);
    for (const car of list) {
      // relative motion
      const rel = car.oncoming ? -(state.speedMps + car.speed) : (car.speed - state.speedMps);
      car.z += rel * 0.016;
      if (car.z < 3) car.z += 1600;
      if (car.z > 1600) car.z -= 1600;
      const lateral = car.lane * 3.0 + (car.oncoming ? -3.4 : 0);
      const p = projectAhead(car.z, lateral);
      if (p.scale < 0.12 || p.scale > 7) continue;
      const sc = p.scale;
      const cw = 4.6 * sc, ch = 3.2 * sc;
      ctx.save();
      ctx.translate(p.x, p.y);
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath(); ctx.ellipse(0, 0, cw * 0.6, ch * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      // body
      const lum = pal.night ? 30 : 52;
      ctx.fillStyle = `hsl(${car.hue},35%,${lum}%)`;
      roundRect(ctx, -cw / 2, -ch, cw, ch * 0.78, Math.max(2, 4 * sc));
      ctx.fill();
      // greenhouse
      ctx.fillStyle = pal.night ? "rgba(120,150,170,0.5)" : "rgba(190,210,225,0.75)";
      roundRect(ctx, -cw * 0.32, -ch, cw * 0.64, ch * 0.34, 2 * sc); ctx.fill();
      // lights
      if (car.oncoming) {
        ctx.fillStyle = pal.night ? "rgba(255,250,210,0.95)" : "rgba(255,250,220,0.6)";
        ctx.fillRect(-cw * 0.42, -ch * 0.5, cw * 0.16, ch * 0.16);
        ctx.fillRect(cw * 0.26, -ch * 0.5, cw * 0.16, ch * 0.16);
      } else {
        ctx.fillStyle = "rgba(255,70,70,0.9)";
        ctx.fillRect(-cw * 0.44, -ch * 0.55, cw * 0.14, ch * 0.14);
        ctx.fillRect(cw * 0.30, -ch * 0.55, cw * 0.14, ch * 0.14);
      }
      ctx.restore();
    }
  }

  function drawPalace(w, h) {
    const rem = state.route.remainingM;
    if (rem > 320) return;
    const p = projectAhead(Math.max(6, rem), 0);
    if (p.fwd <= 1) return;                   // don't draw it when we've turned away
    const sc = clamp(p.scale, 0.2, 4);
    const cx = p.x, baseY = p.y;
    const bw = 120 * sc, bh = 70 * sc;
    ctx.save();
    // main white facade
    ctx.fillStyle = "#eae6da";
    ctx.fillRect(cx - bw / 2, baseY - bh, bw, bh);
    // wings
    ctx.fillStyle = "#ded9cc";
    ctx.fillRect(cx - bw * 0.85, baseY - bh * 0.7, bw * 0.34, bh * 0.7);
    ctx.fillRect(cx + bw * 0.51, baseY - bh * 0.7, bw * 0.34, bh * 0.7);
    // central dome
    ctx.fillStyle = "#d8d2c2";
    ctx.beginPath(); ctx.arc(cx, baseY - bh, bw * 0.18, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#c9a85f";
    ctx.fillRect(cx - 1.5 * sc, baseY - bh - bw * 0.26, 3 * sc, bw * 0.08);
    // columns
    ctx.fillStyle = "#cfc9ba";
    for (let i = -3; i <= 3; i++) ctx.fillRect(cx + i * bw * 0.1 - 1.5 * sc, baseY - bh * 0.7, 3 * sc, bh * 0.7);
    // windows glow at night
    if (envColors().night) {
      ctx.fillStyle = "rgba(255,224,150,0.7)";
      for (let i = -3; i <= 3; i++) ctx.fillRect(cx + i * bw * 0.12 - 2 * sc, baseY - bh * 0.5, 4 * sc, 8 * sc);
    }
    // gates near arrival
    if (rem < 60) {
      ctx.strokeStyle = "#b9962f"; ctx.lineWidth = 2 * sc;
      const gx = projectAhead(Math.max(4, rem), 7);
      const gx2 = projectAhead(Math.max(4, rem), -7);
      ctx.strokeRect(gx2.x, gx2.y - 30 * sc, 4 * sc, 30 * sc);
      ctx.strokeRect(gx.x - 4 * sc, gx.y - 30 * sc, 4 * sc, 30 * sc);
    }
    ctx.restore();
  }

  /* first-person cabin frame drawn over the road */
  function drawCabinFrame(w, h, pal) {
    const sway = state.bodyRoll * 1.4;
    // A-pillars + roof line (windshield frame)
    ctx.fillStyle = pal.night ? "#0b0d10" : "#14171c";
    // left pillar
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(w * 0.16, 0); ctx.lineTo(w * 0.07, h * 0.66); ctx.lineTo(0, h * 0.7); ctx.closePath(); ctx.fill();
    // right pillar
    ctx.beginPath();
    ctx.moveTo(w, 0); ctx.lineTo(w * 0.84, 0); ctx.lineTo(w * 0.93, h * 0.66); ctx.lineTo(w, h * 0.7); ctx.closePath(); ctx.fill();
    // header / roof
    ctx.fillStyle = pal.night ? "#0a0c0f" : "#101317";
    ctx.fillRect(0, 0, w, h * 0.06);
    // rear-view mirror
    ctx.fillStyle = "#0d0f12";
    roundRect(ctx, w / 2 - 60, h * 0.055, 120, 22, 8); ctx.fill();
    ctx.fillStyle = "rgba(120,140,160,0.25)"; roundRect(ctx, w / 2 - 55, h * 0.06, 110, 14, 6); ctx.fill();

    // hood (bonnet) — long, body-coloured, receding to the Spirit of Ecstasy
    const hoodTopY = h * 0.70 + sway * 0.2;
    const hoodGrad = ctx.createLinearGradient(0, hoodTopY, 0, h);
    if (pal.night) { hoodGrad.addColorStop(0, "#cdd2da"); hoodGrad.addColorStop(1, "#9aa0aa"); }
    else { hoodGrad.addColorStop(0, "#f4f1e9"); hoodGrad.addColorStop(0.5, "#e6e2d6"); hoodGrad.addColorStop(1, "#c9c5ba"); }
    ctx.fillStyle = hoodGrad;
    ctx.beginPath();
    ctx.moveTo(w * 0.30 + sway, hoodTopY);
    ctx.lineTo(w * 0.70 + sway, hoodTopY);
    ctx.lineTo(w * 0.96 + sway, h);
    ctx.lineTo(w * 0.04 + sway, h);
    ctx.closePath(); ctx.fill();
    // centre crease + chrome strip
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w / 2 + sway, hoodTopY); ctx.lineTo(w / 2 + sway, h); ctx.stroke();
    // Spirit of Ecstasy at the leading edge
    if (state.spiritUp) {
      ctx.save();
      ctx.translate(w / 2 + sway, hoodTopY);
      ctx.fillStyle = pal.night ? "rgba(225,230,240,0.95)" : "rgba(214,214,214,0.98)";
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(-5, -16); ctx.lineTo(-1, -20); ctx.lineTo(1, -20); ctx.lineTo(5, -16); ctx.closePath(); ctx.fill();
      // wings
      ctx.beginPath(); ctx.moveTo(-1, -14); ctx.lineTo(-12, -22); ctx.lineTo(-2, -10); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(1, -14); ctx.lineTo(12, -22); ctx.lineTo(2, -10); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // dashboard cowl strip + wood
    ctx.fillStyle = pal.night ? "#0c0e11" : "#15181c";
    ctx.fillRect(0, hoodTopY - 16, w, 18);

    // steering wheel at the bottom centre, turning with steer
    drawSteeringWheel(w, h);
  }

  function drawSteeringWheel(w, h) {
    const cx = w / 2 + state.shake.x * 0.3, cy = h * 1.16;
    const R = Math.min(w, h) * 0.34;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.steer * 0.9);
    // rim
    ctx.lineWidth = R * 0.12;
    ctx.strokeStyle = "#15181d";
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = R * 0.05;
    ctx.strokeStyle = "rgba(60,66,74,0.9)";
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
    // spokes
    ctx.strokeStyle = "#1b1f25"; ctx.lineWidth = R * 0.08;
    [-1, 1].forEach(s => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * R * 0.92, R * 0.18); ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -R * 0.92); ctx.stroke();
    // hub + RR
    ctx.fillStyle = "#0a0c10"; ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(236,211,152,0.7)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#ecd398"; ctx.font = `700 ${Math.round(R * 0.18)}px Georgia, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("RR", 0, 0);
    ctx.restore();
  }

  function drawHeadlights(w, h) {
    const g = ctx.createRadialGradient(w / 2, horizonY, 20, w / 2, h, h * 0.9);
    g.addColorStop(0, "rgba(245,245,225,0.12)");
    g.addColorStop(0.4, "rgba(220,225,210,0.06)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.fillStyle = g; ctx.fillRect(0, horizonY - 30, w, h); ctx.restore();
  }

  function drawNightVision(w, h) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = "rgba(104,211,145,0.06)"; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(104,211,145,0.32)"; ctx.lineWidth = 1;
    ctx.strokeRect(w * 0.32, h * 0.28, w * 0.36, h * 0.34);
    ctx.fillStyle = "rgba(104,211,145,0.85)"; ctx.font = "12px ui-monospace, monospace";
    ctx.fillText("NIGHT VISION · PEDESTRIAN WATCH", w * 0.32 + 8, h * 0.28 - 6);
    // a detected pedestrian marker
    if (Math.sin(state.time * 0.7) > 0.4) {
      ctx.strokeStyle = "rgba(255,200,90,0.9)";
      ctx.strokeRect(w * 0.52, h * 0.5, 26, 40);
    }
    ctx.restore();
  }

  function roundRect(c, x, y, ww, hh, r) {
    r = Math.min(r, ww / 2, hh / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + ww, y, x + ww, y + hh, r);
    c.arcTo(x + ww, y + hh, x, y + hh, r);
    c.arcTo(x, y + hh, x, y, r);
    c.arcTo(x, y, x + ww, y, r);
    c.closePath();
  }


Object.assign(app, {
  resizeCanvas,
  envColors,
  rebuildRoadTable,
  centerlineAt,
  projectRoad,
  projectAhead,
  drawCity,
  drawSky,
  drawScenery,
  drawRoad,
  fillClippedQuad,
  drawRoadLine,
  drawRoadside,
  drawTraffic,
  drawPalace,
  drawCabinFrame,
  drawSteeringWheel,
  drawHeadlights,
  drawNightVision,
  roundRect
});
