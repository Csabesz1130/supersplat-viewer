// ActionNet overlay schema.
//
// Overlays are timeline-driven decorations that the viewer renders on top of the
// splat (polylines, markers, labels, floor heatmaps). ActionNet uses them to
// project policy trajectories, gripper events, CSI heatmaps and ambient-health
// glyphs into the reconstructed scene without forking the viewer's render loop.

export type Vec3 = [number, number, number];
export type Rgba = [number, number, number, number];

export interface OverlayCommon {
    id: string;
    /** Seconds from t=0 (matches window.animationDuration). */
    tStart?: number;
    tEnd?: number;
    /** Optional world-frame transform applied before rendering. 4x4 column-major. */
    transform?: number[];
}

export interface PolylineOverlay extends OverlayCommon {
    kind: 'polyline';
    points: Vec3[];
    color?: Rgba;
    width?: number;
    /** When set, points are revealed progressively between tStart..tEnd. */
    animate?: boolean;
}

export interface MarkerOverlay extends OverlayCommon {
    kind: 'marker';
    position: Vec3;
    color?: Rgba;
    size?: number;
    /** Optional sprite name (e.g. 'gripper-open', 'gripper-close', 'fall'). */
    icon?: string;
}

export interface LabelOverlay extends OverlayCommon {
    kind: 'label';
    position: Vec3;
    text: string;
    color?: Rgba;
}

export interface HeatmapOverlay extends OverlayCommon {
    kind: 'heatmap';
    /** Plane is anchored at `origin`, axes are u (right) and v (forward), both in world units. */
    origin: Vec3;
    u: Vec3;
    v: Vec3;
    /** Row-major samples in [0,1]; renderer maps via the colorRamp below. */
    samples: number[];
    cols: number;
    rows: number;
    colorRamp?: 'viridis' | 'magma' | 'turbo';
    opacity?: number;
}

export type Overlay =
    | PolylineOverlay
    | MarkerOverlay
    | LabelOverlay
    | HeatmapOverlay;

export interface OverlayBundle {
    /** Schema version, bumped when the shape changes in a breaking way. */
    version: 1;
    items: Overlay[];
}

export const EMPTY_OVERLAY_BUNDLE: OverlayBundle = { version: 1, items: [] };

export function validateOverlayBundle(input: unknown): OverlayBundle {
    if (!input || typeof input !== 'object') {
        throw new Error('Overlay bundle must be an object');
    }
    const obj = input as Record<string, unknown>;
    if (obj.version !== 1) {
        throw new Error(`Unsupported overlay bundle version: ${String(obj.version)}`);
    }
    if (!Array.isArray(obj.items)) {
        throw new Error('Overlay bundle .items must be an array');
    }
    for (const item of obj.items) {
        if (!item || typeof item !== 'object') {
            throw new Error('Each overlay must be an object');
        }
        const k = (item as { kind?: string }).kind;
        if (k !== 'polyline' && k !== 'marker' && k !== 'label' && k !== 'heatmap') {
            throw new Error(`Unknown overlay.kind: ${String(k)}`);
        }
    }
    return obj as unknown as OverlayBundle;
}
