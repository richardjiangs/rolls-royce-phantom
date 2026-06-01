import { DESTINATIONS } from "../data/destinations.js";
import { MPH, SPEC } from "../data/vehicle-spec.js";

/* ============================================================================
     ROLLS-ROYCE PHANTOM — THE PHANTOM WORLD  (modular Web)
     A browser-based driving salon. Real V12 audio synthesis, factory-matched
     physics, a chauffeur that actually drives, and a cabin that does things.
     ============================================================================ */

  const canvas = document.getElementById("cityCanvas");
  const ctx = canvas.getContext("2d");

  /* ---------------------------------- State --------------------------------- */
  const state = {
    time: 0, lastTime: performance.now(),
    speedMps: 0, distanceM: 0,
    laneOffset: 0,            // metres from lane centre (+ = right)
    headingRel: 0,            // car heading relative to the road tangent (rad) — lets it turn & U-turn
    steer: 0,                 // -1..1 visible wheel
    padThrottle: 0, padBrake: 0,  // held throttle/brake from the scroll pedals (0..1)
    cruiseSetMph: 60,         // the speed adaptive cruise holds
    windowsOpen: false,       // glass down changes the cabin sound
    throttle: 0, brake: 0,
    rpm: SPEC.idleRpm, torqueNm: 0,
    gearMode: "P", autoGear: 1, shiftTimer: 0, shiftFrom: 1,
    wheelRotation: 0,
    curvature: 0, lateralG: 0, bodyRoll: 0,
    doors: { driver: false, passenger: false, rearLeft: false, rearRight: false },
    beltLatched: false,
    magicRide: true,          // Magic Carpet (true) vs Sport (false)
    chauffeur: false, chauffeurFee: 0,
    nightVision: false, laneAssist: true, adaptiveCruise: false,
    cameraScan: true, hazards: false, horn: false, lights: true,
    spiritUp: true, umbrellaOut: false,
    heat: false, cool: false, massage: false, audioStudio: false,
    galleryLit: true, stars: true,
    rearRecline: 0, rearMassage: false, tables: false, screens: false, privacy: false, cooler: true,
    frontRecline: 0, seatTempC: 22,
    roadInputG: 0, cabinHeaveG: 0,
    shake: { x: 0, y: 0, rot: 0 },
    blinker: 0,               // -1 left, 0 none, +1 right
    blinkPhase: 0, blinkOn: false,
    toastTimer: 0,
    keys: Object.create(null),
    traffic: [], buildings: [], roadside: [],
    route: { active: false, name: "City cruise", env: "avenue", totalM: 0, remainingM: 0, arrived: false },
    corners: [],
    dayPhase: 0.32,           // 0 dawn .. 0.5 noon .. 1 night
    started: false
  };

  /* ------------------------------- DOM lookup ------------------------------- */
  const el = {};
  for (const id of [
    "speedReadout","gearReadout","rpmText","rpmBar","torqueText","torqueBar","throttleText","throttleBar",
    "brakeText","brakeBar","warning","etaText","sigL","sigR","beltRead","doorState","wheelState","lightState",
    "paintStatus","frontSeatRead","climateRead","soundRead","cockpitStatus","rearStatus","roadWave","cabinWave",
    "rideRead","cabinRead","roadRead","shiftRead","satStatus","navRead","distRead","driverRead","cruiseRead",
    "laneRead","nightRead","computerStatus","voiceInput","toast","throttlePedal","brakePedal","seatMini",
    "picnicArt","dividerArt","coolerArt","screensArt","rearSeatL","rearSeatR","exteriorArt","cabinArt",
    "frontDoorArt","rearDoorArt","spiritArt","umbrellaArt","gearStack","shaft",
    "mapCanvas","keyOverlay","startBtn"
  ]) el[id] = document.getElementById(id);

  /* ------------------------------- Utilities -------------------------------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
  const mph = (mps) => mps / MPH;
  const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.pow(rate, dt));

  function showToast(message, who) {
    el.toast.innerHTML = who ? `<span class="who">${who}</span>${message}` : message;
    el.toast.classList.add("show");
    state.toastTimer = 3.0;
  }



const app = {
  canvas,
  ctx,
  MPH,
  SPEC,
  state,
  DESTINATIONS,
  el,
  clamp,
  lerp,
  mph,
  approach,
  showToast
};

window.PhantomApp = app;
