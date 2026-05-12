// mount(el, opts) — embed the upstream supersplat-viewer into a host DOM element.
//
// Strategy: take the html/css/js strings exported by the upstream module entry
// (which the upstream viewer is designed to be templated with) and write them
// into a sandboxed iframe whose `?content=` and `?settings=` URL params are
// derived from the opts. We re-expose a typed handle so React callers don't
// have to know anything about postMessage or PlayCanvas internals.
//
// Why an iframe rather than mounting PlayCanvas directly in the host page:
//   - style isolation (PCUI ships its own SCSS)
//   - prevents the viewer's resize observers from fighting the host's layout
//   - matches how splat-transform's `.html` viewer export is consumed
//   - lets us swap in WebGPU per-instance via ?webgpu without polluting host gl
//
// Once the upstream module is loaded (window.firstFrame fires), we relay events
// to the caller and accept commands (scrubTo, setCamera, setOverlays, dispose).

import type { Overlay, OverlayBundle } from './overlays';
import { EMPTY_OVERLAY_BUNDLE, validateOverlayBundle } from './overlays';
import type { Mat4 } from './world';
import { IDENTITY_MAT4, isMat4 } from './world';

export interface CameraPose {
    position: [number, number, number];
    target: [number, number, number];
    fov?: number;
}

export interface MountOptions {
    /** URL of the splat asset (.ply / .compressed.ply / .sog). */
    contentUrl: string;
    /** Optional settings.json URL. */
    settingsUrl?: string;
    /** Optional collision mesh (.voxel.json or .glb). */
    collisionUrl?: string;
    /** Hide built-in UI (annotations, hamburger). Recommended when embedding. */
    noUi?: boolean;
    /** Prefer WebGPU when available. */
    webgpu?: boolean;
    /** Initial overlays. */
    overlays?: OverlayBundle;
    /** Initial scene_anchor (4x4 col-major). */
    worldTransform?: Mat4;
    /** Initial camera pose. */
    camera?: CameraPose;
    /** Origin allowed to post commands back; defaults to current location.origin. */
    hostOrigin?: string;
    /** Optional auth token; forwarded via postMessage init for signed-URL refreshes. */
    authToken?: string;
}

export type ViewerEvent =
    | { type: 'ready' }
    | { type: 'first-frame'; duration: number }
    | { type: 'scrub'; time: number }
    | { type: 'camera'; pose: CameraPose }
    | { type: 'error'; message: string };

export interface ViewerHandle {
    /** Move the playhead. */
    scrubTo(time: number): void;
    /** Replace all overlays. */
    setOverlays(overlays: OverlayBundle): void;
    /** Update the scene -> robot world transform. */
    setWorldTransform(m: Mat4): void;
    /** Drive the camera. */
    setCamera(pose: CameraPose): void;
    /** Subscribe to lifecycle events. */
    on(handler: (e: ViewerEvent) => void): () => void;
    /** Tear down the iframe and listeners. */
    dispose(): void;
}

// The upstream viewer exposes window.scrubTo / window.animationDuration on its
// global once firstFrame fires. We tunnel commands through a tiny postMessage
// shim that we inject alongside the upstream js.
//
// MESSAGE PROTOCOL (host <-> iframe):
//   host -> iframe : { ns: 'actionnet', cmd: 'scrubTo'|'setOverlays'|'setWorldTransform'|'setCamera', ... }
//   iframe -> host : { ns: 'actionnet', evt: 'ready'|'first-frame'|'scrub'|'camera'|'error', ... }

const NS = 'actionnet';

function buildSrcDoc(opts: MountOptions, html: string, css: string, js: string): string {
    const initJson = JSON.stringify({
        contentUrl: opts.contentUrl,
        settingsUrl: opts.settingsUrl,
        collisionUrl: opts.collisionUrl,
        noUi: !!opts.noUi,
        webgpu: !!opts.webgpu,
        overlays: opts.overlays ?? EMPTY_OVERLAY_BUNDLE,
        worldTransform: opts.worldTransform ?? IDENTITY_MAT4,
        camera: opts.camera ?? null,
        authToken: opts.authToken ?? null,
        hostOrigin: opts.hostOrigin ?? '*'
    });

    // We inline a small bridge that:
    //  1. boots the upstream viewer via the html/css/js strings,
    //  2. forwards postMessage commands once window.firstFrame fires,
    //  3. relays scrub / camera events back to the host.
    const bridge = `<script>(function(){
        const INIT = ${initJson};
        const HOST = INIT.hostOrigin || '*';
        function post(evt, extra){ parent.postMessage(Object.assign({ ns: ${JSON.stringify(NS)}, evt }, extra||{}), HOST); }
        window.addEventListener('error', function(e){ post('error', { message: String(e.message||e) }); });
        // Drive upstream's URL-param surface by stuffing values into location.search
        // BEFORE the upstream bundle parses it.
        try {
            const sp = new URLSearchParams();
            if (INIT.contentUrl) sp.set('content', INIT.contentUrl);
            if (INIT.settingsUrl) sp.set('settings', INIT.settingsUrl);
            if (INIT.collisionUrl) sp.set('collision', INIT.collisionUrl);
            if (INIT.noUi) sp.set('noui', '1');
            if (INIT.webgpu) sp.set('webgpu', '1');
            history.replaceState({}, '', '?' + sp.toString());
        } catch (e) { /* iframe origin may be opaque; upstream handles defaults */ }
        // Stash init so the upstream viewer (or our overlay renderer) can read it.
        window.__actionnetInit = INIT;
        post('ready');
        // Once upstream's window.firstFrame fires we expose commands.
        const origFirstFrame = window.firstFrame;
        window.firstFrame = function(){
            try { if (typeof origFirstFrame === 'function') origFirstFrame.apply(this, arguments); } catch(e){}
            post('first-frame', { duration: Number(window.animationDuration) || 0 });
        };
        window.addEventListener('message', function(ev){
            const m = ev.data; if (!m || m.ns !== ${JSON.stringify(NS)}) return;
            try {
                if (m.cmd === 'scrubTo' && typeof window.scrubTo === 'function') { window.scrubTo(Number(m.time)||0); post('scrub', { time: Number(m.time)||0 }); }
                else if (m.cmd === 'setOverlays') { window.__actionnetOverlays = m.overlays; window.dispatchEvent(new CustomEvent('actionnet:overlays', { detail: m.overlays })); }
                else if (m.cmd === 'setWorldTransform') { window.__actionnetWorldTransform = m.transform; window.dispatchEvent(new CustomEvent('actionnet:world-transform', { detail: m.transform })); }
                else if (m.cmd === 'setCamera') { window.__actionnetCamera = m.pose; window.dispatchEvent(new CustomEvent('actionnet:camera', { detail: m.pose })); }
            } catch(e) { post('error', { message: String(e.message||e) }); }
        });
    })();<\/script>`;

    return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}${bridge}<script>${js}<\/script></body></html>`;
}

export function mount(host: HTMLElement, opts: MountOptions, sources: { html: string; css: string; js: string }): ViewerHandle {
    if (opts.overlays) validateOverlayBundle(opts.overlays);
    if (opts.worldTransform && !isMat4(opts.worldTransform)) {
        throw new Error('mount: worldTransform must be a 16-element column-major Mat4');
    }

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'border:0;width:100%;height:100%;display:block;background:#000;';
    iframe.setAttribute('allow', 'xr-spatial-tracking; fullscreen');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.srcdoc = buildSrcDoc(opts, sources.html, sources.css, sources.js);
    host.appendChild(iframe);

    const listeners = new Set<(e: ViewerEvent) => void>();
    const onMessage = (ev: MessageEvent) => {
        if (ev.source !== iframe.contentWindow) return;
        const m = ev.data;
        if (!m || m.ns !== NS || !m.evt) return;
        const evtType = m.evt as ViewerEvent['type'];
        let payload: ViewerEvent;
        if (evtType === 'first-frame') payload = { type: 'first-frame', duration: Number(m.duration) || 0 };
        else if (evtType === 'scrub') payload = { type: 'scrub', time: Number(m.time) || 0 };
        else if (evtType === 'camera') payload = { type: 'camera', pose: m.pose };
        else if (evtType === 'error') payload = { type: 'error', message: String(m.message || '') };
        else payload = { type: 'ready' };
        for (const l of listeners) l(payload);
    };
    window.addEventListener('message', onMessage);

    const send = (cmd: string, extra: Record<string, unknown> = {}) => {
        iframe.contentWindow?.postMessage({ ns: NS, cmd, ...extra }, '*');
    };

    return {
        scrubTo(time) { send('scrubTo', { time }); },
        setOverlays(overlays) { validateOverlayBundle(overlays); send('setOverlays', { overlays }); },
        setWorldTransform(transform) {
            if (!isMat4(transform)) throw new Error('setWorldTransform: expected Mat4');
            send('setWorldTransform', { transform });
        },
        setCamera(pose) { send('setCamera', { pose }); },
        on(handler) { listeners.add(handler); return () => listeners.delete(handler); },
        dispose() {
            window.removeEventListener('message', onMessage);
            listeners.clear();
            iframe.remove();
        }
    };
}

export type { Overlay, OverlayBundle, Mat4 };
