# Future Godot Migration Notes

The long-term target is a real 3D game. The Web version should therefore act as a gameplay prototype, not as a permanent technical constraint.

## Keep Portable

These areas should remain easy to migrate:

- Vehicle specification and tuning values.
- Transmission and torque behavior.
- Chauffeur, adaptive cruise, lane choice, and corner speed planning.
- Destination data and route metadata.
- Cabin feature state: doors, lights, seats, privacy, audio, Starlight, Gallery, and rear suite controls.
- UI/HUD information model.

## Expect To Rebuild

These areas will be rebuilt in Godot rather than translated directly:

- HTML and CSS layout.
- Canvas drawing code.
- Web Audio graph details.
- DOM event bindings.
- Browser file-upload behavior.
- Any future Three.js or Babylon.js scene graph if this Web prototype gains 3D before migration.

## Suggested Godot Mapping

- `src/data/*` -> Godot resources or JSON data.
- `src/app/context.js` -> Godot autoload or main game singleton.
- `src/vehicle/physics.js` -> GDScript or C# vehicle controller modules.
- `src/render/*` -> Godot 3D scenes, cameras, lights, materials, and environment.
- `src/ui/events.js` -> Godot `InputMap`, signal connections, and UI scene event bindings.
- `src/ui/vehicle-actions.js` -> Godot gameplay action services or controller methods.
- `src/ui/cabin-features.js` -> Godot cabin interaction controllers and animation/audio triggers.
- `src/ui/voice-commands.js` -> Godot command parser or concierge controller.
- `src/ui/hud.js` -> Godot `Control` HUD scene synchronization.
- `src/ui/media-status.js` -> Godot UI label helpers or audio panel state.
- `src/audio/audio-engine.js` -> Godot audio buses, sample players, procedural audio where useful.

## Migration Strategy

1. Keep the Web version playable while features are explored.
2. Stabilize the vehicle feel and cabin feature set in Web.
3. Start a separate Godot project once the core game loop is clear.
4. Port portable modules concept by concept, not line by line.
5. Replace presentation systems with native Godot scenes and assets.
