import "./voice-commands.js";
import "./hud.js";

const app = window.PhantomApp;
const { state, el, clamp, mph, audio } = app;
const showToast = app.showToast;

function bindCoreControls() {
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => app.setView(button.dataset.view)));
  document.querySelectorAll("[data-gear]").forEach((button) => button.addEventListener("click", () => app.setGear(button.dataset.gear)));
  document.querySelectorAll("[data-door]").forEach((button) => button.addEventListener("click", () => app.toggleDoor(button.dataset.door)));
  document.querySelectorAll("[data-destination]").forEach((button) => button.addEventListener("click", () => {
    app.selectDestination(button.dataset.destination);
    const ownerDriving = state.keys.KeyW || state.keys.ArrowUp;
    if (!ownerDriving) app.toggleChauffeur(true);
  }));

  document.getElementById("beltBtn").addEventListener("click", () => app.latchBelt());
  document.getElementById("doorAllBtn").addEventListener("click", () => app.toggleDoor("all"));
  document.getElementById("rideBtn").addEventListener("click", () => app.setRide(!state.magicRide));
  document.getElementById("chauffeurBtn").addEventListener("click", () => app.toggleChauffeur());
  document.getElementById("nightBtn").addEventListener("click", () => {
    state.nightVision = !state.nightVision;
    if (state.nightVision) state.dayPhase = 0.9;
    showToast(state.nightVision ? "Night vision active — thermal watch on." : "Night vision off.");
  });
  document.getElementById("resetBtn").addEventListener("click", app.resetCar);
  document.getElementById("summonBtn").addEventListener("click", () => app.toggleChauffeur(true));
  document.getElementById("voiceBtn").addEventListener("click", app.processVoice);
  el.voiceInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") app.processVoice();
  });
}

function bindCabinControls() {
  const fnToggle = (id, key) => document.getElementById(id).addEventListener("click", () => app.setToggle(key));
  fnToggle("heatBtn", "heat");
  fnToggle("coolBtn", "cool");
  fnToggle("massageBtn", "massage");
  fnToggle("audioBtn", "audioStudio");
  fnToggle("starsBtn", "stars");
  fnToggle("screenBtn", "screens");
  fnToggle("privacyBtn", "privacy");
  fnToggle("coolerBtn", "cooler");
  fnToggle("tableBtn", "tables");
  fnToggle("rearMassageBtn", "rearMassage");

  document.getElementById("frontForward").addEventListener("click", () => app.adjustSeat(-2));
  document.getElementById("frontBack").addEventListener("click", () => app.adjustSeat(2));
  document.getElementById("memoryBtn").addEventListener("click", app.recallMemoryOne);
  document.getElementById("galleryBtn").addEventListener("click", app.toggleGallery);
  document.getElementById("rearReclineBtn").addEventListener("click", app.cycleRearRecline);

  document.getElementById("seatHeatQuick").addEventListener("click", () => app.setToggle("heat"));
  document.getElementById("seatCoolQuick").addEventListener("click", () => app.setToggle("cool"));
  document.getElementById("seatMassageQuick").addEventListener("click", () => app.setToggle("massage"));
  document.getElementById("seatPlusQuick").addEventListener("click", () => app.adjustSeat(2));
  document.getElementById("seatMinusQuick").addEventListener("click", () => app.adjustSeat(-2));
  document.getElementById("seatResetQuick").addEventListener("click", () => {
    state.frontRecline = 0;
    audio.motor(0.4);
    showToast("Seat upright.");
  });
}

function bindMediaLoaders() {
  const studioFileInput = document.getElementById("studioFile");
  document.getElementById("studioUploadBtn").addEventListener("click", () => {
    audio.init();
    audio.resume();
    studioFileInput.click();
  });
  studioFileInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    audio.init();
    audio.resume();
    if (!audio.ready) {
      showToast("This browser can't open the audio studio.", "Bespoke Audio");
      return;
    }
    const isVideo = /^video\//.test(file.type) || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name);
    let media;
    try {
      media = audio.loadUserTrack(file);
    } catch (err) {
      showToast("Couldn't load that file into the studio.", "Bespoke Audio");
      return;
    }
    state.audioStudio = true;
    app.setNowPlaying(isVideo ? `Lifting the soundtrack out of “${audio.userTrackName}”…` : `Loading “${audio.userTrackName}”…`);
    if (isVideo) showToast(`Taking the audio out of “${audio.userTrackName}” and playing it for you.`, "Bespoke Audio");
    const onReady = () => {
      media.removeEventListener("loadeddata", onReady);
      audio.setMusicVolume(0.78);
      media.play().then(() => {
        app.setNowPlaying(`${audio.userTrackIsVideo ? "♪ From your film: " : "♪ Now playing: "}${audio.userTrackName}`, true);
        showToast(`Now playing “${audio.userTrackName}”.`, "Bespoke Audio");
      }).catch(() => {
        app.setNowPlaying(`Ready — press Bespoke Audio to play “${audio.userTrackName}”`);
        showToast("Loaded. Press Bespoke Audio to start the music.", "Bespoke Audio");
      });
    };
    media.addEventListener("loadeddata", onReady);
    media.onerror = () => {
      app.setNowPlaying("That file couldn't be read — try an MP3 or MP4.");
      showToast("Your browser can't decode that file. An MP3 or MP4 works best.", "Bespoke Audio");
    };
  });

  const engineFileInput = document.getElementById("engineFile");
  document.getElementById("engineLoadBtn").addEventListener("click", () => {
    audio.init();
    audio.resume();
    engineFileInput.click();
  });
  engineFileInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    audio.init();
    audio.resume();
    if (!audio.ready) {
      showToast("This browser can't open the audio engine.", "Phantom");
      return;
    }
    const name = file.name.replace(/\.[^.]+$/, "");
    app.setEngineStatus(`Loading “${name}”…`);
    audio.loadEngineFromFile(file).then(() => {
      app.setEngineStatus(`Engine voice: ${name} — real recording`);
      showToast("Real V12 recording loaded. That's the engine you hear now, pitched with the revs.", "Phantom");
    }).catch(() => {
      app.setEngineStatus("Couldn't read that file — try a clean MP3 or WAV.");
      showToast("Your browser couldn't decode that audio. A short MP3 or WAV of the V12 works best.", "Phantom");
    });
  });
}

function bindDrivingControls() {
  document.getElementById("laneBtn").addEventListener("click", () => {
    state.laneAssist = !state.laneAssist;
    showToast(state.laneAssist ? "Lane centring active." : "Lane centring off.");
  });
  document.getElementById("cruiseBtn").addEventListener("click", app.toggleCruise);
  document.getElementById("cruiseUp").addEventListener("click", () => {
    app.setCruiseSpeed(state.cruiseSetMph + 5, true);
    if (!state.adaptiveCruise) document.getElementById("cruiseBtn").click();
  });
  document.getElementById("cruiseDown").addEventListener("click", () => {
    app.setCruiseSpeed(state.cruiseSetMph - 5, true);
  });
  document.getElementById("windowsBtn").addEventListener("click", app.toggleWindows);
  document.getElementById("cameraBtn").addEventListener("click", () => {
    state.cameraScan = !state.cameraScan;
    showToast(state.cameraScan ? "Flagbearer camera reading the road for the suspension." : "Flagbearer camera off.");
  });
  document.getElementById("hazardBtn").addEventListener("click", () => {
    state.hazards = !state.hazards;
    showToast(state.hazards ? "Hazard lamps on." : "Hazard lamps off.");
  });
  document.getElementById("lightsBtn").addEventListener("click", () => {
    state.lights = !state.lights;
    showToast(state.lights ? "Laser high-beam armed." : "Headlamps off.");
  });
  document.getElementById("spiritBtn").addEventListener("click", () => {
    state.spiritUp = !state.spiritUp;
    audio.motor(0.5);
    showToast(state.spiritUp ? "Spirit of Ecstasy raised." : "Spirit of Ecstasy retracted into the grille.");
  });
  document.getElementById("umbrellaBtn").addEventListener("click", () => {
    state.umbrellaOut = !state.umbrellaOut;
    showToast(state.umbrellaOut ? "Door umbrella presented." : "Umbrella stowed in the door.");
  });

  setupPedals();
  bindHorn();
  bindKeyboard();
  bindMobilePad();
}

function setupPedals() {
  const throttleSlider = document.getElementById("throttleSlider");
  const brakeSlider = document.getElementById("brakeSlider");
  const bindPedal = (slider, key, other, otherSlider) => {
    const apply = () => {
      state[key] = clamp((+slider.value || 0) / 100, 0, 1);
      if (state[key] > 0 && otherSlider) {
        otherSlider.value = 0;
        state[other] = 0;
      }
    };
    slider.addEventListener("input", apply);
    slider.addEventListener("wheel", (event) => {
      event.preventDefault();
      slider.value = clamp((+slider.value || 0) - Math.sign(event.deltaY) * 6, 0, 100);
      apply();
    }, { passive: false });
  };
  bindPedal(throttleSlider, "padThrottle", "padBrake", brakeSlider);
  bindPedal(brakeSlider, "padBrake", "padThrottle", throttleSlider);
}

function bindHorn() {
  const hornBtn = document.getElementById("hornBtn");
  const hornOn = () => {
    state.horn = true;
    audio.horn(true);
  };
  const hornOff = () => {
    state.horn = false;
    audio.horn(false);
  };
  hornBtn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    hornOn();
  });
  hornBtn.addEventListener("pointerup", hornOff);
  hornBtn.addEventListener("pointerleave", hornOff);
  app.hornOn = hornOn;
  app.hornOff = hornOff;
}

function bindKeyboard() {
  window.addEventListener("keydown", (event) => {
    state.keys[event.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
    if (event.metaKey || event.ctrlKey) return;
    if (event.code === "KeyP") app.setGear("P");
    if (event.code === "KeyR") app.setGear("R");
    if (event.code === "KeyN") app.setGear("N");
    if (event.code === "KeyD" && !event.repeat) {
      if (!state.keys.KeyA && !state.keys.ArrowLeft) app.setGear("D");
    }
    if (event.code === "KeyH" && !event.repeat) app.hornOn();
  });
  window.addEventListener("keyup", (event) => {
    state.keys[event.code] = false;
    if (event.code === "KeyH") app.hornOff();
  });
}

function bindMobilePad() {
  document.querySelectorAll("[data-pad]").forEach((button) => {
    const map = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };
    const code = map[button.dataset.pad];
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      state.keys[code] = true;
    });
    button.addEventListener("pointerup", () => state.keys[code] = false);
    button.addEventListener("pointerleave", () => state.keys[code] = false);
    button.addEventListener("pointercancel", () => state.keys[code] = false);
  });
}

function bindWakeAndStart() {
  function wake() {
    audio.init();
    audio.resume();
  }
  window.addEventListener("pointerdown", wake, { once: false });
  window.addEventListener("keydown", wake, { once: false });

  document.getElementById("startBtn").addEventListener("click", () => {
    audio.init();
    audio.resume();
    el.keyOverlay.classList.add("hide");
    state.started = true;
    audio.chime([523, 659, 784]);
    showToast("Welcome aboard. Choose Drive, or open Navigation for your chauffeur.", "Phantom");
    audio.loadEngineFromURL("phantom-v12.mp3")
      .then(() => { app.setEngineStatus("Engine voice: phantom-v12.mp3 — real recording"); })
      .catch(() => {});
  });
}

function bindUiEvents() {
  bindCoreControls();
  bindCabinControls();
  bindMediaLoaders();
  bindDrivingControls();
  bindWakeAndStart();
}

bindUiEvents();
Object.assign(app, { bindUiEvents });
