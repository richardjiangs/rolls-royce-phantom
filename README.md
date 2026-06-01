# Rolls-Royce Phantom

### The Phantom World — modular Web prototype

---

## Running The Project

This is now a modular Web project. Open `index.html` through a local server so ES modules load correctly.

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:5173/
```

For a quick project sanity check:

```bash
npm run smoke
```

No package installation is required for the current scripts.

## Project Structure

- `index.html` is the current entry point.
- `src/styles/main.css` contains the extracted styling.
- `src/main.js` boots the simulation.
- `src/data/` owns portable vehicle and destination data.
- `src/app/context.js` owns shared runtime state, DOM lookup, and utilities.
- `src/audio/audio-engine.js` owns Web Audio.
- `src/vehicle/physics.js` owns vehicle behavior, route planning, chauffeur logic, and physics.
- `src/render/` owns Canvas and SVG rendering modules.
- `src/ui/controls.js` is the UI entry module.
- `src/ui/events.js` binds DOM, keyboard, touch, media upload, and start-screen events.
- `src/ui/vehicle-actions.js` owns doors, gears, ride mode, destinations, chauffeur, cruise, windows, and reset actions.
- `src/ui/cabin-features.js` owns seat, Gallery, Starlight, rear-suite, and audio feature effects.
- `src/ui/voice-commands.js` owns Whispers command parsing.
- `src/ui/hud.js` owns per-frame HUD, readout, and button-state synchronization.
- `src/ui/media-status.js` owns small media status label helpers.
- `docs/ARCHITECTURE.md` explains the module layout.
- `docs/GODOT_MIGRATION.md` explains how this Web prototype should stay useful for a future Godot 3D game.

The legacy single-file build remains as `Rolls Royce Phantom v2B.html` for comparison while the modular version stabilizes.

---

## Experience Brief

There is a particular silence that arrives when you close the door of a Phantom. The
world outside does not stop; it simply stops mattering. Everything in these pages exists
to protect that silence, and to put the whole of it under your right hand.

Your Phantom is finished in Arctic White over a black roof, with a single gold coachline
drawn by hand from the headlamp to the tail. The wheels are 22 inches, part-polished. The
Spirit of Ecstasy stands at the prow and lowers into the grille when you wish her out of
sight. Inside: navy leather, open-pore Canadel panelling, the Starlight Headliner overhead,
and The Gallery set behind glass across the fascia. None of it is decoration. All of it
answers to you.

---

## Taking your seat

Press **Enter the Phantom**. The 6.75-litre V12 wakes — you will feel it more than hear it
— and the doors draw themselves shut. From here the choice is yours: take the wheel, or
give it to your chauffeur.

If you have never driven a motor car of this size, do not concern yourself. The Phantom
shrinks around you the moment it moves.

## Driving, should you wish to

The pedals are where you expect them. **W** or the up arrow calls for power; **S**, the down
arrow, or the spacebar asks for the brakes; **A** and **D** turn the wheel. The gears sit
under your fingers — **P R N D** — and the eight-speed gearbox does the rest, reading the
road ahead and holding a gear through a bend rather than fussing over it.

What you have under your foot is 900 Nm, all of it available from a fast idle. Ask for
everything and the Phantom gathers itself and reaches 60 mph in a little over five seconds,
without drama and without ever feeling hurried. It will run to 155 mph, where it is asked,
politely, to stop. The point was never the numbers. The point is that the effort is always
somewhere below you, never in the cabin.

Touch the **horn** with **H**. It is a twin-tone, and it is the only loud thing about the car.

Adaptive cruise holds the centre lane and follows traffic at the set speed. If you want
the car to choose an overtaking line by itself, summon the chauffeur.

Lane centring also has a high-speed guardian: if you keep accelerating into a bend, it
eases power and adds discreet braking so the car can stay on the road instead of trying to
steer through more speed than the tyres can carry.

## Your chauffeur

Open **Navigation** and name a destination — the White Palace, the Opera House, the Marina,
your private airport, the club. Your chauffeur takes the wheel at once, draws the doors shut,
and sets off. You may also simply tell him: type *“Take me to the White Palace”* into the
console and sit back.

He drives as a Rolls-Royce chauffeur should. On the open road he travels at the pace of the
road, not a timid crawl. He reads the corners and eases for them before you would think to.
He keeps his distance from the car ahead. He uses the brakes only when they are wanted, and
when he does you will scarcely notice. As you arrive he brings the Phantom to rest and
presents the rear door. The route, the distance remaining, and the time to arrival are all
on the screen, drawn across the city as he drives it.

## Two characters: Magic Carpet and Sport

The Phantom keeps two temperaments, and you change between them with a single control.

**Magic Carpet Ride** is the one it is famous for. The suspension is fed by a camera that
watches the road and prepares the car for what is coming, so that expansion joints, coarse
tarmac and the general rudeness of the world simply do not reach you. The cabin stays level
and still. This is the Phantom at its truest.

**Sport** lets the road back in — deliberately. The dampers firm up, the body settles onto
its outside wheels through a corner, and the V12 finds a voice it otherwise keeps to itself.
You will feel the surface and the gearchanges. It is a different motor car for a different
mood, and it is there the moment you want it.

## The cabin

The driver's seat heats, ventilates and massages, and remembers how you like it under
**Memory I**. Warm the leather and it warms; ask for ventilation and cool air draws through
the perforations. Recline it, or set it upright again, as the journey asks.

**The Gallery** — the commissioned artwork behind the glass fascia — lights at your command.
The **Starlight Headliner** brings 1,340 fibre-optic stars to the roof above you. And
**Bespoke Audio** turns the cabin into a small concert hall; leave it off, and you have the
famous Phantom quiet instead. Both are worth having.

## The rear suite

Behind the privacy divider, the rear of the Phantom is a room of its own. The lounge seats
recline and massage. The theatre screens deploy. The picnic tables fold down from the seat
backs. The privacy glass rises and frosts at a touch. And the cooler between the seats keeps
a bottle at temperature, with the flutes beside it — the cork is the only report you will
hear.

## The coachwork

The coach doors — rear-hinged, as they have always been — open and close under power, and
will not open while the car is moving. The Spirit of Ecstasy rises and retracts. An umbrella
waits in each door. The laser headlamps light the road far further than you will ever need,
and a night-vision watch keeps an eye out for anything, or anyone, ahead in the dark.

## Whispers

Your concierge answers to plain speech. Open the Navigation console and tell it what you
want — a destination, *“sport mode”*, *“close the doors”*, *“starlight on”*, *“chill the
champagne”*. It does the thing rather than describing it.

---

## At a glance

| | |
|---|---|
| Engine | 6.75 L twin-turbocharged V12 |
| Power | 563 PS (420 kW) |
| Torque | 900 Nm, from a fast idle |
| Gearbox | 8-speed, satellite-aided |
| 0–60 mph | ~5.3 seconds |
| 0–100 km/h | ~5.4 seconds |
| Maximum speed | 155 mph, governed |
| Suspension | self-levelling air, camera-fed (Magic Carpet Ride) |
| Wheels | 22-inch, part-polished |

---

## A practical page

This is a modular Web prototype. Run the local server and open **`index.html`** through
the served URL. Sound begins the moment you enter the Phantom, as your browser intends, so
a pair of good speakers or headphones is the only thing worth adding. On a phone or tablet,
a small set of touch controls appears for driving; everything else is where it is on the
larger screen.

The whole of it — the V12 and its voice, the way the car gathers speed and the way it brakes,
the chauffeur's judgement, the cars and the city around you — is computed in real time, here,
as you watch. Nothing is a recording.

*Welcome to Phantom. It was built around you.*
