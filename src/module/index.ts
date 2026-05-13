import css from '../../public/index.css';
import html from '../../public/index.html';
import js from '../../public/index.js';

export { html, css, js };

// ActionNet integration surface.
//
// Consumers in actionnet-ai import the React wrapper, overlay schema, world
// transform helpers, and mount() from this subpath:
//
//   import {
//       SupersplatViewer,
//       mount,
//       validateOverlayBundle,
//       type OverlayBundle,
//       type Mat4,
//   } from '@playcanvas/supersplat-viewer/actionnet';
//
// The re-exports below also make the surface visible from the root entry
// (`@playcanvas/supersplat-viewer`), which is convenient for downstream apps
// that don't want to deal with subpath exports configuration.
export * from '../actionnet';
