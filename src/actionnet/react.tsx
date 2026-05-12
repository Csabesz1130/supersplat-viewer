// React wrapper around mount().
//
// Consumers in actionnet-ai import this directly:
//
//   import { SupersplatViewer } from '@playcanvas/supersplat-viewer/actionnet/react';
//
// The wrapper imports the upstream html/css/js strings lazily so SSR builds
// don't try to evaluate the PlayCanvas bundle at import time.

import * as React from 'react';
import type { MountOptions, ViewerHandle, ViewerEvent, CameraPose } from './mount';
import { mount } from './mount';
import type { OverlayBundle } from './overlays';
import type { Mat4 } from './world';

export interface SupersplatViewerProps extends Omit<MountOptions, 'overlays' | 'worldTransform' | 'camera'> {
    overlays?: OverlayBundle;
    worldTransform?: Mat4;
    camera?: CameraPose;
    /** Forwarded to a transient scrubTo() on each change; pair with controlled timeline state. */
    time?: number;
    onReady?: () => void;
    onFirstFrame?: (duration: number) => void;
    onScrub?: (time: number) => void;
    onCamera?: (pose: CameraPose) => void;
    onError?: (message: string) => void;
    className?: string;
    style?: React.CSSProperties;
}

async function loadSources() {
    // Upstream exports { html, css, js } from the package root.
    // Importing dynamically keeps the heavy strings out of SSR builds.
    const mod: { html: string; css: string; js: string } = await import('..');
    return { html: mod.html, css: mod.css, js: mod.js };
}

export function SupersplatViewer(props: SupersplatViewerProps) {
    const hostRef = React.useRef<HTMLDivElement | null>(null);
    const handleRef = React.useRef<ViewerHandle | null>(null);
    const propsRef = React.useRef(props);
    propsRef.current = props;

    React.useEffect(() => {
        let cancelled = false;
        let unsubscribe: (() => void) | undefined;
        (async () => {
            const sources = await loadSources();
            if (cancelled || !hostRef.current) return;
            const handle = mount(hostRef.current, {
                contentUrl: props.contentUrl,
                settingsUrl: props.settingsUrl,
                collisionUrl: props.collisionUrl,
                noUi: props.noUi,
                webgpu: props.webgpu,
                overlays: props.overlays,
                worldTransform: props.worldTransform,
                camera: props.camera,
                hostOrigin: props.hostOrigin,
                authToken: props.authToken
            }, sources);
            handleRef.current = handle;
            unsubscribe = handle.on((e: ViewerEvent) => {
                const p = propsRef.current;
                if (e.type === 'ready') p.onReady?.();
                else if (e.type === 'first-frame') p.onFirstFrame?.(e.duration);
                else if (e.type === 'scrub') p.onScrub?.(e.time);
                else if (e.type === 'camera') p.onCamera?.(e.pose);
                else if (e.type === 'error') p.onError?.(e.message);
            });
        })();
        return () => {
            cancelled = true;
            unsubscribe?.();
            handleRef.current?.dispose();
            handleRef.current = null;
        };
        // Re-mount only when the underlying asset changes; other props are pushed via commands below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.contentUrl, props.settingsUrl, props.collisionUrl, props.webgpu, props.noUi]);

    React.useEffect(() => {
        if (handleRef.current && props.overlays) handleRef.current.setOverlays(props.overlays);
    }, [props.overlays]);
    React.useEffect(() => {
        if (handleRef.current && props.worldTransform) handleRef.current.setWorldTransform(props.worldTransform);
    }, [props.worldTransform]);
    React.useEffect(() => {
        if (handleRef.current && props.camera) handleRef.current.setCamera(props.camera);
    }, [props.camera]);
    React.useEffect(() => {
        if (handleRef.current && typeof props.time === 'number') handleRef.current.scrubTo(props.time);
    }, [props.time]);

    return <div ref={hostRef} className={props.className} style={{ width: '100%', height: '100%', ...props.style }} />;
}
