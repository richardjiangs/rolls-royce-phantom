import "../app/context.js";

const app = window.PhantomApp;

const studioNowPlaying = document.getElementById("studioNowPlaying");
const engineSoundStatus = document.getElementById("engineSoundStatus");

function setNowPlaying(text, live) {
  if (!studioNowPlaying) return;
  studioNowPlaying.textContent = text;
  studioNowPlaying.classList.toggle("live", !!live);
}

function setEngineStatus(text) {
  if (engineSoundStatus) engineSoundStatus.textContent = text;
}

Object.assign(app, {
  setNowPlaying,
  setEngineStatus,
  studioNowPlaying,
  engineSoundStatus
});
