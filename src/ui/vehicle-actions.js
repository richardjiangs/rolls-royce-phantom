import "../render/art.js";

const app = window.PhantomApp;
const { state, el, DESTINATIONS, SPEC, clamp, mph, audio } = app;
const showToast = app.showToast;

function anyDoorOpen() { return Object.values(state.doors).some(Boolean); }
function driveAllowed() { return state.gearMode === "D" || state.gearMode === "R"; }

function setGear(mode) {
  if (!["P", "R", "N", "D"].includes(mode)) return;
  if (mode === "P" && Math.abs(state.speedMps) > 0.7) {
    showToast("Park engages once the Phantom is at rest.");
    return;
  }
  if ((mode === "D" || mode === "R") && anyDoorOpen()) {
    closeAllDoors(true);
    showToast("Drawing the doors closed for you.", "Phantom");
  }
  state.gearMode = mode;
  if (mode === "D" && !state.beltLatched) latchBelt(true);
  if (mode === "P" || mode === "N") state.adaptiveCruise = false;
  if (mode === "P") state.autoGear = 1;
  audio.click(1100);
  updateGearButtons();
}

function updateGearButtons() {
  document.querySelectorAll("[data-gear]").forEach((button) => {
    button.classList.toggle("active", button.dataset.gear === state.gearMode);
  });
}

function latchBelt(force) {
  const next = force === undefined ? !state.beltLatched : Boolean(force);
  if (next === state.beltLatched) return;
  state.beltLatched = next;
  audio.click(2600);
  showToast(next ? "Seatbelt drawn across and latched." : "Seatbelt released.");
}

function closeAllDoors(silent) {
  const was = anyDoorOpen();
  for (const key of Object.keys(state.doors)) state.doors[key] = false;
  if (was) audio.thunk();
  if (!silent && was) showToast("All coach doors closed.");
  updateDoorArt();
}

function toggleDoor(which) {
  const moving = Math.abs(state.speedMps) > 0.45;
  const wantOpen = which === "all" ? !anyDoorOpen() : !state.doors[which];
  if (wantOpen && moving) {
    showToast("The doors stay shut while the Phantom is moving.");
    return;
  }
  if (which === "all") {
    const next = !anyDoorOpen();
    for (const key of Object.keys(state.doors)) state.doors[key] = next;
    next ? audio.motor(0.8) : audio.thunk();
    showToast(next ? "Coach doors presenting." : "All coach doors closed.");
  } else if (state.doors[which] !== undefined) {
    state.doors[which] = !state.doors[which];
    state.doors[which] ? audio.motor(0.7) : audio.thunk();
    showToast(`${doorLabel(which)} ${state.doors[which] ? "opened" : "closed"}.`);
  }
  updateDoorArt();
}

function doorLabel(which) {
  return ({
    driver: "Driver door",
    passenger: "Passenger door",
    rearLeft: "Rear coach door",
    rearRight: "Rear coach door"
  })[which] || "Door";
}

function updateDoorArt() {
  const front = state.doors.driver || state.doors.passenger;
  const rear = state.doors.rearLeft || state.doors.rearRight;
  if (el.frontDoorArt) el.frontDoorArt.classList.toggle("open", front);
  if (el.rearDoorArt) el.rearDoorArt.classList.toggle("open", rear);
}

function setView(view) {
  document.body.className = `view-${view}`;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
}

function selectDestination(name) {
  const destination = DESTINATIONS[name];
  if (!destination) {
    showToast(`I don't have ${name} on file, but I can take you anywhere on the map.`, "Whispers");
    return;
  }
  state.route = {
    active: true,
    name,
    env: destination.env,
    totalM: destination.dist,
    remainingM: destination.dist,
    arrived: false
  };
  app.buildCornersForRoute();
  app.seedWorld();
  showToast(`Route set for ${destination.blurb}. ${(destination.dist / 1609).toFixed(1)} miles.`, "Whispers");
  document.querySelectorAll("[data-destination]").forEach((button) => {
    button.classList.toggle("active", button.dataset.destination === name);
  });
}

function toggleChauffeur(force) {
  const next = force === undefined ? !state.chauffeur : Boolean(force);
  state.chauffeur = next;
  if (next) {
    state.chauffeurFee += 5000;
    closeAllDoors(true);
    latchBelt(true);
    setGear("D");
    state.adaptiveCruise = true;
    showToast("Good evening. I'll take it from here — sit back and enjoy the ride.", "Chauffeur");
  } else {
    state.adaptiveCruise = false;
    showToast("Very good. The wheel is yours.", "Chauffeur");
  }
  document.getElementById("chauffeurBtn").classList.toggle("active", next);
}

function setRide(magic) {
  state.magicRide = magic;
  document.getElementById("rideBtn").textContent = magic ? "Magic Carpet" : "Sport";
  document.getElementById("rideBtn").classList.toggle("active", magic);
  showToast(magic ? "Magic Carpet Ride: the road simply disappears." : "Sport: dampers firmed, the V12 has a voice now.", "Phantom");
  audio.motor(0.4);
}

function setCruiseSpeed(speedMph, announce) {
  state.cruiseSetMph = clamp(Math.round(speedMph), 20, 155);
  if (announce) showToast(`Cruise set to ${state.cruiseSetMph} mph.`, "Phantom");
}

function resetCar() {
  Object.assign(state, {
    speedMps: 0,
    distanceM: 0,
    laneOffset: 0,
    headingRel: 0,
    steer: 0,
    throttle: 0,
    brake: 0,
    padThrottle: 0,
    padBrake: 0,
    rpm: SPEC.idleRpm,
    autoGear: 1,
    gearMode: "P",
    chauffeur: false,
    adaptiveCruise: false
  });
  state.route = { active: false, name: "City cruise", env: "avenue", totalM: 0, remainingM: 0, arrived: false };
  app.buildCornersForRoute();
  closeAllDoors(true);
  updateGearButtons();
  const throttleSlider = document.getElementById("throttleSlider");
  const brakeSlider = document.getElementById("brakeSlider");
  if (throttleSlider) throttleSlider.value = 0;
  if (brakeSlider) brakeSlider.value = 0;
  document.querySelectorAll("[data-destination]").forEach((button) => button.classList.remove("active"));
  showToast("Phantom reset at the curb.", "Phantom");
}

function toggleCruise() {
  state.adaptiveCruise = !state.adaptiveCruise;
  if (state.adaptiveCruise) {
    if (state.gearMode !== "D") setGear("D");
    const now = Math.round(Math.abs(mph(state.speedMps)));
    if (now >= 20) state.cruiseSetMph = Math.min(155, now);
    showToast(`Adaptive cruise holding ${state.cruiseSetMph} mph.`, "Phantom");
  } else {
    showToast("Adaptive cruise off.");
  }
}

function toggleWindows() {
  state.windowsOpen = !state.windowsOpen;
  audio.whoosh(0.6);
  showToast(state.windowsOpen ? "Windows lowered — the world drifts in." : "Windows raised — the cabin seals to silence.", "Phantom");
}

Object.assign(app, {
  anyDoorOpen,
  driveAllowed,
  setGear,
  updateGearButtons,
  latchBelt,
  closeAllDoors,
  toggleDoor,
  doorLabel,
  updateDoorArt,
  setView,
  selectDestination,
  toggleChauffeur,
  setRide,
  setCruiseSpeed,
  resetCar,
  toggleCruise,
  toggleWindows
});
