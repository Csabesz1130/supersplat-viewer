// World-frame helpers.
//
// ActionNet stores a 4x4 column-major transform (scene_anchor) per scene that
// rotates/translates the splat from its raw COLMAP frame into ActionNet's robot
// frame (Z up, base of UR5 at origin, metres). These helpers keep the conversion
// in one place so policy traces, voxel collision meshes and CSI heatmaps all
// agree on coordinates.

export type Mat4 = number[]; // length 16, column-major
export type Vec3 = [number, number, number];

export const IDENTITY_MAT4: Mat4 = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
];

export function transformPoint(m: Mat4, p: Vec3): Vec3 {
    const [x, y, z] = p;
    return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14]
    ];
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
    const out: Mat4 = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            let v = 0;
            for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
            out[c * 4 + r] = v;
        }
    }
    return out;
}

export function invertRigid(m: Mat4): Mat4 {
    // Assumes m is a rigid transform (R | t); inverse is (R^T | -R^T t).
    const r00 = m[0], r10 = m[1], r20 = m[2];
    const r01 = m[4], r11 = m[5], r21 = m[6];
    const r02 = m[8], r12 = m[9], r22 = m[10];
    const tx = m[12], ty = m[13], tz = m[14];
    const itx = -(r00 * tx + r10 * ty + r20 * tz);
    const ity = -(r01 * tx + r11 * ty + r21 * tz);
    const itz = -(r02 * tx + r12 * ty + r22 * tz);
    return [
        r00, r01, r02, 0,
        r10, r11, r12, 0,
        r20, r21, r22, 0,
        itx, ity, itz, 1
    ];
}

export function isMat4(v: unknown): v is Mat4 {
    return Array.isArray(v) && v.length === 16 && v.every(x => typeof x === 'number' && Number.isFinite(x));
}
