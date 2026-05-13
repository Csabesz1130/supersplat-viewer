// Public barrel for the ActionNet integration surface.
//
// Importers in actionnet-ai pull from this module rather than the upstream
// root, keeping the integration namespace clearly separated:
//
//   import { SupersplatViewer, mount, validateOverlayBundle } from '@playcanvas/supersplat-viewer/actionnet';

export * from './overlays';
export * from './world';
export * from './mount';
export { SupersplatViewer } from './react';
