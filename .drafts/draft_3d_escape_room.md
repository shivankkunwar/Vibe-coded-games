# Draft: 3D Escape Room Architecture (Vanilla Three.js)

## User Requirements
- True first-person 3D (WASD + Mouse look).
- Dark room "torch" aesthetic.
- Walk up to items, click to open HTML UI dialogs.
- NO REACT (Vanilla JS/Astro only).
- Client-side loading of compressed 3D assets to protect VPS.

## Technical Stack Selection (Prometheus)
Since we are avoiding React for the game itself:
1. **`three`**: Core 3D engine (Vanilla).
2. **Controls**: `PointerLockControls` (imported from `three/addons/controls/PointerLockControls.js`).
3. **Collision/Physics**: Since we aren't using React, we will use Three.js's built-in `Octree` and `Capsule` math utilities (used in their official FPS examples). This avoids heavy physics engine dependencies like Rapier or Ammo while providing perfect player-to-wall collision and sliding.
4. **Asset Loading**: `GLTFLoader` + `DRACOLoader` (compressed `.glb` files) with `THREE.LoadingManager` to render an HTML preloader.
5. **State/UI**: Vanilla JavaScript updating DOM elements directly (no Zustand, no React).

## Architecture
- `src/pages/games/escape-room-3d.astro`: Main page containing the `<canvas id="game-canvas">` and HTML UI overlays.
- `src/scripts/game3d/`:
  - `main.ts`: Entry point, setup Scene, Camera, WebGLRenderer, loop.
  - `player.ts`: Handles PointerLockControls, WASD inputs, and Capsule collision against the Octree.
  - `world.ts`: Loads the .glb levels, adds meshes to the Octree.
  - `interact.ts`: Runs a `Raycaster` from the center of the camera to detect glowing/clickable objects.
  - `ui.ts`: Handles the preloader progress bar, inventory DOM updates, and puzzle modals.
