import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "index.html",
  "src/main.js",
  "src/data/vehicle-spec.js",
  "src/data/destinations.js",
  "src/app/context.js",
  "src/audio/audio-engine.js",
  "src/vehicle/physics.js",
  "src/render/city.js",
  "src/render/map.js",
  "src/render/art.js",
  "src/ui/vehicle-actions.js",
  "src/ui/media-status.js",
  "src/ui/cabin-features.js",
  "src/ui/voice-commands.js",
  "src/ui/hud.js",
  "src/ui/events.js",
  "src/ui/controls.js",
  "src/styles/main.css"
];

for (const file of requiredFiles) {
  if (!existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

for (const file of requiredFiles.filter((file) => file.endsWith(".js"))) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

const index = readFileSync("index.html", "utf8");
if (!index.includes('src="./src/main.js"')) throw new Error("index.html does not load src/main.js");
if (!index.includes('href="./src/styles/main.css"')) throw new Error("index.html does not load main.css");

installDomMock();
await import(`../src/main.js?smoke=${Date.now()}`);
if (!globalThis.PhantomApp) throw new Error("PhantomApp was not created during module import");
for (const fn of ["updatePhysics", "updateUi", "setGear", "setToggle", "processVoice", "bindUiEvents"]) {
  if (typeof globalThis.PhantomApp[fn] !== "function") throw new Error(`Missing app function after import: ${fn}`);
}

console.log("Smoke check passed.");

function installDomMock() {
  const nodes = new Map();
  const fakeContext = {
    arc() {},
    arcTo() {},
    beginPath() {},
    clearRect() {},
    closePath() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    ellipse() {},
    fill() {},
    fillRect() {},
    fillText() {},
    getImageData() { return { data: [0, 0, 0, 255] }; },
    lineTo() {},
    measureText() { return { width: 0 }; },
    moveTo() {},
    restore() {},
    rotate() {},
    save() {},
    setTransform() {},
    stroke() {},
    strokeRect() {},
    translate() {}
  };

  function node(id) {
    return {
      id,
      dataset: {},
      style: { setProperty() {} },
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      children: [],
      textContent: "",
      innerHTML: "",
      value: "0",
      width: 1280,
      height: 720,
      clientWidth: 300,
      clientHeight: 380,
      addEventListener() {},
      appendChild() {},
      setAttribute() {},
      getContext() { return fakeContext; }
    };
  }

  globalThis.document = {
    body: node("body"),
    documentElement: node("html"),
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, node(id));
      return nodes.get(id);
    },
    querySelectorAll() { return []; },
    createElement(tag) { return node(tag); }
  };
  globalThis.window = globalThis;
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
  globalThis.performance = { now: () => 0 };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.AudioContext = undefined;
  globalThis.webkitAudioContext = undefined;
  globalThis.URL = { createObjectURL() { return ""; }, revokeObjectURL() {} };
  globalThis.addEventListener = () => {};
}
