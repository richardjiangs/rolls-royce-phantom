import './map.js';

const app = window.PhantomApp;
const { el } = app;

  /* ============================================================================
     STATIC SVG ART — exterior & cabin
     ============================================================================ */
  function injectArt() {
    // Exterior coachwork is static markup in the body (restored v1B look); nothing to inject here.

    el.cabinArt.innerHTML = `
    <svg viewBox="0 0 1000 360" role="img" aria-label="Phantom cabin">
      <defs>
        <linearGradient id="dashG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f26"/><stop offset="1" stop-color="#070809"/></linearGradient>
        <linearGradient id="woodG" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#5a331c"/><stop offset="0.3" stop-color="#7a4a28"/><stop offset="0.5" stop-color="#8a572f"/><stop offset="0.8" stop-color="#4d2b16"/><stop offset="1" stop-color="#6a3d22"/>
        </linearGradient>
        <linearGradient id="leatherG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e5d96"/><stop offset="1" stop-color="#0f3a63"/></linearGradient>
        <radialGradient id="galleryGlow" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#ecd398"/><stop offset="1" stop-color="#1a2230"/></radialGradient>
      </defs>
      <!-- headliner with starlight -->
      <rect x="0" y="0" width="1000" height="70" fill="#0c0f14"/>
      <g id="starsCabin" fill="#fff">
        ${starsField()}
      </g>
      <!-- dash -->
      <rect x="0" y="150" width="1000" height="210" fill="url(#dashG)"/>
      <!-- wood veneer band -->
      <rect x="70" y="158" width="860" height="34" rx="14" fill="#6a3d22"/>
      <rect x="70" y="158" width="860" height="34" rx="14" fill="url(#woodG)" opacity="0.55"/>
      <!-- The Gallery (glass-fronted fascia art) -->
      <g id="galleryG">
        <rect x="360" y="196" width="280" height="58" rx="8" fill="#0c121b" stroke="#cfd3d8" stroke-width="1.5"/>
        <rect id="galleryArt" x="368" y="204" width="264" height="42" rx="5" fill="url(#galleryGlow)" opacity="0.95"/>
        <path d="M372,232 Q430,206 500,224 T628,220" fill="none" stroke="#1a2230" stroke-width="2" opacity="0.5"/>
      </g>
      <!-- analogue clock -->
      <g transform="translate(700,225)">
        <circle r="26" fill="#0a0e14" stroke="#cfd3d8"/>
        <circle r="2" fill="#ecd398"/>
        <line id="clockHour" x1="0" y1="0" x2="0" y2="-12" stroke="#ecd398" stroke-width="2.6" stroke-linecap="round"/>
        <line id="clockMin" x1="0" y1="0" x2="0" y2="-18" stroke="#ecd398" stroke-width="1.6" stroke-linecap="round"/>
        <text x="0" y="18" text-anchor="middle" font-size="6" fill="#8a8" >ROLLS-ROYCE</text>
      </g>
      <!-- organ-stop vents -->
      <g fill="#cfd3d8">
        <circle cx="300" cy="225" r="6"/><circle cx="320" cy="225" r="6"/>
        <circle cx="680" cy="262" r="5"/><circle cx="720" cy="262" r="5"/>
      </g>
      <!-- central screen -->
      <rect x="455" y="262" width="90" height="40" rx="5" fill="#0a1722" stroke="#2a3a4a"/>
      <rect x="460" y="267" width="80" height="30" rx="3" fill="#143a63" opacity="0.6"/>
      <!-- steering wheel -->
      <g id="cabinWheelG" transform="translate(250,300)">
        <circle r="54" fill="none" stroke="#15181d" stroke-width="14"/>
        <circle r="54" fill="none" stroke="#3c424a" stroke-width="4"/>
        <line x1="0" y1="0" x2="0" y2="-50" stroke="#1b1f25" stroke-width="7"/>
        <line x1="0" y1="0" x2="-46" y2="12" stroke="#1b1f25" stroke-width="7"/>
        <line x1="0" y1="0" x2="46" y2="12" stroke="#1b1f25" stroke-width="7"/>
        <circle r="13" fill="#0a0c10" stroke="#c9a85f"/>
        <text x="0" y="4" text-anchor="middle" font-family="Georgia" font-size="11" fill="#ecd398">RR</text>
      </g>
      <!-- seats (blue quilted) flanking -->
      <g transform="translate(150,250)">
        <rect x="-44" y="-30" width="88" height="120" rx="22" fill="url(#leatherG)" stroke="rgba(255,255,255,0.12)"/>
        <path d="M-30,-20 L30,-20 M-30,4 L30,4 M-30,28 L30,28" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
      </g>
      <g transform="translate(850,250)">
        <rect x="-44" y="-30" width="88" height="120" rx="22" fill="url(#leatherG)" stroke="rgba(255,255,255,0.12)"/>
        <path d="M-30,-20 L30,-20 M-30,4 L30,4 M-30,28 L30,28" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
      </g>
    </svg>`;

    // Drivetrain (V12 + 8-speed gear stack) is static markup in the body (restored v1B look).
  }
  function starsField() {
    let s = "";
    for (let i = 0; i < 80; i++) { const x = (i * 137.5) % 1000, y = (i * 47.3) % 64 + 3, r = (i % 5 === 0) ? 1.4 : 0.8; s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r}"/>`; }
    return s;
  }


Object.assign(app, { injectArt, starsField });
