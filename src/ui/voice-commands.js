import "./cabin-features.js";
import "./vehicle-actions.js";

const app = window.PhantomApp;
const { state, el, audio } = app;
const showToast = app.showToast;

function processVoice() {
  const text = el.voiceInput.value.trim().toLowerCase();
  if (!text) return;
  el.voiceInput.value = "";

  const has = (...words) => words.some((word) => text.includes(word));
  const reply = (message) => showToast(message, "Whispers");
  const numberFrom = (value) => {
    const match = value.match(/(\d{1,3})/);
    if (match) return parseInt(match[1], 10);
    const words = { ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
    for (const key in words) if (value.includes(key)) return words[key];
    return null;
  };
  let acted = false;

  if (/^(hi|hello|hey|good (morning|afternoon|evening))/.test(text)) {
    reply("Good to see you. Where would you like to go?");
    return;
  }
  if (has("thank")) {
    reply("My pleasure.");
    return;
  }

  const destMap = [
    ["White Palace", ["white palace", "palace"]],
    ["Opera House", ["opera"]],
    ["Royal Hotel", ["hotel"]],
    ["The Marina", ["marina", "harbour", "harbor"]],
    ["Airport", ["airport", "jet", "plane"]],
    ["Private Club", ["club"]]
  ];
  let dest = null;
  for (const [name, keys] of destMap) {
    if (keys.some((key) => text.includes(key))) {
      dest = name;
      break;
    }
  }
  if (dest) {
    app.selectDestination(dest);
    app.toggleChauffeur(true);
    reply(`Of course — taking you to ${dest}.`);
    acted = true;
  }

  const speed = numberFrom(text);
  const speedish = has("cruise", "mph", "speed", "drive at", "go at", "hold", "maintain", "keep") || (speed !== null && has("go ", "drive", "fast"));
  if (!dest && speed !== null && speedish) {
    if (state.gearMode !== "D") app.setGear("D");
    state.adaptiveCruise = true;
    app.setCruiseSpeed(speed, false);
    reply(`Very good — cruising at ${state.cruiseSetMph} mph.`);
    acted = true;
  } else if (has("faster", "speed up", "quicker")) {
    if (state.gearMode !== "D") app.setGear("D");
    state.adaptiveCruise = true;
    app.setCruiseSpeed(state.cruiseSetMph + 5, false);
    reply(`A little quicker — ${state.cruiseSetMph} mph.`);
    acted = true;
  } else if (has("slower", "slow down", "ease off")) {
    app.setCruiseSpeed(state.cruiseSetMph - 5, false);
    reply(`Easing to ${state.cruiseSetMph} mph.`);
    acted = true;
  } else if (!acted && has("cruise")) {
    if (state.gearMode !== "D") app.setGear("D");
    state.adaptiveCruise = true;
    reply(`Cruise holding ${state.cruiseSetMph} mph.`);
    acted = true;
  }

  if (has("stop", "pull over", "park the car", "halt")) {
    state.adaptiveCruise = false;
    state.chauffeur = false;
    state.padThrottle = 0;
    reply("Pulling over.");
    acted = true;
  }

  if (has("sport")) {
    app.setRide(false);
    acted = true;
  } else if (has("comfort", "magic", "carpet", "smooth", "relax")) {
    app.setRide(true);
    acted = true;
  }
  if (has("window")) {
    const wantOpen = has("open", "down", "lower");
    const wantClose = has("close", "up", "raise");
    if ((wantOpen && !state.windowsOpen) || (wantClose && state.windowsOpen) || (!wantOpen && !wantClose)) {
      app.toggleWindows();
    }
    acted = true;
  }

  if (has("you drive", "chauffeur", "drive me", "take the wheel", "take over")) {
    app.toggleChauffeur(true);
    acted = true;
  }
  if (has("i'll drive", "let me drive", "dismiss", "my turn")) {
    if (state.chauffeur) app.toggleChauffeur(false);
    acted = true;
  }

  if (has("door")) {
    has("open") ? app.toggleDoor("all") : app.closeAllDoors();
    acted = true;
  }
  if (has("belt", "seatbelt")) {
    app.latchBelt(true);
    acted = true;
  }

  if (has("warm", "heat")) {
    app.setToggle("heat", true);
    acted = true;
  }
  if (has("cool", "ventilat", "air con", "cold air")) {
    app.setToggle("cool", true);
    acted = true;
  }
  if (has("massage")) {
    app.setToggle("massage", true);
    acted = true;
  }
  if (has("music", "play", "song", "audio")) {
    app.setToggle("audioStudio", true);
    acted = true;
  }
  if (has("starlight", "stars", "headliner")) {
    if (!state.stars) app.setToggle("stars", true);
    acted = true;
  }
  if (has("gallery")) {
    state.galleryLit = true;
    acted = true;
  }
  if (has("privacy", "divider")) {
    app.setToggle("privacy", true);
    acted = true;
  }
  if (has("champagne", "cooler", "bubbly")) {
    audio.cork();
    state.cooler = true;
    reply("Champagne is chilled and the flutes are ready.");
    acted = true;
  }
  if (has("night")) {
    state.nightVision = !has("off", "stop");
    acted = true;
  }
  if ((has("light", "headlamp", "beam") && !has("starlight")) && !has("night")) {
    state.lights = !has("off");
    acted = true;
  }
  if (has("horn", "honk")) {
    audio.horn(true);
    setTimeout(() => audio.horn(false), 600);
    acted = true;
  }

  if (!acted) {
    reply("Forgive me — I didn't quite catch that. Try “take me to the White Palace”, “cruise at 70”, “open the windows”, or “play my music”.");
  }
}

app.processVoice = processVoice;
