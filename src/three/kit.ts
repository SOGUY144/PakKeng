import * as THREE from "three";
import type { Tier } from "./gfx";

export interface ClayOpts {
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  roughness?: number;
  vertexColors?: boolean;
  doubleSide?: boolean;
  depthWrite?: boolean;
}

/**
 * ทรัพยากร GPU ที่ใช้ร่วมกันในหนึ่ง canvas: วัสดุ “ดินปั้น”, geometry และ texture
 * สร้างครั้งเดียวต่อ key แล้ว dispose ทั้งหมดเมื่อฉากถูกปิด (ไม่ให้หน่วยความจำค้างเมื่อเปลี่ยนหน้า)
 * ระดับ low ใช้ MeshLambertMaterial และ geometry ที่ละเอียดน้อยลง
 */
export class Kit {
  readonly tier: Tier;
  private mats = new Map<string, THREE.Material>();
  private geos = new Map<string, THREE.BufferGeometry>();
  private texs = new Map<string, THREE.Texture>();
  private owned: { dispose(): void }[] = [];

  constructor(tier: Tier) {
    this.tier = tier;
  }

  /** Round-shape detail for this tier. */
  get seg(): { w: number; h: number } {
    return this.tier === "high" ? { w: 28, h: 20 } : this.tier === "medium" ? { w: 22, h: 16 } : { w: 16, h: 12 };
  }

  clay(color: string, o: ClayOpts = {}): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial {
    const key = `clay|${color}|${JSON.stringify(o)}`;
    let m = this.mats.get(key) as THREE.MeshStandardMaterial | THREE.MeshLambertMaterial | undefined;
    if (!m) {
      const base = {
        color: o.vertexColors ? "#ffffff" : color,
        emissive: o.emissive ?? "#000000",
        emissiveIntensity: o.emissiveIntensity ?? 1,
        transparent: o.opacity !== undefined && o.opacity < 1,
        opacity: o.opacity ?? 1,
        vertexColors: o.vertexColors ?? false,
        side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
        depthWrite: o.depthWrite ?? true,
      };
      m =
        this.tier === "low"
          ? new THREE.MeshLambertMaterial(base)
          : new THREE.MeshStandardMaterial({ ...base, roughness: o.roughness ?? 0.82, metalness: 0 });
      this.mats.set(key, m);
    }
    return m;
  }

  /** Unlit material (sparkles, glows, sky decals). */
  basic(color: string, opacity = 1, additive = false): THREE.MeshBasicMaterial {
    const key = `basic|${color}|${opacity}|${additive}`;
    let m = this.mats.get(key) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1 || additive,
        opacity,
        depthWrite: !(opacity < 1 || additive),
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.mats.set(key, m);
    }
    return m;
  }

  geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
    let g = this.geos.get(key) as T | undefined;
    if (!g) {
      g = make();
      this.geos.set(key, g);
    }
    return g;
  }

  tex<T extends THREE.Texture>(key: string, make: () => T): T {
    let t = this.texs.get(key) as T | undefined;
    if (!t) {
      t = make();
      this.texs.set(key, t);
    }
    return t;
  }

  /** Register something created outside the caches (per-instance materials) for disposal with the scene. */
  own<T extends { dispose(): void }>(thing: T): T {
    this.owned.push(thing);
    return thing;
  }

  sphere(): THREE.SphereGeometry {
    const { w, h } = this.seg;
    return this.geo("sphere", () => new THREE.SphereGeometry(1, w, h));
  }

  /** Coarse sphere for tiny details (eyes, cheeks, buttons): same look at a fraction of the triangles. */
  sphereLo(): THREE.SphereGeometry {
    return this.geo("sphere-lo", () => new THREE.SphereGeometry(1, 12, 8));
  }

  /** Pick the sphere detail from the part's on-model size. */
  ball(size: number): THREE.SphereGeometry {
    return size < 0.09 ? this.sphereLo() : this.sphere();
  }

  /** Unit hemisphere (dome), flat side down. */
  dome(): THREE.SphereGeometry {
    const { w, h } = this.seg;
    return this.geo("dome", () => new THREE.SphereGeometry(1, w, Math.ceil(h / 2), 0, Math.PI * 2, 0, Math.PI / 2));
  }

  capsule(radius: number, length: number): THREE.CapsuleGeometry {
    const { w } = this.seg;
    return this.geo(`capsule|${radius}|${length}`, () => new THREE.CapsuleGeometry(radius, length, 6, Math.max(10, w - 8)));
  }

  cylinder(rTop: number, rBottom: number, height: number, radial = 0): THREE.CylinderGeometry {
    const r = radial || Math.max(10, this.seg.w - 6);
    return this.geo(`cyl|${rTop}|${rBottom}|${height}|${r}`, () => new THREE.CylinderGeometry(rTop, rBottom, height, r));
  }

  torus(radius: number, tube: number, arc = Math.PI * 2): THREE.TorusGeometry {
    const { w } = this.seg;
    return this.geo(`torus|${radius}|${tube}|${arc}`, () => new THREE.TorusGeometry(radius, tube, 8, Math.max(16, w + 4), arc));
  }

  plane(): THREE.PlaneGeometry {
    return this.geo("plane", () => new THREE.PlaneGeometry(1, 1));
  }

  /** Soft round contact shadow (radial gradient), drawn flat on the ground. */
  blobTexture(): THREE.CanvasTexture {
    return this.tex("blob", () => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, "rgba(58,44,70,0.55)");
      grd.addColorStop(0.55, "rgba(58,44,70,0.28)");
      grd.addColorStop(1, "rgba(58,44,70,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
  }

  blobMaterial(key = "default", opacity = 1): THREE.MeshBasicMaterial {
    const k = `blob|${key}`;
    let m = this.mats.get(k) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        map: this.blobTexture(),
        transparent: true,
        opacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      this.mats.set(k, m);
    }
    return m;
  }

  dispose(): void {
    this.mats.forEach((m) => m.dispose());
    this.geos.forEach((g) => g.dispose());
    this.texs.forEach((t) => t.dispose());
    this.owned.forEach((o) => o.dispose());
    this.mats.clear();
    this.geos.clear();
    this.texs.clear();
    this.owned = [];
  }
}
