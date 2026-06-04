import '../audio/audio-engine.js';

const app = window.PhantomApp;
const { state, el, SPEC, DESTINATIONS, MPH, clamp, approach } = app;
const audio = app.audio;
const showToast = app.showToast;
const anyDoorOpen = () => app.anyDoorOpen();
const setGear = (...args) => app.setGear(...args);
const updateDoorArt = (...args) => app.updateDoorArt(...args);

  /* ============================================================================
     ENGINE TORQUE & TRANSMISSION
     ============================================================================ */
  function engineTorque(rpm) {
    if (rpm < 1000) return 480 + (820 - 480) * (rpm / 1000);
    if (rpm < 1700) return 820 + 80 * ((rpm - 1000) / 700);
    if (rpm <= 4200) return 900;
    const omega = rpm * Math.PI * 2 / 60;
    return clamp(SPEC.peakPowerW / omega, 360, 900);
  }

  function updateTransmission(dt) {
    if (state.shiftTimer > 0) { state.shiftTimer -= dt; return; }
    if (state.gearMode !== "D") return;

    const ratio = SPEC.gearRatios[state.autoGear - 1];
    const wheelRps = Math.abs(state.speedMps) / (2 * Math.PI * SPEC.wheelRadiusM);
    const rpm = Math.max(SPEC.idleRpm, wheelRps * ratio * SPEC.finalDrive * 60);

    // Satellite-aided hold: don't upshift into a corner (keeps the V12 ready)
    const holdForCorner = state.cameraScan && Math.abs(state.curvature) > 0.012 && state.speedMps > 9;
    // Sport map revs harder & holds lower gears; comfort short-shifts for silence
    const sport = !state.magicRide;
    const shiftUp = sport ? (state.throttle > 0.6 ? 5050 : 2600 + state.throttle * 1700)
                          : (state.throttle > 0.7 ? 4200 : 1900 + state.throttle * 1100);
    const kickdown = state.throttle > 0.82;
    const shiftDown = (sport ? 1500 : 1250) + (kickdown ? 700 : 0);

    if (!holdForCorner && rpm > shiftUp && state.autoGear < 8) {
      state.shiftFrom = state.autoGear; state.autoGear += 1; state.shiftTimer = SPEC.shiftTimeS;
    } else if (rpm < shiftDown && state.autoGear > 1) {
      state.shiftFrom = state.autoGear; state.autoGear -= 1; state.shiftTimer = SPEC.shiftTimeS;
    } else if (kickdown && rpm < 3200 && state.autoGear > 2) {
      state.shiftFrom = state.autoGear; state.autoGear -= 1; state.shiftTimer = SPEC.shiftTimeS;
    }
  }

  /* ============================================================================
     ROAD GEOMETRY & WORLD
     ============================================================================ */
  function buildCornersForRoute() {
    // Deterministic corner list across the route so the road actually turns.
    const env = state.route.env;
    const corners = [];
    const total = state.route.active ? state.route.totalM : 6000;
    let d = 180;
    let seed = (env.length * 131 + total) % 997;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const spacing = env === "highway" ? 720 : env === "coast" ? 360 : env === "palace" ? 520 : 300;
    const sharp = env === "highway" ? 0.0026 : env === "city" ? 0.0085 : env === "coast" ? 0.0065 : 0.0055;
    while (d < total + 600) {
      const dir = rnd() > 0.5 ? 1 : -1;
      corners.push({ at: d, amp: dir * (sharp * (0.55 + rnd() * 0.7)), w: 60 + rnd() * 70 });
      d += spacing * (0.7 + rnd() * 0.7);
    }
    if (env === "palace") {
      // a grand sweeping bend, then a dead-straight ceremonial avenue to the gates
      corners.length = 0;
      corners.push({ at: total * 0.32, amp: 0.0055, w: 150 });
      corners.push({ at: total * 0.55, amp: -0.0042, w: 140 });
    }
    state.corners = corners;
  }

  function curvatureAt(d) {
    let k = 0.0009 * Math.sin(d / 320) + 0.0005 * Math.sin(d / 120 + 1.3);
    for (const c of state.corners) {
      const x = (d - c.at) / c.w;
      if (x > -6 && x < 6) k += c.amp * Math.exp(-x * x);
    }
    // straighten out at the very end of a route (arrival forecourt)
    if (state.route.active) {
      const rem = state.route.remainingM;
      if (rem < 220) k *= clamp(rem / 220, 0, 1);
    }
    return k;
  }

  function seedWorld() {
    state.traffic = [];
    state.buildings = [];
    state.roadside = [];
    const trafficCount = 14;                         // lighter traffic — open stretches to hold a set speed
    for (let i = 0; i < trafficCount; i++) {
      state.traffic.push({
        lane: [-1, 0, 1][i % 3],
        z: 80 + i * 150 + Math.random() * 110,        // spread further apart
        speed: (12 + Math.random() * 16),
        hue: 200 + Math.random() * 130,
        oncoming: i % 4 === 0
      });
    }
    for (let i = 0; i < 80; i++) {
      state.buildings.push({
        side: i % 2 === 0 ? -1 : 1,
        z: i * 42 + Math.random() * 38,
        width: 32 + Math.random() * 48,
        height: 70 + Math.random() * 220,
        lit: Math.random() > 0.34,
        hue: 205 + Math.random() * 70
      });
    }
    for (let i = 0; i < 60; i++) {
      state.roadside.push({ side: i % 2 === 0 ? -1 : 1, z: i * 26 + Math.random() * 14, kind: Math.random() });
    }
  }

  /* ============================================================================
     INPUTS, CHAUFFEUR, CRUISE
     ============================================================================ */
  // Satellite-aided speed planning: read the road far ahead (out to the braking distance) and
  // return the fastest speed from which the car can still ease down in time to take the sharpest
  // corner coming up at no more than `latG` of lateral load. This is how it stays glued to the
  // road through bends at any speed — it slows BEFORE the corner, then resumes — exactly what the
  // real Phantom's satellite transmission/assist does. The car's grip is never exceeded.
  function cornerSpeedCap(latG) {
    const v = Math.abs(state.speedMps);
    const decel = 4.0;                                   // m/s^2 the planner is willing to ease at
    const aLat = latG * 9.81;
    const ahead = clamp(v * v / (2 * decel) + 50, 70, 800);
    let cap = Infinity;
    for (let d = 8; d <= ahead; d += 10) {
      const k = Math.abs(curvatureAt(state.distanceM + d));
      if (k < 0.0016) continue;                          // ignore the gentle meander; only real corners
      const vCorner = Math.sqrt(aLat / k);               // top speed that holds this corner
      const vNow = Math.sqrt(vCorner * vCorner + 2 * decel * d);   // top speed now to ease down in time
      if (vNow < cap) cap = vNow;
    }
    return cap;
  }

  function targetSpeedMps() {
    // What a good driver would do here.
    let limit;
    if (state.adaptiveCruise && !state.chauffeur) limit = clamp(state.cruiseSetMph, 5, 155) * MPH; // hold the set speed
    else if (state.route.active) limit = (DESTINATIONS[state.route.name]?.limitMph || 45) * MPH;
    else limit = 42 * MPH; // relaxed city cruise
    // Corner speed: cruise HOLDS your set speed and only sheds the minimum needed for a bend the
    // tyres genuinely could not hold at full speed — it plans to 0.72 g, near the ~0.85 g limit
    // (the lane-keep is proven to hold the road to ~0.78 g), so it barely lifts for ordinary
    // curves and never runs wide. The chauffeur plans gentler (0.58 g) for a serene ride. No car
    // can hold 155 mph through a hairpin — that is why a little easing for the sharpest bends
    // remains; everywhere else, your set speed stands.
    const cornerCap = cornerSpeedCap(state.chauffeur ? 0.58 : 0.72);
    // slow only for a car genuinely in our path; overtaking lifts this as we pull alongside
    const lead = nearestLeadVehicle();
    let trafficCap = Infinity;
    if (lead) {
      const safe = followDist();
      if (lead.gapM < safe) trafficCap = Math.max(0, lead.vMps + (lead.gapM - safe) * 0.6);
    }
    // slow to a stop as we arrive
    let arriveCap = Infinity;
    if (state.route.active) {
      const rem = state.route.remainingM;
      if (rem < 140) arriveCap = clamp((rem - 4) / 140, 0, 1) * 13;
    }
    return Math.max(0, Math.min(limit, cornerCap, trafficCap, arriveCap));
  }

  function followDist() { return clamp(Math.abs(state.speedMps) * 1.5, 22, 60); }

  // nearest car genuinely in our path — so pulling into another lane to overtake clears it
  function nearestLeadVehicle() {
    let best = null;
    for (const car of state.traffic) {
      if (car.oncoming) continue;
      if (Math.abs(car.lane * 3 - state.laneOffset) > 2.0) continue;   // roughly our trajectory
      if (car.z > 2 && (!best || car.z < best.gapM)) best = { gapM: car.z, vMps: car.speed };
    }
    return best;
  }
  // nearest car ahead in each lane (-1, 0, 1) — used to choose an overtaking line
  function laneScan() {
    const r = { "-1": { gap: Infinity, v: 99 }, "0": { gap: Infinity, v: 99 }, "1": { gap: Infinity, v: 99 } };
    for (const car of state.traffic) {
      if (car.oncoming) continue;
      const e = r[car.lane];
      if (car.z > 1 && car.z < e.gap) { e.gap = car.z; e.v = car.speed; }
    }
    return r;
  }
  // the lateral line the chauffeur/cruise should hold: stay if clear, pull out to pass a
  // slower car when a neighbouring lane has more room, and drift back to centre when free
  function chooseLaneOffset() {
    const lanes = laneScan();
    const cur = clamp(Math.round(state.laneOffset / 3), -1, 1);
    const follow = followDist();
    const spd = Math.abs(state.speedMps);
    const blocked = lanes[cur].gap < follow && lanes[cur].v < spd - 1.5;
    if (!blocked) {
      if (cur !== 0 && lanes["0"].gap > follow + 10) return 0;   // return to the centre lane
      return cur * 3;
    }
    let best = cur, bestGap = lanes[cur].gap + 12;               // hysteresis: need 12 m more room
    for (let l = -1; l <= 1; l++) {
      if (Math.abs(l - cur) > 1) continue;                       // one lane at a time
      if (lanes[String(l)].gap > bestGap) { best = l; bestGap = lanes[String(l)].gap; }
    }
    return best * 3;
  }
  function laneIndex() { return clamp(Math.round(state.laneOffset / 3), -1, 1); }

  // Steering geometry shared by the physics and the driver-assist controllers.
  // Set to the real Phantom: 3.552 m wheelbase, 1.67 m front track and 35.27° of lock give
  // a 13.7 m kerb-to-kerb turning circle — the factory figure.
  const STEERING = { wheelbase: 3.552, frontTrack: 1.67, maxAngle: 0.6156, latGrip: 0.86 * 9.81 }; // ~0.85 g realised skidpad

  /* ============================================================================
     VEHICLE DYNAMICS — dynamic bicycle model · Pacejka tyres · load transfer · EPS · ESP
     The Phantom is no longer steered by a script. The wheel sets a front road-wheel angle
     through a variable-ratio EPS; the tyres build slip-angle (Magic-Formula) forces under
     real lateral load transfer and a little aero load; those forces yaw the car. High-speed
     stability, limit understeer and the ~0.85 g skidpad all fall out of the physics — and the
     car stays fully steerable at 155 mph (the old grip-clamp made it numb above ~120 mph).
     Validated against the brief: 2560 kg, 3.552 m wheelbase, ~0.85 g limit, clear understeer.
     ============================================================================ */
  const VEHICLE = {
    mass: 2560, Iz: 6200, wheelbase: 3.552,
    a: 1.72, b: 1.832,             // CG → front / rear axle  (a + b = wheelbase)
    trackF: 1.67, trackR: 1.69, cgHeight: 0.60,
    Cf: 160000, Cr: 175000,        // axle cornering-stiffness seeds (Cr > Cf reinforces understeer)
    steerRatio: 18,                // EPS steering-wheel : road-wheel  (180° wheel ≈ 10° front)
    muF: 0.88, muR: 0.96,          // the narrower 275 front gives up before the wider 315 rear → understeer
    muLoadSens: 0.10, FzRef: 6300, // tyre grip falls as vertical load rises (load sensitivity)
    aeroCLAf: 0.15, aeroCLAr: 0.15 // ½ρCₗA front/rear — small on a Phantom, but it plants 155 mph
  };
  const RHO = 1.225;
  const Wf = VEHICLE.mass * 9.81 * VEHICLE.b / VEHICLE.wheelbase;   // static front axle load (N)
  const Wr = VEHICLE.mass * 9.81 * VEHICLE.a / VEHICLE.wheelbase;   // static rear axle load (N)
  const TYRE_C = 1.4, TYRE_E = 0.97;                                // Pacejka shape / curvature
  const Bf = VEHICLE.Cf / (2 * VEHICLE.muF * VEHICLE.FzRef * TYRE_C);  // stiffness factor sized to Cf
  const Br = VEHICLE.Cr / (2 * VEHICLE.muR * VEHICLE.FzRef * TYRE_C);  // … and to Cr
  const KUS_LIN = 0.0008;          // linear understeer gradient the model actually shows (rad·s²/m)
  const KUS_NL = 0.030;            // extra understeer that builds toward the grip limit

  // One-tyre Pacejka Magic-Formula lateral force. A positive slip angle returns a negative
  // (restoring) force, matching the textbook Fy = −Cα. Grip peak D = μ(Fz)·Fz falls with load,
  // so piling weight onto the outside tyre in a hard corner LOSES total axle grip — the real
  // reason a heavy saloon washes wide at the limit.
  function tyreFy(alpha, Fz, mu0, B) {
    if (Fz <= 0) return 0;
    const mu = mu0 * (1 - VEHICLE.muLoadSens * (Fz - VEHICLE.FzRef) / VEHICLE.FzRef);
    const D = Math.max(0, mu) * Fz;
    const Ba = B * alpha;
    return -D * Math.sin(TYRE_C * Math.atan(Ba - TYRE_E * (Ba - Math.atan(Ba))));
  }

  // Variable-ratio EPS — a genuine Phantom feature. Full authority for the 13.7 m turning circle
  // at parking; the ratio relaxes with speed so the rack stays calm at a cruise. Crucially it
  // NEVER goes numb: the 0.16 floor leaves a confident lane-change in hand at 155 mph, where the
  // old grip-clamp collapsed to 0.012 — which is exactly why the car would not steer at speed.
  function steerGain(speedAbs) {
    return clamp(0.16 + 0.84 * 400 / (400 + speedAbs * speedAbs), 0.16, 1);
  }

  // Advance the lateral state (sideslip vy, yaw rate) one frame. Tyre slip angles → Pacejka
  // forces with lateral load transfer + aero load → yaw moment → integrate. Sub-stepped for
  // stability, blended to the kinematic Ackermann turn at a crawl so the tight circle and U-turns
  // still work, and overseen by a dormant ESP that nips only a genuine spin.
  function updateLateralDynamics(vx, roadWheel, dt, espOn) {
    if (state.vy === undefined) state.vy = 0;
    if (state.yawRate === undefined) state.yawRate = 0;
    const vxAbs = Math.abs(vx), vxSafe = Math.max(vxAbs, 3.0);
    const sub = 4, h = dt / sub;
    const ay0 = state.lateralG * 9.81;                 // last frame's lateral accel → load transfer
    const q = 0.5 * RHO * vxAbs * vxAbs;               // dynamic pressure for the aero load
    const azF = q * VEHICLE.aeroCLAf / 2, azR = q * VEHICLE.aeroCLAr / 2;
    let vy = state.vy, yawRate = state.yawRate, Fyf = 0, Fyr = 0;
    for (let i = 0; i < sub; i++) {
      const aF = Math.atan((vy + VEHICLE.a * yawRate) / vxSafe) - roadWheel;   // front slip angle
      const aR = Math.atan((vy - VEHICLE.b * yawRate) / vxSafe);               // rear slip angle
      const dFzF = clamp(VEHICLE.mass * ay0 * VEHICLE.cgHeight / VEHICLE.trackF * (Wf / (Wf + Wr)), -Wf * 0.49, Wf * 0.49);
      const dFzR = clamp(VEHICLE.mass * ay0 * VEHICLE.cgHeight / VEHICLE.trackR * (Wr / (Wf + Wr)), -Wr * 0.49, Wr * 0.49);
      Fyf = tyreFy(aF, Wf / 2 + azF + dFzF, VEHICLE.muF, Bf) + tyreFy(aF, Wf / 2 + azF - dFzF, VEHICLE.muF, Bf);
      Fyr = tyreFy(aR, Wr / 2 + azR + dFzR, VEHICLE.muR, Br) + tyreFy(aR, Wr / 2 + azR - dFzR, VEHICLE.muR, Br);
      let Mz = VEHICLE.a * Fyf - VEHICLE.b * Fyr;
      if (espOn && vxAbs > 8) {
        const targetYaw = vxSafe * roadWheel / (VEHICLE.wheelbase + KUS_LIN * vxSafe * vxSafe);
        const excess = yawRate - targetYaw;
        const sideslip = Math.abs(Math.atan2(vy, vxSafe));
        if (Math.abs(yawRate) > Math.abs(targetYaw) * 1.25 && Math.sign(yawRate) === Math.sign(excess) && sideslip > 0.12) {
          Mz -= excess * VEHICLE.Iz;                   // ESP: gentle brake-yaw back to the reference
        }
      }
      vy += ((Fyf + Fyr) / VEHICLE.mass - vx * yawRate) * h;
      yawRate += (Mz / VEHICLE.Iz) * h;
    }
    const ay = (Fyf + Fyr) / VEHICLE.mass;
    // blend to the kinematic turn at a crawl so the 13.7 m circle and U-turns are unaffected
    const dynBlend = clamp((vxAbs - 4) / 6, 0, 1);
    const yawKin = (vx / VEHICLE.wheelbase) * Math.tan(roadWheel);
    yawRate = yawKin + (yawRate - yawKin) * dynBlend;
    vy = (VEHICLE.b * yawRate) * (1 - dynBlend) + vy * dynBlend;
    state.vy = vy; state.yawRate = yawRate;
    return { yawRate, vy, ay };
  }

  // The normalised wheel position (−1..1) that yields a desired yaw-rate at a given speed.
  // It inverts the EPS and the steady-state understeer — and lets the understeer term grow with
  // the lateral demand — so the chauffeur, cruise and lane-keep can hold their line all the way
  // up to the grip limit (a linear inverse would wash wide above ~0.55 g).
  function steerForYaw(desiredYaw, v) {
    const vAbs = Math.max(2.2, Math.abs(v));
    const ay = desiredYaw * vAbs;                                            // implied lateral accel
    const Kus = KUS_LIN + KUS_NL * Math.min(1, (Math.abs(ay) / 8.1) ** 2);
    const roadWheel = desiredYaw * VEHICLE.wheelbase / vAbs + Kus * ay;      // Ackermann + understeer steer
    return clamp(roadWheel / (STEERING.maxAngle * steerGain(vAbs)), -1, 1);
  }
  // steer the heading to hold a target lane line (centre, or an overtaking line)
  // Lane assist that cannot overshoot: aim only as steeply toward the lane as the car can still
  // straighten out of before reaching it (a square-root law -> cross-track falls to zero
  // monotonically), and damp the heading with its own turn rate. Gentle + heavily damped, so it
  // eases onto the road and stays — never over-spins or weaves, at any speed.
  function pathSteer(gain, targetOffset) {
    const tgt = (targetOffset === undefined || targetOffset === null) ? 0 : targetOffset;
    const e = state.laneOffset - tgt;                                  // cross-track error, + = right
    const v = state.speedMps, vAbs = Math.max(3, Math.abs(v));
    const look = clamp(Math.abs(v) * 0.8, 10, 28);
    const kAhead = curvatureAt(state.distanceM + look);
    const omega = STEERING.latGrip / vAbs;                             // available (grip) turn rate
    const phiSafe = Math.min(0.45, Math.sqrt(2 * omega * Math.abs(e) / vAbs) * 0.7);  // 0.7 = safety margin
    const phiTarget = -Math.sign(e) * phiSafe;                         // aim toward the lane, only as much as is safe
    const ffYaw = kAhead * v;                                          // follow the bend
    const yawCmd = ffYaw + (phiTarget - state.headingRel) * 1.4 * (gain || 1) - (state.headingRate || 0) * 0.45;
    state.blinker = Math.abs(e) > 0.7 ? -Math.sign(e) : (Math.abs(kAhead) > 0.02 ? Math.sign(kAhead) : 0);
    return steerForYaw(yawCmd, v);
  }

  function autopilotControls(dt) {
    // Longitudinal: single demand in [-1,1]; never throttle & brake together.
    const target = targetSpeedMps();
    const err = target - state.speedMps;
    let demand = clamp(err * 0.5, -1, 1);
    if (Math.abs(err) < 0.5) demand *= 0.7;                  // ease off only right at the target
    let throttle = demand > 0 ? clamp(demand, 0, 0.9) : 0;
    let brake = demand < 0 ? clamp(-demand * 0.7, 0, 0.85) : 0;
    if (brake < 0.05) brake = 0;                            // smooth chauffeur rarely brakes
    return { throttle, brake, steerTarget: pathSteer(1, chooseLaneOffset()) };  // pass slow cars
  }

  function updateInputs(dt) {
    const keyThrottle = (state.keys.KeyW || state.keys.ArrowUp) ? 1 : 0;
    const keyBrake = (state.keys.Space || state.keys.KeyS || state.keys.ArrowDown) ? 1 : 0;
    // the scroll pedals hold their level until you move them
    const ownerThrottle = Math.max(keyThrottle, state.padThrottle || 0);
    const ownerBrake = Math.max(keyBrake, state.padBrake || 0);
    const steerInput = ((state.keys.KeyD || state.keys.ArrowRight) ? 1 : 0) - ((state.keys.KeyA || state.keys.ArrowLeft) ? 1 : 0);
    const assist = state.laneAssist && Math.abs(state.speedMps) > 5;
    const cruiseActive = state.adaptiveCruise && state.gearMode === "D" && !state.chauffeur;

    let throttleTarget, brakeTarget, steerTarget;

    if (state.chauffeur) {
      const a = autopilotControls(dt);
      throttleTarget = ownerThrottle > 0 ? ownerThrottle : a.throttle;
      brakeTarget = ownerBrake > 0 ? ownerBrake : a.brake;
      steerTarget = steerInput !== 0 ? steerInput : a.steerTarget;
    } else if (cruiseActive) {
      const a = autopilotControls(dt);            // longitudinal holds the set cruise speed
      throttleTarget = ownerThrottle > 0 ? ownerThrottle : a.throttle;
      brakeTarget = ownerBrake > 0 ? ownerBrake : a.brake;
      // cruise steers itself, passing slow cars to keep your set speed (you can override)
      steerTarget = steerInput !== 0 ? steerInput : pathSteer(1.0, chooseLaneOffset());
    } else {
      throttleTarget = ownerThrottle;
      brakeTarget = ownerBrake;
      // manual lane assist brings you back to the centre of the road when you let go, firmly
      // if you've wandered off, so you never get marooned on the grass. Off = free to roam.
      steerTarget = steerInput !== 0 ? steerInput : (assist ? pathSteer(1.1, 0) : 0);
    }

    if (steerInput !== 0) state.blinker = Math.sign(steerInput);
    else if (!(state.chauffeur || cruiseActive || assist)) state.blinker = 0;

    state.throttle = approach(state.throttle, throttleTarget, 0.0012, dt);
    state.brake = approach(state.brake, brakeTarget, 0.0016, dt);
    state.steer = approach(state.steer, clamp(steerTarget, -1, 1), 0.0006, dt);   // crisper rack
  }

  /* ============================================================================
     PHYSICS
     ============================================================================ */
  function updatePhysics(dt) {
    updateInputs(dt);
    updateTransmission(dt);

    const speedAbs = Math.abs(state.speedMps);
    let driven = false, ratio = 0, direction = 1;
    if (state.gearMode === "D") { driven = true; ratio = SPEC.gearRatios[state.autoGear - 1]; }
    else if (state.gearMode === "R") { driven = true; ratio = SPEC.reverseRatio; direction = -1; }

    const wheelRps = speedAbs / (2 * Math.PI * SPEC.wheelRadiusM);
    const converterSlip = (state.throttle > 0.05 && speedAbs < 11) ? 1.3 - speedAbs * 0.02 : 1.02;
    const rawRpm = driven ? wheelRps * ratio * SPEC.finalDrive * 60 * converterSlip
                          : SPEC.idleRpm + state.throttle * 900;
    state.rpm = approach(state.rpm, clamp(rawRpm, SPEC.idleRpm, SPEC.redlineRpm), 0.0006, dt);

    // brief, smooth torque interruption during a shift (felt only faintly)
    const shiftCut = state.shiftTimer > 0 ? (state.magicRide ? 0.55 : 0.2) : 1;
    const canMove = driven && !anyDoorOpen();
    const beltLimiter = state.beltLatched ? 1 : 0.28;        // creep only without belt
    const torqueAvail = engineTorque(state.rpm);
    state.torqueNm = canMove ? torqueAvail * state.throttle * beltLimiter * shiftCut : 0;

    const rawForce = state.torqueNm * ratio * SPEC.finalDrive * SPEC.drivelineEff / SPEC.wheelRadiusM;
    const engineForce = Math.min(rawForce, SPEC.tractionCapN) * direction;

    const drag = 0.5 * SPEC.airDensity * SPEC.dragCd * SPEC.frontalAreaM2 * state.speedMps * speedAbs;
    const roll = speedAbs > 0.05 ? SPEC.rollingResistance * SPEC.massKg * 9.81 * Math.sign(state.speedMps) : 0;
    const brakeForce = state.brake * SPEC.brakeMaxMps2 * SPEC.massKg * Math.sign(state.speedMps || direction);

    let total = engineForce - drag - roll - brakeForce;
    if (state.gearMode === "P") total += -state.speedMps * SPEC.massKg * 9;

    let accel = total / (SPEC.massKg * SPEC.rotInertia);

    // governor
    if (state.speedMps >= SPEC.topSpeedMps && accel > 0) { accel = 0; state.speedMps = SPEC.topSpeedMps; }

    state.speedMps += accel * dt;
    if (Math.abs(state.speedMps) < 0.05 && state.throttle < 0.02) state.speedMps = 0;
    if (state.gearMode !== "R" && state.speedMps < 0) state.speedMps = 0;
    if (!driven && state.speedMps > 0) state.speedMps = Math.max(0, state.speedMps - dt * 0.6);

    // --- steering & lateral dynamics: a true dynamic bicycle model. The steering wheel sets a
    //     front road-wheel angle through the variable-ratio EPS; the tyres build slip-angle
    //     (Pacejka) forces under real load transfer; those forces yaw the car. So it takes
    //     90/180/270-degree turns and a full U-turn, stays planted to 155 mph, and washes wide
    //     (understeer) — never snaps — when asked for more grip than the tyres own. ---
    state.curvature = curvatureAt(state.distanceM);
    const v = state.speedMps;                                   // signed longitudinal speed (vx)
    const roadWheel = state.steer * STEERING.maxAngle * steerGain(speedAbs);   // EPS variable-ratio rack
    const lat = updateLateralDynamics(v, roadWheel, dt, true);  // integrates state.vy & state.yawRate
    const yawRate = lat.yawRate, vy = lat.vy;                    // rad/s · m/s
    const k0 = state.curvature;
    const denom = clamp(1 - state.laneOffset * k0, 0.4, 1.6);
    const dsdt = (v * Math.cos(state.headingRel) - vy * Math.sin(state.headingRel)) / denom;  // progress along road
    const dndt = v * Math.sin(state.headingRel) + vy * Math.cos(state.headingRel);            // sideways drift incl. sideslip
    // heading relative to the road = the car's yaw rate minus the rate the road itself turns.
    // Stability and self-straightening now come from the tyre physics (understeer) plus the
    // lane/cruise/chauffeur controllers — no scripted heading nudge, so full-manual is pure car.
    const dphidt = yawRate - k0 * dsdt;
    state.headingRate = dphidt;                                  // exposed so the assists can damp on it
    state.headingRel += dphidt * dt;
    if (state.headingRel > Math.PI) state.headingRel -= 2 * Math.PI;
    else if (state.headingRel < -Math.PI) state.headingRel += 2 * Math.PI;
    state.laneOffset = clamp(state.laneOffset + dndt * dt, -60, 60);
    state.distanceM += dsdt * dt;
    state.lateralG = lat.ay / 9.81;                             // force-based — naturally bounded by grip
    state.bodyRoll = approach(state.bodyRoll, clamp(state.lateralG * (state.magicRide ? 6 : 11), -9, 9), 0.002, dt);
    state.wheelRotation = (state.wheelRotation + v * dt / SPEC.wheelRadiusM * 57.2958) % 360;

    // route progress + arrival (forward progress along the path; backing away adds distance)
    if (state.route.active) {
      state.route.remainingM = Math.max(0, state.route.remainingM - dsdt * dt);
      if (!state.route.arrived && state.route.remainingM <= 1.5 && speedAbs < 0.6) onArrival();
    }

    /* ---- ride quality: road input vs cabin motion ----
       Magic Carpet pre-loads the air springs (Flagbearer camera) so almost
       nothing reaches the cabin. Sport lets the road talk. */
    const joint = Math.max(0, Math.sin((state.distanceM) * 0.10)) ** 16 * 0.30;   // expansion joints
    const coarse = Math.sin(state.distanceM * 0.7) * 0.02 + Math.sin(state.distanceM * 2.3) * 0.012;
    state.roadInputG = Math.abs(coarse) + joint;
    const isoCabin = state.magicRide
      ? state.roadInputG * (state.cameraScan ? 0.05 : 0.1)     // serene
      : state.roadInputG * 0.55;                               // direct
    state.cabinHeaveG = approach(state.cabinHeaveG, isoCabin, 0.002, dt);

    // screen shake / vibration — none in Magic Carpet, real in Sport
    let shakeAmp = 0;
    if (!state.magicRide) {
      const idle = (state.gearMode !== "P" && speedAbs < 1) ? 0.6 : 0;     // V12 idle shimmy
      shakeAmp = state.cabinHeaveG * 16 + Math.abs(state.lateralG) * 5 + idle + (state.shiftTimer > 0 ? 1.2 : 0);
    }
    state.shake.x = (Math.random() - 0.5) * shakeAmp;
    state.shake.y = (Math.random() - 0.5) * shakeAmp * 1.3;
    state.shake.rot = (Math.random() - 0.5) * shakeAmp * 0.0006 + state.bodyRoll * 0.0009;

    // device vibration on real jolts (Sport only)
    if (!state.magicRide && joint > 0.18 && navigator.vibrate && state.time - (state._lastBuzz || 0) > 0.4) {
      navigator.vibrate(18); state._lastBuzz = state.time;
    }

    // blinker timing
    if (state.blinker !== 0 || state.hazards) {
      state.blinkPhase += dt;
      if (state.blinkPhase > 0.42) { state.blinkPhase = 0; state.blinkOn = !state.blinkOn; if (state.blinkOn) audio.click(1500); }
    } else { state.blinkOn = false; state.blinkPhase = 0; }

    // day/night drift (very slow) unless night vision pins it
    if (!state.nightVision) state.dayPhase = (state.dayPhase + dt * 0.004) % 1;

    if (state.toastTimer > 0) { state.toastTimer -= dt; if (state.toastTimer <= 0) el.toast.classList.remove("show"); }
  }

  function onArrival() {
    state.route.arrived = true;
    state.route.active = false;
    const name = state.route.name;
    state.adaptiveCruise = false;
    showToast(`We have arrived at ${name}. I hope the journey was to your liking.`, state.chauffeur ? "Chauffeur" : "Whispers");
    audio.chime([784, 1047, 1319]);
    setGear("P");
    // present the rear coach door
    setTimeout(() => { if (Math.abs(state.speedMps) < 0.4) { state.doors.rearLeft = true; updateDoorArt(); audio.motor(0.9); } }, 700);
  }


Object.assign(app, {
  engineTorque,
  updateTransmission,
  buildCornersForRoute,
  curvatureAt,
  seedWorld,
  cornerSpeedCap,
  targetSpeedMps,
  followDist,
  nearestLeadVehicle,
  laneScan,
  chooseLaneOffset,
  laneIndex,
  STEERING,
  VEHICLE,
  tyreFy,
  steerGain,
  updateLateralDynamics,
  steerForYaw,
  pathSteer,
  autopilotControls,
  updateInputs,
  updatePhysics,
  onArrival
});
