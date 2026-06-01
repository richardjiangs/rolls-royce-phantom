import "./media-status.js";
import "./vehicle-actions.js";

const app = window.PhantomApp;
const { state, el, clamp, audio } = app;
const showToast = app.showToast;

function setToggle(key, value) {
  const next = value === undefined ? !state[key] : value;
  state[key] = next;
  applyFunctionEffect(key, next);
}

function applyFunctionEffect(key, on) {
  switch (key) {
    case "heat":
      if (on) state.cool = false;
      el.seatMini.classList.toggle("heat", on);
      el.seatMini.classList.toggle("cool", state.cool);
      el.rearSeatL.classList.toggle("heat", on);
      el.rearSeatR.classList.toggle("heat", on);
      if (on) audio.whoosh(0.5);
      showToast(on ? "Seat heating — the leather is warming through." : "Seat heating off.");
      break;
    case "cool":
      if (on) state.heat = false;
      el.seatMini.classList.toggle("cool", on);
      el.seatMini.classList.toggle("heat", state.heat);
      if (on) audio.whoosh(0.6);
      showToast(on ? "Seat ventilation drawing cool air through the perforations." : "Ventilation off.");
      break;
    case "massage":
      showToast(on ? "Massage running — five programmes, this is Gentle." : "Massage off.");
      if (on) audio.motor(0.6);
      break;
    case "audioStudio":
      audio.setMusic(on);
      if (audio.hasUserTrack()) {
        app.setNowPlaying(on ? `${audio.userTrackIsVideo ? "♪ From your film: " : "♪ Now playing: "}${audio.userTrackName}` : `Paused — ${audio.userTrackName}`, on);
        showToast(on ? `Bespoke Audio — playing “${audio.userTrackName}”.` : "Music paused.");
      } else {
        app.setNowPlaying(on ? "Playing the house suite" : "Audio off", false);
        showToast(on ? "Bespoke Audio: the cabin becomes a concert hall." : "Audio paused — back to the famous Phantom silence.");
      }
      break;
    case "stars":
      showToast(on ? "Starlight Headliner lit — 1,340 fibre-optic stars." : "Starlight dimmed.");
      break;
    case "screens":
      el.screensArt.classList.toggle("playing", on);
      audio.whoosh(0.7);
      showToast(on ? "Rear theatre screens deployed." : "Theatre screens stowed.");
      break;
    case "privacy":
      el.dividerArt.classList.toggle("frost", on);
      audio.whoosh(0.8);
      showToast(on ? "Privacy glass raised and frosted." : "Privacy glass lowered.");
      break;
    case "cooler":
      el.coolerArt.classList.toggle("chilled", on);
      if (on) audio.cork();
      showToast(on ? "Champagne cooler chilling to 6°C." : "Cooler off.");
      break;
    case "tables":
      showToast(on ? "Picnic tables lowered." : "Picnic tables folded away.");
      audio.motor(0.5);
      break;
    case "rearMassage":
      showToast(on ? "Rear massage running." : "Rear massage off.");
      if (on) audio.motor(0.6);
      break;
  }
}

function adjustSeat(delta) {
  state.frontRecline = clamp(state.frontRecline + delta, -6, 26);
  audio.motor(0.45);
  showToast(`Seat recline ${state.frontRecline}°.`);
}

function recallMemoryOne() {
  state.frontRecline = 4;
  state.cool = true;
  state.heat = false;
  applyFunctionEffect("cool", true);
  audio.motor(0.7);
  showToast("Memory I recalled: seat, mirrors, climate.");
}

function toggleGallery() {
  state.galleryLit = !state.galleryLit;
  el.cockpitStatus.textContent = state.galleryLit ? "The Gallery illuminated behind glass" : "The Gallery dimmed";
  showToast(state.galleryLit ? "The Gallery illuminated." : "The Gallery dimmed.");
}

function cycleRearRecline() {
  state.rearRecline = state.rearRecline >= 22 ? 0 : state.rearRecline + 11;
  audio.motor(0.6);
  showToast(`Rear lounge recline ${state.rearRecline}°.`);
}

Object.assign(app, {
  setToggle,
  applyFunctionEffect,
  adjustSeat,
  recallMemoryOne,
  toggleGallery,
  cycleRearRecline
});
