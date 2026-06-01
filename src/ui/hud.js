import "./cabin-features.js";
import "./vehicle-actions.js";

const app = window.PhantomApp;
const { state, el, SPEC, clamp, lerp, mph } = app;

function updateUi() {
  const speed = Math.round(Math.abs(mph(state.speedMps)));
  el.speedReadout.textContent = String(speed);
  el.gearReadout.textContent = state.gearMode === "D" ? String(state.autoGear) : state.gearMode;
  el.rpmText.textContent = `${Math.round(state.rpm)} rpm`;
  el.rpmBar.style.width = clamp(state.rpm / SPEC.redlineRpm * 100, 0, 100) + "%";
  el.torqueText.textContent = `${Math.round(state.torqueNm)} Nm`;
  el.torqueBar.style.width = clamp(state.torqueNm / SPEC.peakTorqueNm * 100, 0, 100) + "%";
  el.throttleText.textContent = Math.round(state.throttle * 100) + "%";
  el.throttleBar.style.width = Math.round(state.throttle * 100) + "%";
  el.brakeText.textContent = Math.round(state.brake * 100) + "%";
  el.brakeBar.style.width = Math.round(state.brake * 100) + "%";
  el.throttlePedal.style.setProperty("--level", Math.round(state.throttle * 100) + "%");
  el.brakePedal.style.setProperty("--level", Math.round(state.brake * 100) + "%");
  const throttleSliderValue = document.getElementById("throttleSliderVal");
  const brakeSliderValue = document.getElementById("brakeSliderVal");
  if (throttleSliderValue) throttleSliderValue.textContent = Math.round((state.padThrottle || 0) * 100) + "%";
  if (brakeSliderValue) brakeSliderValue.textContent = Math.round((state.padBrake || 0) * 100) + "%";

  const warnings = [];
  if (app.anyDoorOpen()) warnings.push("doors open");
  if (!state.beltLatched && state.gearMode === "D") warnings.push("belt off");
  if (state.gearMode === "P") warnings.push("Park");
  if (state.gearMode === "N") warnings.push("Neutral");
  if (!warnings.length) {
    warnings.push(state.chauffeur ? `chauffeur driving to ${state.route.active ? state.route.name : "the city"}` : (state.adaptiveCruise ? "adaptive cruise" : "ready"));
  }
  el.warning.textContent = warnings.join(" · ");

  const left = (state.blinker < 0 || state.hazards) && state.blinkOn;
  const right = (state.blinker > 0 || state.hazards) && state.blinkOn;
  el.sigL.classList.toggle("on", left);
  el.sigR.classList.toggle("on", right);

  if (state.route.active) {
    const miles = (state.route.remainingM / 1609).toFixed(1);
    const etaMin = state.speedMps > 1 ? Math.ceil(state.route.remainingM / state.speedMps / 60) : null;
    el.etaText.textContent = `${miles} mi to ${state.route.name}${etaMin ? ` · ${etaMin} min` : ""}`;
    el.distRead.textContent = `${miles} mi`;
  } else {
    el.etaText.textContent = Math.abs(state.speedMps) < 0.2 ? "Phantom at rest" : "City cruise";
    el.distRead.textContent = "—";
  }

  el.beltRead.textContent = state.beltLatched ? "Latched" : "Open";
  el.doorState.textContent = app.anyDoorOpen() ? "Open" : "Closed";
  el.wheelState.textContent = Math.abs(state.speedMps) > 0.5 ? "Self-levelling" : "Level";
  el.lightState.textContent = state.lights ? "Active" : "Off";
  el.frontSeatRead.textContent = `${state.frontRecline}°`;
  el.climateRead.textContent = `${Math.round(state.seatTempC)}°C`;
  el.soundRead.textContent = state.audioStudio ? "Concert" : "Hushed";
  el.rideRead.textContent = state.magicRide ? "Magic Carpet" : "Sport";
  el.cabinRead.textContent = state.cabinHeaveG.toFixed(2) + " g";
  el.roadRead.textContent = state.roadInputG.toFixed(2) + " g";
  el.shiftRead.textContent = state.cameraScan ? "SAT" : "Auto";
  el.satStatus.textContent = state.cameraScan ? "Satellite-aided transmission holding gears through the bends" : "Conventional automatic shift map";
  el.navRead.textContent = state.route.active ? state.route.name : "City cruise";
  el.driverRead.textContent = state.chauffeur ? "Chauffeur" : "You";
  el.cruiseRead.textContent = state.adaptiveCruise ? `${Math.round(state.cruiseSetMph)} mph` : "Off";
  el.laneRead.textContent = state.laneAssist ? "Active" : "Off";
  el.nightRead.textContent = state.nightVision ? "On" : "Off";

  const targetTemp = state.heat ? 32 : state.cool ? 17 : 22;
  state.seatTempC = lerp(state.seatTempC, targetTemp, 0.02);

  const pulse = state.massage ? Math.sin(state.time * 6) * 4 : 0;
  el.seatMini.style.setProperty("--seat-pulse", pulse + "px");
  el.seatMini.style.setProperty("--seat-recline", (state.frontRecline * 0.55) + "px");
  document.documentElement.style.setProperty("--rear-recline", (state.rearRecline * 0.65) + "deg");
  el.rearSeatL.style.setProperty("--rear-pulse", (state.rearMassage ? Math.sin(state.time * 5) * 3 : 0) + "px");
  el.rearSeatR.style.setProperty("--rear-pulse", (state.rearMassage ? Math.sin(state.time * 5 + 1) * 3 : 0) + "px");

  document.documentElement.style.setProperty("--stars-opacity", state.stars ? "0.95" : "0.1");
  document.documentElement.style.setProperty("--table-angle", state.tables ? "2deg" : "84deg");
  document.documentElement.style.setProperty("--screens-opacity", state.screens ? "1" : "0.18");
  document.documentElement.style.setProperty("--divider-top", state.privacy ? "6%" : "110%");

  if (el.spiritArt) el.spiritArt.classList.toggle("hidden", !state.spiritUp);
  document.documentElement.style.setProperty("--wheel-rot", `${state.wheelRotation}deg`);
  document.documentElement.style.setProperty("--umbrella-out", state.umbrellaOut ? "-86px" : "0px");
  document.documentElement.style.setProperty("--umbrella-opacity", state.umbrellaOut ? "1" : "0");

  const galleryArt = document.getElementById("galleryArt");
  if (galleryArt) galleryArt.style.opacity = state.galleryLit ? "0.95" : "0.18";
  const starsCabin = document.getElementById("starsCabin");
  if (starsCabin) starsCabin.style.opacity = state.stars ? "0.95" : "0.12";
  const cabinWheel = document.getElementById("cabinWheelG");
  if (cabinWheel) cabinWheel.setAttribute("transform", `translate(250,300) rotate(${(state.steer * 100).toFixed(1)})`);

  const clockHour = document.getElementById("clockHour");
  const clockMin = document.getElementById("clockMin");
  if (clockHour && clockMin) {
    const now = new Date();
    const hr = now.getHours() % 12;
    const mn = now.getMinutes();
    const se = now.getSeconds();
    clockHour.setAttribute("transform", `rotate(${hr * 30 + mn * 0.5})`);
    clockMin.setAttribute("transform", `rotate(${mn * 6 + se * 0.1})`);
  }

  if (el.gearStack) {
    [...el.gearStack.children].forEach((node, index) => {
      node.classList.toggle("active", state.gearMode === "D" && index + 1 === state.autoGear);
    });
  }
  if (el.shaft) el.shaft.style.setProperty("--shaft-angle", `${Math.sin(state.time * Math.max(2, Math.abs(state.speedMps))) * 1.5}deg`);

  el.cabinWave.style.transform = `translateY(${state.cabinHeaveG * 150}px)`;
  el.roadWave.style.transform = `translateY(${state.roadInputG * 110}px)`;

  setActive("rideBtn", state.magicRide);
  setActive("chauffeurBtn", state.chauffeur);
  setActive("nightBtn", state.nightVision);
  setActive("beltBtn", state.beltLatched);
  setActive("doorAllBtn", app.anyDoorOpen());
  setActive("laneBtn", state.laneAssist);
  setActive("cruiseBtn", state.adaptiveCruise);
  setActive("windowsBtn", state.windowsOpen);
  setActive("cameraBtn", state.cameraScan);
  setActive("hazardBtn", state.hazards);
  setActive("heatBtn", state.heat);
  setActive("coolBtn", state.cool);
  setActive("massageBtn", state.massage);
  setActive("audioBtn", state.audioStudio);
  setActive("starsBtn", state.stars);
  setActive("galleryBtn", state.galleryLit);
  setActive("spiritBtn", state.spiritUp);
  setActive("umbrellaBtn", state.umbrellaOut);
  setActive("lightsBtn", state.lights);
  setActive("rearMassageBtn", state.rearMassage);
  setActive("tableBtn", state.tables);
  setActive("screenBtn", state.screens);
  setActive("privacyBtn", state.privacy);
  setActive("coolerBtn", state.cooler);

  if (document.body.classList.contains("view-computer")) app.drawMap();
}

function setActive(id, on) {
  const node = document.getElementById(id);
  if (node) node.classList.toggle("active", !!on);
}

Object.assign(app, { updateUi, setActive });
