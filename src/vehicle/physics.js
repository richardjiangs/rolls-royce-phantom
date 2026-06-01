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
    // Both the chauffeur and cruise ease the speed for corners so the car never runs wide.
    // Adaptive cruise is deliberately conservative because it also owns the steering when active.
    const cornerCap = cornerSpeedCap(state.chauffeur ? 0.42 : 0.46);
    // slow only for a car genuinely in our path; chauffeur overtaking lifts this as we pull alongside
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
  // the lateral line the chauffeur should hold: stay if clear, pull out to pass a
  // slower car when a neighbouring lane has more room, and drift back to centre when free.
  // Adaptive cruise does not call this; it holds the centre lane and follows traffic.
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
  const STEERING = { wheelbase: 3.552, frontTrack: 1.67, maxAngle: 0.6156, latGrip: 0.9 * 9.81 }; // 0.90 g lateral grip (Rolls-Royce skidpad)
  // Speed-sensitive rack, tuned to physics: full lock equals EXACTLY the tyres' grip limit at any
  // speed, so the steering is PROGRESSIVE — a small input gives a small turn, full lock gives the
  // most the grip allows — instead of snapping to the limit on any input (which felt twitchy and
  // unsteerable). Full lock at manoeuvring speed (13.7 m circle), easing smoothly as speed rises:
  // light and precise, exactly the Phantom's character.
  function steerFactorOf(speedAbs) {
    const v = Math.max(2, speedAbs);
    return clamp(Math.atan(STEERING.latGrip * STEERING.wheelbase / (v * v)) / STEERING.maxAngle, 0.012, 1);
  }
  // the normalised wheel position (-1..1) that yields a desired yaw-rate at a given speed
  function steerForYaw(desiredYaw, v) {
    const vAbs = Math.max(2.2, Math.abs(v));
    const ang = Math.atan((desiredYaw * STEERING.wheelbase) / vAbs);
    return clamp(ang / (STEERING.maxAngle * steerFactorOf(Math.abs(v))), -1, 1);
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
    const look = clamp(vAbs * 1.15, 12, 96);
    const kNear = curvatureAt(state.distanceM + look * 0.45);
    const kAhead = curvatureAt(state.distanceM + look);
    const kGuide = kNear * 0.45 + kAhead * 0.55;
    const omega = STEERING.latGrip / vAbs;                             // available (grip) turn rate
    const phiSafe = Math.min(0.45, Math.sqrt(2 * omega * Math.abs(e) / vAbs) * 0.7);  // 0.7 = safety margin
    const phiTarget = -Math.sign(e) * phiSafe;                         // aim toward the lane, only as much as is safe
    const ffYaw = kGuide * v;                                          // follow the bend
    const yawCmd = ffYaw + (phiTarget - state.headingRel) * 1.4 * (gain || 1) - (state.headingRate || 0) * 0.45;
    state.blinker = Math.abs(e) > 0.7 ? -Math.sign(e) : (Math.abs(kGuide) > 0.02 ? Math.sign(kGuide) : 0);
    return steerForYaw(yawCmd, v);
  }

  function laneAssistGuardian(throttle, brake) {
    const cap = cornerSpeedCap(0.42);
    if (!Number.isFinite(cap)) return { throttle, brake };
    const over = Math.abs(state.speedMps) - cap;
    if (over <= 0.4) return { throttle, brake };
    const demand = clamp(over / 18, 0, 1);
    return {
      throttle: Math.min(throttle, clamp(1 - demand * 2.3, 0, 1)),
      brake: Math.max(brake, clamp(demand * 0.72, 0.06, 0.72))
    };
  }

  function autopilotControls(dt, targetOffset, steerGain) {
    // Longitudinal: single demand in [-1,1]; never throttle & brake together.
    const target = targetSpeedMps();
    const err = target - state.speedMps;
    let demand = clamp(err * 0.5, -1, 1);
    if (Math.abs(err) < 0.5) demand *= 0.7;                  // ease off only right at the target
    let throttle = demand > 0 ? clamp(demand, 0, 0.9) : 0;
    let brake = demand < 0 ? clamp(-demand * 0.7, 0, 0.85) : 0;
    if (brake < 0.05) brake = 0;                            // smooth chauffeur rarely brakes
    const laneTarget = targetOffset === undefined ? chooseLaneOffset() : targetOffset;
    return { throttle, brake, steerTarget: pathSteer(steerGain || 1, laneTarget) };
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
      const a = autopilotControls(dt, chooseLaneOffset(), 1.05);
      throttleTarget = ownerThrottle > 0 ? ownerThrottle : a.throttle;
      brakeTarget = ownerBrake > 0 ? ownerBrake : a.brake;
      steerTarget = steerInput !== 0 ? steerInput : a.steerTarget;
    } else if (cruiseActive) {
      const a = autopilotControls(dt, 0, 1.25);   // cruise holds the centre lane and follows traffic
      throttleTarget = ownerThrottle > 0 ? ownerThrottle : a.throttle;
      brakeTarget = ownerBrake > 0 ? ownerBrake : a.brake;
      steerTarget = steerInput !== 0 ? steerInput : a.steerTarget;
    } else {
      throttleTarget = ownerThrottle;
      brakeTarget = ownerBrake;
      // manual lane assist brings you back to the centre of the road when you let go, firmly
      // if you've wandered off, so you never get marooned on the grass. Off = free to roam.
      steerTarget = steerInput !== 0 ? steerInput : (assist ? pathSteer(1.1, 0) : 0);
      if (assist && steerInput === 0) {
        const guarded = laneAssistGuardian(throttleTarget, brakeTarget);
        throttleTarget = guarded.throttle;
        brakeTarget = guarded.brake;
      }
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

    // --- steering & heading (bicycle model): the wheel rotates the car, so it can take
    //     90/180/270-degree turns and complete a full U-turn, not just slide sideways ---
    state.curvature = curvatureAt(state.distanceM);
    const v = state.speedMps;                                   // signed
    const steerAngle = state.steer * STEERING.maxAngle * steerFactorOf(speedAbs);
    const yawKin = (v / STEERING.wheelbase) * Math.tan(steerAngle);
    // Cap the turn rate at the tyres' grip. This keeps a hard turn from over-rotating the car —
    // without it, a brief full-lock spins you ~150 deg, so steering back just carries you
    // farther off before it reverses. (No effect at low speed: the 13.7 m turning circle stands.)
    const gripYaw = speedAbs > 0.5 ? STEERING.latGrip / speedAbs : 1e9;
    const yawRate = clamp(yawKin, -gripYaw, gripYaw);                   // rad/s
    const k0 = state.curvature;
    const denom = clamp(1 - state.laneOffset * k0, 0.4, 1.6);
    const dsdt = v * Math.cos(state.headingRel) / denom;        // progress along the road
    const dndt = v * Math.sin(state.headingRel);                // sideways drift
    // Directional stability: at speed the car eases its heading back toward the road's line when
    // you're not actively turning, so letting go of the wheel STRAIGHTENS you out (planted, easy
    // to place) instead of holding a heading and drifting. Zero at low speed, so U-turns and the
    // 13.7 m circle are unaffected. Aligns to whichever way you're travelling (forward or after a U-turn).
    // Directional stability is part of the assisted driving. With lane, cruise AND chauffeur all
    // off you are in full manual command — no self-straightening, free to roam onto the grass and
    // stay there; nothing pulls you back.
    const aidsOn = state.laneAssist || state.chauffeur || state.adaptiveCruise;
    // Gentle directional stability — like the Phantom's high-speed rear-steer: enough to settle
    // the car and straighten it when you let go, but never so much it fights your steering.
    const stab = aidsOn ? clamp((speedAbs - 5) * 0.07, 0, 1.2) : 0;
    const alignTo = Math.abs(state.headingRel) < Math.PI / 2 ? 0 : Math.sign(state.headingRel) * Math.PI;
    const dphidt = yawRate - k0 * dsdt - stab * (state.headingRel - alignTo);
    state.headingRate = dphidt;                                  // exposed so lane assist can damp on it
    state.headingRel += dphidt * dt;
    if (state.headingRel > Math.PI) state.headingRel -= 2 * Math.PI;
    else if (state.headingRel < -Math.PI) state.headingRel += 2 * Math.PI;
    state.laneOffset = clamp(state.laneOffset + dndt * dt, -60, 60);
    state.distanceM += dsdt * dt;
    state.lateralG = (v * yawRate) / 9.81;
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
  steerFactorOf,
  steerForYaw,
  pathSteer,
  laneAssistGuardian,
  autopilotControls,
  updateInputs,
  updatePhysics,
  onArrival
});
