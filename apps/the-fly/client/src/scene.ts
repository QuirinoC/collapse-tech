import * as THREE from "three";
import { DOME, WATER_DISH, type FoodItem, type Snapshot } from "../../src/protocol";

interface Sample {
  t: number;
  pose: Snapshot["fly"];
}

const PIXEL_CAP = 1.4;
const FLY_SCALE = 3.15;
const ORBIT_SENS = 0.0054;
const ORBIT_PITCH_MIN = 0.16;
const ORBIT_PITCH_MAX = 1.18;
const ORBIT_DRAG_SLOP = 2.5;
const scratchQuatA = new THREE.Quaternion();
const scratchQuatB = new THREE.Quaternion();
const scratchPose: Snapshot["fly"] = {
  x: 0,
  y: DOME.floorY,
  z: 0,
  qx: 0,
  qy: 0,
  qz: 0,
  qw: 1,
  locomotion: "walk",
  wingPhase: 0,
  speed: 0,
};

const SKY_DIM = new THREE.Color(0x8f9aa3);
const SKY_NOON = new THREE.Color(0xd4dee3);
const FLOOR_DIM = new THREE.Color(0x8a7a66);
const FLOOR_NOON = new THREE.Color(0xb39a7c);

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * (1 - Math.exp(-lambda * dt));
}

function slerpInto(
  out: THREE.Quaternion,
  a: { x: number; y: number; z: number; w: number },
  b: { x: number; y: number; z: number; w: number },
  t: number,
): THREE.Quaternion {
  scratchQuatA.set(a.x, a.y, a.z, a.w);
  scratchQuatB.set(b.x, b.y, b.z, b.w);
  return out.copy(scratchQuatA.slerp(scratchQuatB, t));
}

function shortestPhase(a: number, b: number): number {
  let d = b - a;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

function wingShape(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.016, 0.02, 0.055, 0.034, 0.1, 0.014);
  shape.bezierCurveTo(0.128, 0.002, 0.12, -0.016, 0.092, -0.022);
  shape.bezierCurveTo(0.048, -0.028, 0.014, -0.012, 0, 0);
  return new THREE.ShapeGeometry(shape, 7);
}

function buildFly(): THREE.Group {
  const fly = new THREE.Group();
  const body = new THREE.Group();

  const abdomenMat = new THREE.MeshLambertMaterial({ color: 0x3a3228 });
  const bandMat = new THREE.MeshLambertMaterial({ color: 0xb08950 });
  const thoraxMat = new THREE.MeshLambertMaterial({ color: 0x2a211a });
  const headMat = new THREE.MeshLambertMaterial({ color: 0x1c1612 });
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0xf01818 });
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xfff0e4 });
  const limbMat = new THREE.MeshLambertMaterial({ color: 0x14110e });
  const wingMat = new THREE.MeshBasicMaterial({
    color: 0xf6fbf8,
    transparent: true,
    opacity: 0.58,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), abdomenMat);
  tip.scale.set(0.88, 0.92, 1.35);
  tip.position.set(0, 0, -0.062);
  const band = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), bandMat);
  band.scale.set(1.18, 1.22, 1.05);
  band.position.set(0, 0.001, -0.038);
  const rump = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), abdomenMat);
  rump.scale.set(1.12, 1.16, 1.08);
  rump.position.set(0, 0.002, -0.016);
  body.add(tip, band, rump);

  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.018, 9, 7), thoraxMat);
  thorax.scale.set(1.42, 1.22, 1.28);
  thorax.position.set(0, 0.008, 0.018);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 5), thoraxMat);
  hump.position.set(0, 0.02, 0.01);
  body.add(thorax, hump);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 7), headMat);
  head.position.set(0, 0.007, 0.044);
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0018, 0.014, 5), limbMat);
  mouth.position.set(0, -0.001, 0.054);
  mouth.rotation.x = 1.12;
  body.add(head, mouth);

  const eyeGeo = new THREE.SphereGeometry(0.0145, 9, 7);
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.013, 0.013, 0.049);
  leftEye.scale.set(1.16, 1.32, 1.08);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.012;
  const glintGeo = new THREE.SphereGeometry(0.0026, 5, 4);
  const leftGlint = new THREE.Mesh(glintGeo, glintMat);
  leftGlint.position.set(-0.013, 0.014, 0.058);
  const rightGlint = leftGlint.clone();
  rightGlint.position.x = 0.013;
  body.add(leftEye, rightEye, leftGlint, rightGlint);

  const antGeo = new THREE.CylinderGeometry(0.0009, 0.0007, 0.018, 4);
  const leftAnt = new THREE.Mesh(antGeo, limbMat);
  leftAnt.position.set(-0.005, 0.018, 0.054);
  leftAnt.rotation.set(0.7, 0, 0.46);
  const rightAnt = leftAnt.clone();
  rightAnt.position.x = 0.005;
  rightAnt.rotation.z = -0.46;
  body.add(leftAnt, rightAnt);

  const wingGeo = wingShape();
  const leftPivot = new THREE.Group();
  leftPivot.name = "leftWing";
  leftPivot.position.set(-0.012, 0.022, 0.014);
  const leftWing = new THREE.Mesh(wingGeo, wingMat);
  leftWing.rotation.set(-0.22, 0.16, 0.18);
  leftWing.position.set(-0.006, 0.004, 0.002);
  leftPivot.add(leftWing);

  const rightPivot = new THREE.Group();
  rightPivot.name = "rightWing";
  rightPivot.position.set(0.012, 0.022, 0.014);
  const rightWing = new THREE.Mesh(wingGeo, wingMat);
  rightWing.scale.x = -1;
  rightWing.rotation.set(-0.16, -0.1, -0.1);
  rightWing.position.set(0.004, 0.002, 0.004);
  rightPivot.add(rightWing);
  body.add(leftPivot, rightPivot);

  const femurGeo = new THREE.CylinderGeometry(0.0015, 0.0012, 0.022, 4);
  const tibiaGeo = new THREE.CylinderGeometry(0.0011, 0.0007, 0.024, 4);
  const tarsusGeo = new THREE.CylinderGeometry(0.0007, 0.0005, 0.009, 4);
  const hips = [
    { z: 0.028, flare: 0.82, back: -0.18 },
    { z: 0.014, flare: 0.98, back: 0.22 },
    { z: 0.0, flare: 1.14, back: 0.64 },
  ];
  for (const side of [-1, 1] as const) {
    for (const hip of hips) {
      const root = new THREE.Group();
      root.position.set(side * 0.012, -0.004, hip.z);
      root.rotation.z = side * hip.flare;
      root.rotation.x = hip.back;
      const femur = new THREE.Mesh(femurGeo, limbMat);
      femur.position.y = -0.01;
      const knee = new THREE.Group();
      knee.position.y = -0.02;
      knee.rotation.z = side * 0.58;
      const tibia = new THREE.Mesh(tibiaGeo, limbMat);
      tibia.position.y = -0.012;
      const ankle = new THREE.Group();
      ankle.position.y = -0.024;
      ankle.rotation.z = side * -0.32;
      const tarsus = new THREE.Mesh(tarsusGeo, limbMat);
      tarsus.position.y = -0.004;
      ankle.add(tarsus);
      knee.add(tibia, ankle);
      root.add(femur, knee);
      body.add(root);
    }
  }

  body.position.y = 0.034;
  fly.add(body);
  fly.scale.setScalar(FLY_SCALE);
  return fly;
}

function addPlant(group: THREE.Group, x: number, z: number, h: number, lean: number, hue: number): void {
  const stemMat = new THREE.MeshLambertMaterial({ color: hue });
  const leafMat = new THREE.MeshLambertMaterial({ color: hue + 0x102010, side: THREE.DoubleSide });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, h, 6), stemMat);
  stem.position.set(x, DOME.floorY + h * 0.5, z);
  stem.rotation.z = lean;
  group.add(stem);
  for (const [i, along] of [0.45, 0.7, 0.92].entries()) {
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.11 + i * 0.02, 7), leafMat);
    leaf.scale.set(1.4, 0.7, 1);
    leaf.position.set(x + lean * along * h * 1.4, DOME.floorY + along * h, z + (i - 1) * 0.04);
    leaf.rotation.set(-0.9, 0.4 * (i - 1), lean);
    group.add(leaf);
  }
}

function buildHabitat(): THREE.Group {
  const group = new THREE.Group();
  const floor = DOME.floorY;
  const radius = DOME.radius;

  const studioFloor = new THREE.Mesh(
    new THREE.CircleGeometry(9.2, 40),
    new THREE.MeshLambertMaterial({ color: 0xb39a7c }),
  );
  studioFloor.name = "studioFloor";
  studioFloor.rotation.x = -Math.PI / 2;
  studioFloor.position.y = -0.62;

  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(radius + 0.86, radius + 0.9, 0.1, 40),
    new THREE.MeshLambertMaterial({ color: 0x6a4a32 }),
  );
  table.position.y = -0.32;
  const tableEdge = new THREE.Mesh(
    new THREE.TorusGeometry(radius + 0.88, 0.022, 6, 40),
    new THREE.MeshLambertMaterial({ color: 0x553a26 }),
  );
  tableEdge.rotation.x = Math.PI / 2;
  tableEdge.position.y = -0.268;
  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.16, 0.52, 8),
    new THREE.MeshLambertMaterial({ color: 0x4a3222 }),
  );
  leg.position.y = -0.68;

  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(radius + 0.3, radius + 0.1, 0.3, 40, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xc4a078, side: THREE.DoubleSide }),
  );
  bowl.position.y = floor - 0.06;
  const bowlLip = new THREE.Mesh(
    new THREE.TorusGeometry(radius + 0.3, 0.032, 8, 40),
    new THREE.MeshLambertMaterial({ color: 0xd2b089 }),
  );
  bowlLip.rotation.x = Math.PI / 2;
  bowlLip.position.y = floor + 0.09;

  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(radius - 0.04, 40),
    new THREE.MeshLambertMaterial({ color: 0xd7b56c }),
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = floor + 0.001;

  const mossMat = new THREE.MeshLambertMaterial({ color: 0x5b7044 });
  const mossGeo = new THREE.SphereGeometry(1, 8, 6);
  for (const [x, z, s] of [
    [-0.62 * radius, 0.48 * radius, 0.18],
    [0.7 * radius, 0.18 * radius, 0.14],
    [-0.18 * radius, -0.66 * radius, 0.16],
    [0.22 * radius, 0.58 * radius, 0.1],
  ] as const) {
    const moss = new THREE.Mesh(mossGeo, mossMat);
    moss.scale.set(s, s * 0.38, s * 0.86);
    moss.position.set(x, floor + s * 0.18, z);
    group.add(moss);
  }

  addPlant(group, -0.78 * radius, 0.22 * radius, 0.92, 0.16, 0x3f5a32);
  addPlant(group, 0.58 * radius, 0.5 * radius, 0.7, -0.12, 0x4a6638);
  addPlant(group, -0.3 * radius, -0.72 * radius, 0.54, 0.08, 0x506e3c);

  const pebbleGeo = new THREE.SphereGeometry(1, 7, 5);
  const pebbleMats = [
    new THREE.MeshLambertMaterial({ color: 0x8a8276 }),
    new THREE.MeshLambertMaterial({ color: 0x6d665c }),
    new THREE.MeshLambertMaterial({ color: 0x9a9186 }),
  ];
  for (const [i, [x, z, s]] of (
    [
      [-0.22 * radius, 0.3 * radius, 0.07],
      [0.48 * radius, -0.08 * radius, 0.05],
      [-0.5 * radius, -0.28 * radius, 0.06],
    ] as const
  ).entries()) {
    const pebble = new THREE.Mesh(pebbleGeo, pebbleMats[i]);
    pebble.scale.set(s, s * 0.62, s * 0.84);
    pebble.position.set(x, floor + s * 0.36, z);
    group.add(pebble);
  }

  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.13, 0.04, 16),
    new THREE.MeshLambertMaterial({ color: 0xd8cfc2 }),
  );
  dish.position.set(WATER_DISH.x, floor + 0.024, WATER_DISH.z);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.128, 16),
    new THREE.MeshLambertMaterial({ color: 0x7fb4bc }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(WATER_DISH.x, floor + 0.046, WATER_DISH.z);

  group.add(studioFloor, table, tableEdge, leg, bowl, bowlLip, soil, dish, water);
  return group;
}

export class HabitatScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  private readonly scene = new THREE.Scene();
  private readonly fly = buildFly();
  private readonly foods = new THREE.Group();
  private readonly foodGeo = new THREE.SphereGeometry(0.038, 8, 6);
  private readonly foodMat = new THREE.MeshLambertMaterial({ color: 0xd24a28 });
  private readonly leafGeo = new THREE.CircleGeometry(0.02, 6);
  private readonly leafMat = new THREE.MeshLambertMaterial({ color: 0x4f7a38, side: THREE.DoubleSide });
  private readonly blob: THREE.Mesh;
  private readonly hemi: THREE.HemisphereLight;
  private readonly key: THREE.DirectionalLight;
  private readonly fill: THREE.DirectionalLight;
  private readonly studioFloor: THREE.Mesh;
  private readonly leftWing: THREE.Object3D;
  private readonly rightWing: THREE.Object3D;
  private readonly flyQuat = new THREE.Quaternion();
  private readonly flyPos = new THREE.Vector3();
  private readonly lastFlyPos = new THREE.Vector3();
  private readonly flyVel = new THREE.Vector3();
  private readonly lookFwd = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3(0.4, 1.55, 3.4);
  private readonly camLook = new THREE.Vector3(0, 0.55, 0);
  private readonly desiredCam = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();
  private readonly bowlCenter = new THREE.Vector3(0, DOME.floorY + 0.42, 0);
  private camHeading = 0;
  private orbitYaw = 0.4;
  private orbitPitch = Math.atan2(1.38, 3.05);
  private userOrbit = false;
  private dragging = false;
  private dragPointer = -1;
  private dragX = 0;
  private dragY = 0;
  private camReady = false;
  private lastRenderAt = 0;
  private prev: Sample | null = null;
  private next: Sample | null = null;
  private clockOffset = 0;
  private brightness = 0.7;
  private appliedBrightness = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_CAP));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = false;

    this.camera = new THREE.PerspectiveCamera(40, canvas.clientWidth / Math.max(canvas.clientHeight, 1), 0.12, 70);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.scene.background = SKY_NOON.clone();
    this.scene.fog = new THREE.Fog(SKY_NOON.clone(), 10, 22);

    this.hemi = new THREE.HemisphereLight(0xf6f1e6, 0x7a6a56, 1.12);
    this.key = new THREE.DirectionalLight(0xfff2d8, 0.58);
    this.key.position.set(4.2, 8.4, 3.4);
    this.fill = new THREE.DirectionalLight(0xb9cce0, 0.2);
    this.fill.position.set(-6.2, 3.4, 2.2);

    const habitat = buildHabitat();
    this.studioFloor = habitat.getObjectByName("studioFloor") as THREE.Mesh;

    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.08, 12),
      new THREE.MeshBasicMaterial({
        color: 0x3a2a18,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = DOME.floorY + 0.004;
    this.blob = blob;

    this.scene.add(this.hemi, this.key, this.fill, habitat, this.fly, this.foods, this.blob);

    this.leftWing = this.fly.getObjectByName("leftWing")!;
    this.rightWing = this.fly.getObjectByName("rightWing")!;

    window.addEventListener("resize", () => this.resize());
    this.bindOrbit(canvas);
    requestAnimationFrame(() => this.resize());
  }

  private bindOrbit(canvas: HTMLCanvasElement): void {
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (event) => {
      if (event.target !== canvas) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      this.dragging = true;
      this.dragPointer = event.pointerId;
      this.dragX = event.clientX;
      this.dragY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (!this.dragging || event.pointerId !== this.dragPointer) return;
        const dx = event.clientX - this.dragX;
        const dy = event.clientY - this.dragY;
        this.dragX = event.clientX;
        this.dragY = event.clientY;
        if (!this.userOrbit && Math.hypot(dx, dy) < ORBIT_DRAG_SLOP) return;
        this.userOrbit = true;
        this.orbitYaw -= dx * ORBIT_SENS;
        this.orbitPitch = THREE.MathUtils.clamp(
          this.orbitPitch + dy * ORBIT_SENS,
          ORBIT_PITCH_MIN,
          ORBIT_PITCH_MAX,
        );
        event.preventDefault();
      },
      { passive: false },
    );
    const endDrag = (event: PointerEvent) => {
      if (event.pointerId !== this.dragPointer) return;
      this.dragging = false;
      this.dragPointer = -1;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = Math.max(canvas.clientHeight, 1);
    const portrait = width / height < 0.88;
    this.camera.fov = portrait ? 46 : 40;
    this.camera.aspect = Math.max(width / height, 0.01);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_CAP));
    this.renderer.setSize(width, height, false);
  }

  pushPose(t: number, pose: Snapshot["fly"]): void {
    this.clockOffset = t - performance.now();
    this.prev = this.next;
    this.next = { t, pose };
  }

  syncFoods(foods: FoodItem[]): void {
    const live = new Set(foods.filter((food) => !food.eaten).map((food) => food.id));
    for (const child of [...this.foods.children]) {
      if (!live.has(child.name)) this.foods.remove(child);
    }
    for (const food of foods) {
      if (food.eaten || this.foods.getObjectByName(food.id)) continue;
      const bite = new THREE.Group();
      bite.name = food.id;
      const fruit = new THREE.Mesh(this.foodGeo, this.foodMat);
      fruit.scale.set(1, 0.86, 1.08);
      const leaf = new THREE.Mesh(this.leafGeo, this.leafMat);
      leaf.position.set(0.02, 0.02, 0);
      leaf.rotation.set(-1.1, 0.4, 0.3);
      bite.add(fruit, leaf);
      bite.position.set(food.x, food.y, food.z);
      this.foods.add(bite);
    }
  }

  setBrightness(value: number): void {
    this.brightness = value;
  }

  render(): void {
    const now = performance.now() + this.clockOffset - 90;
    const pose = this.interpolated(now);
    this.fly.position.set(pose.x, pose.y, pose.z);
    if (this.prev && this.next) {
      slerpInto(
        this.flyQuat,
        { x: this.prev.pose.qx, y: this.prev.pose.qy, z: this.prev.pose.qz, w: this.prev.pose.qw },
        { x: this.next.pose.qx, y: this.next.pose.qy, z: this.next.pose.qz, w: this.next.pose.qw },
        this.alpha(now),
      );
    } else {
      this.flyQuat.set(pose.qx, pose.qy, pose.qz, pose.qw);
    }
    this.fly.quaternion.copy(this.flyQuat);

    const flying = pose.locomotion === "fly";
    const phase = pose.wingPhase * Math.PI * 2;
    const amp = flying ? 1.02 : 0.14;
    const flap = Math.sin(phase) * amp;
    const sweep = Math.cos(phase) * (flying ? 0.22 : 0.03);
    this.leftWing.rotation.z = 0.42 + flap;
    this.leftWing.rotation.x = 0.16 + flap * 0.28;
    this.leftWing.rotation.y = 0.18 + sweep;
    this.rightWing.rotation.z = -0.42 - flap;
    this.rightWing.rotation.x = 0.16 + flap * 0.28;
    this.rightWing.rotation.y = -0.18 - sweep;

    this.blob.position.x = pose.x;
    this.blob.position.z = pose.z;
    if (pose.locomotion === "walk") {
      this.blob.visible = true;
      this.blob.scale.setScalar(1);
      (this.blob.material as THREE.MeshBasicMaterial).opacity = 0.18;
    } else if (flying) {
      this.blob.visible = true;
      this.blob.scale.setScalar(0.42);
      (this.blob.material as THREE.MeshBasicMaterial).opacity = 0.07;
    } else {
      this.blob.visible = false;
    }

    if (this.brightness !== this.appliedBrightness) {
      this.appliedBrightness = this.brightness;
      const t = THREE.MathUtils.clamp(this.brightness, 0.3, 1.15);
      const sky = SKY_DIM.clone().lerp(SKY_NOON, t);
      this.scene.background = sky;
      (this.scene.fog as THREE.Fog).color.copy(sky);
      (this.studioFloor.material as THREE.MeshLambertMaterial).color.copy(FLOOR_DIM.clone().lerp(FLOOR_NOON, t));
      this.key.intensity = 0.36 + t * 0.3;
      this.hemi.intensity = 0.82 + t * 0.34;
      this.fill.intensity = 0.12 + t * 0.1;
    }

    this.followFly(pose, performance.now());
    this.renderer.render(this.scene, this.camera);
  }

  private followFly(pose: Snapshot["fly"], nowMs: number): void {
    const dt = this.lastRenderAt ? Math.min(0.05, Math.max(0.008, (nowMs - this.lastRenderAt) / 1000)) : 1 / 60;
    this.lastRenderAt = nowMs;

    this.flyPos.set(pose.x, pose.y, pose.z);
    if (this.camReady) {
      this.flyVel.copy(this.flyPos).sub(this.lastFlyPos).divideScalar(dt);
    }
    this.lastFlyPos.copy(this.flyPos);

    this.lookFwd.set(0, 0, 1).applyQuaternion(this.flyQuat);
    if (this.flyVel.lengthSq() > 0.08) {
      this.lookFwd.lerp(this.flyVel, 0.55);
    }
    this.lookFwd.y = 0;
    if (this.lookFwd.lengthSq() < 1e-5) this.lookFwd.set(Math.sin(this.camHeading), 0, Math.cos(this.camHeading));
    this.lookFwd.normalize();

    const targetHeading = Math.atan2(this.lookFwd.x, this.lookFwd.z);
    this.camHeading = this.camReady ? dampAngle(this.camHeading, targetHeading, 1.7, dt) : targetHeading;

    const flying = pose.locomotion === "fly";
    const dist = flying ? 2.48 : 3.05;
    const height = flying ? 0.98 : 1.38;
    const restPitch = Math.atan2(height, dist);
    const radius = Math.hypot(dist, height);
    if (!this.userOrbit) {
      this.orbitYaw = this.camHeading;
      this.orbitPitch = this.camReady ? damp(this.orbitPitch, restPitch, 2.2, dt) : restPitch;
    }
    const pitch = THREE.MathUtils.clamp(this.orbitPitch, ORBIT_PITCH_MIN, ORBIT_PITCH_MAX);
    const yaw = this.orbitYaw;
    const xz = Math.cos(pitch) * radius;
    const lift = Math.sin(pitch) * radius;

    this.desiredCam.set(
      this.flyPos.x - Math.sin(yaw) * xz,
      this.flyPos.y + lift,
      this.flyPos.z - Math.cos(yaw) * xz,
    );
    this.desiredCam.y = Math.max(this.desiredCam.y, 0.38);

    this.desiredLook.copy(this.flyPos);
    if (this.userOrbit) {
      this.desiredLook.y += flying ? 0.08 : 0.04;
    } else {
      const ahead = 0.28 + Math.min(pose.speed, 2.4) * 0.12;
      this.desiredLook.x += this.lookFwd.x * ahead;
      this.desiredLook.z += this.lookFwd.z * ahead;
      this.desiredLook.y += flying ? 0.06 : 0.02;
      this.desiredLook.lerp(this.bowlCenter, 0.14);
    }

    if (!this.camReady) {
      this.camPos.copy(this.desiredCam);
      this.camLook.copy(this.desiredLook);
      this.camReady = true;
    } else {
      const follow = this.dragging ? 7.2 : 3.1;
      const look = this.dragging ? 8.4 : 4.2;
      this.camPos.x = damp(this.camPos.x, this.desiredCam.x, follow, dt);
      this.camPos.y = damp(this.camPos.y, this.desiredCam.y, this.dragging ? 6.4 : 2.6, dt);
      this.camPos.z = damp(this.camPos.z, this.desiredCam.z, follow, dt);
      this.camLook.x = damp(this.camLook.x, this.desiredLook.x, look, dt);
      this.camLook.y = damp(this.camLook.y, this.desiredLook.y, this.dragging ? 6.8 : 3.4, dt);
      this.camLook.z = damp(this.camLook.z, this.desiredLook.z, look, dt);
    }

    this.camera.position.copy(this.camPos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.camLook);
  }

  private alpha(now: number): number {
    if (!this.prev || !this.next) return 1;
    const span = this.next.t - this.prev.t;
    if (span <= 0) return 1;
    return Math.min(1.12, Math.max(0, (now - this.prev.t) / span));
  }

  private interpolated(now: number): Snapshot["fly"] {
    if (!this.next) {
      scratchPose.x = 0;
      scratchPose.y = DOME.floorY;
      scratchPose.z = 0;
      scratchPose.qx = 0;
      scratchPose.qy = 0;
      scratchPose.qz = 0;
      scratchPose.qw = 1;
      scratchPose.locomotion = "walk";
      scratchPose.wingPhase = 0;
      scratchPose.speed = 0;
      return scratchPose;
    }
    if (!this.prev) return this.next.pose;
    const t = Math.min(1, this.alpha(now));
    const a = this.prev.pose;
    const b = this.next.pose;
    scratchPose.x = lerp(a.x, b.x, t);
    scratchPose.y = lerp(a.y, b.y, t);
    scratchPose.z = lerp(a.z, b.z, t);
    scratchPose.qx = b.qx;
    scratchPose.qy = b.qy;
    scratchPose.qz = b.qz;
    scratchPose.qw = b.qw;
    scratchPose.locomotion = t > 0.5 ? b.locomotion : a.locomotion;
    scratchPose.wingPhase = lerp(a.wingPhase, a.wingPhase + shortestPhase(a.wingPhase, b.wingPhase), t);
    scratchPose.speed = lerp(a.speed, b.speed, t);
    return scratchPose;
  }
}
