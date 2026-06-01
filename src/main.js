import './ui/controls.js';

const app = window.PhantomApp;
const { state, clamp, audio } = app;

function gameLoop(now) {
  const dt = clamp((now - state.lastTime) / 1000, 0, 0.05);
  state.lastTime = now;
  state.time += dt;
  app.updatePhysics(dt);
  app.drawCity();
  if (audio.ready) audio.update(state, dt);
  app.updateUi();
  requestAnimationFrame(gameLoop);
}

Object.assign(app, { gameLoop });

app.resizeCanvas();
app.injectArt();
app.buildCornersForRoute();
app.seedWorld();
app.updateDoorArt();
app.updateGearButtons();
app.setRide(true);
requestAnimationFrame(gameLoop);
