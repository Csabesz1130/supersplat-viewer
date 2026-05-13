# ActionNet integration surface

Additive namespace under `@playcanvas/supersplat-viewer/actionnet`. None of the
upstream files (`src/viewer.ts`, `src/index.ts`, `src/module/index.ts`,
`rollup.config.mjs`, ...) are modified — the goal is to keep merges with
playcanvas/supersplat-viewer trivial.

## What it adds

- **`overlays.ts`** — schema + validator for timeline-driven decorations
  (polyline / marker / label / heatmap). ActionNet projects EE trajectories,
  gripper events, CSI heatmaps and ambient-health glyphs through this surface.
- **`world.ts`** — small 4x4 helpers for the `scene_anchor` transform that maps
  the splat's COLMAP frame into ActionNet's robot frame.
- **`mount.ts`** — `mount(el, opts, sources)` boots the upstream viewer inside
  a sandboxed iframe driven by `?content=` / `?settings=` / `?collision=` URL
  params and exposes a typed `ViewerHandle` (`scrubTo`, `setOverlays`,
  `setWorldTransform`, `setCamera`, `dispose`).
- **`react.tsx`** — `<SupersplatViewer />` React component that calls `mount`
  under the hood and forwards `onReady` / `onFirstFrame` / `onScrub` /
  `onCamera` / `onError`.

## Why an iframe

- PCUI ships its own SCSS; the iframe gives us style isolation.
- The viewer's resize observers don't fight the host page's layout.
- Each viewer instance can opt into WebGPU independently of the host page.
- Matches how `splat-transform`'s `.html` viewer export is consumed.

## Protocol

host → iframe: `{ ns: 'actionnet', cmd, ... }`  
iframe → host: `{ ns: 'actionnet', evt: 'ready'|'first-frame'|'scrub'|'camera'|'error', ... }`

Commands are forwarded through `iframe.contentWindow.postMessage`; events are
relayed back via `parent.postMessage`. The bridge is injected as a tiny
`<script>` ahead of the upstream bundle so it can wrap `window.firstFrame` and
proxy `window.scrubTo`.

A later phase wires the ambient_health, JEPASimulator and PipelineInspector
features in actionnet-ai through this same surface.
