#!/usr/bin/env node
/**
 * Generates original CC0-style mural seed packs for Infinite Pixelboard.
 * All sprites are original geometric / nature / abstract motifs.
 * No copyrighted characters, logos, or franchise IP.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packsDir = join(__dirname, "packs");

/** Free palette only so seeds look correct for every visitor. */
const C = {
  k: "#171714",
  r: "#D3523C",
  o: "#DC9B32",
  y: "#E1C94A",
  g: "#587554",
  t: "#356B76",
  b: "#425B8C",
  p: "#7E5078",
  c: "#F7F3EA",
};

/**
 * @param {string[]} rows char grid; space = skip (transparent / leave board)
 * @param {Record<string, string>} legend
 * @param {{ row: number, column: number }} origin top-left
 */
function fromMap(rows, legend, origin) {
  const pixels = [];
  for (let r = 0; r < rows.length; r++) {
    const line = rows[r];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === " " || ch === ".") continue;
      const color = legend[ch];
      if (!color) throw new Error(`Unknown map char '${ch}'`);
      pixels.push({
        row: origin.row + r,
        column: origin.column + col,
        color,
      });
    }
  }
  return pixels;
}

function checker(origin, size, a, b) {
  const pixels = [];
  for (let r = 0; r < size; r++) {
    for (let col = 0; col < size; col++) {
      pixels.push({
        row: origin.row + r,
        column: origin.column + col,
        color: (r + col) % 2 === 0 ? a : b,
      });
    }
  }
  return pixels;
}

function concentricSquares(origin, layers) {
  const pixels = [];
  const colors = [C.b, C.t, C.g, C.y, C.o, C.r, C.p];
  const max = layers * 2 - 1;
  for (let r = 0; r < max; r++) {
    for (let col = 0; col < max; col++) {
      const dist = Math.max(
        Math.abs(r - (layers - 1)),
        Math.abs(col - (layers - 1)),
      );
      pixels.push({
        row: origin.row + r,
        column: origin.column + col,
        color: colors[dist % colors.length],
      });
    }
  }
  return pixels;
}

function diamondTessellation(origin, w, h) {
  const pixels = [];
  const colors = [C.b, C.p, C.t, C.c, C.k];
  for (let r = 0; r < h; r++) {
    for (let col = 0; col < w; col++) {
      const cell = ((Math.floor(r / 4) + Math.floor(col / 4)) % colors.length);
      const inDiamond =
        Math.abs((r % 4) - 1.5) + Math.abs((col % 4) - 1.5) <= 2;
      pixels.push({
        row: origin.row + r,
        column: origin.column + col,
        color: inDiamond ? colors[cell] : C.c,
      });
    }
  }
  return pixels;
}

function waveBand(origin, w, h) {
  const pixels = [];
  for (let r = 0; r < h; r++) {
    for (let col = 0; col < w; col++) {
      const wave = Math.round(Math.sin((col / w) * Math.PI * 3) * 2);
      const band = r + wave;
      const color =
        band < h / 3 ? C.b : band < (2 * h) / 3 ? C.t : C.g;
      pixels.push({
        row: origin.row + r,
        column: origin.column + col,
        color,
      });
    }
  }
  return pixels;
}

function spiral(origin, size) {
  const pixels = [];
  const colors = [C.r, C.o, C.y, C.g, C.t, C.b, C.p, C.k];
  let r = Math.floor(size / 2);
  let col = Math.floor(size / 2);
  let dir = 0;
  const dirs = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ];
  let leg = 1;
  let painted = 0;
  let colorIndex = 0;
  const visited = new Set();
  while (painted < size * size) {
    const key = `${r},${col}`;
    if (r >= 0 && r < size && col >= 0 && col < size && !visited.has(key)) {
      visited.add(key);
      pixels.push({
        row: origin.row + r,
        column: origin.column + col,
        color: colors[colorIndex % colors.length],
      });
      painted++;
      if (painted % 3 === 0) colorIndex++;
    }
    const [dr, dc] = dirs[dir];
    r += dr;
    col += dc;
    if (painted > 0 && painted % leg === 0) {
      dir = (dir + 1) % 4;
      if (dir % 2 === 0) leg++;
    }
    if (painted > size * size + 10) break;
  }
  return pixels;
}

const packs = [
  {
    id: "welcome-compass",
    title: "Welcome compass rose",
    license: "CC0-1.0 (original)",
    origin: { row: -40, column: -40 },
    note: "NW of origin — geometric compass, original",
    pixels: fromMap(
      [
        "      y      ",
        "      y      ",
        "      y      ",
        "   o  y  o   ",
        "    o y o    ",
        "     oyo     ",
        "yyyyyykyyyyyy",
        "     opo     ",
        "    o p o    ",
        "   o  p  o   ",
        "      p      ",
        "      p      ",
        "      p      ",
      ],
      { y: C.y, o: C.o, k: C.k, p: C.p },
      { row: -40, column: -40 },
    ),
  },
  {
    id: "geometric-sun",
    title: "Geometric sun",
    license: "CC0-1.0 (original)",
    origin: { row: -55, column: 20 },
    note: "N of origin — original sunburst",
    pixels: fromMap(
      [
        "    y   y    ",
        "  y  ooo  y  ",
        " y ooooooo y ",
        "  oooyyyyooo ",
        "y ooyyyyyyoo y",
        " oooyyyyyyooo",
        "y ooyyyyyyoo y",
        "  oooyyyyooo ",
        " y ooooooo y ",
        "  y  ooo  y  ",
        "    y   y    ",
      ],
      { y: C.y, o: C.o },
      { row: -55, column: 20 },
    ),
  },
  {
    id: "pine-grove",
    title: "Pine grove",
    license: "CC0-1.0 (original)",
    origin: { row: 25, column: -60 },
    note: "SW of origin — three original pines",
    pixels: fromMap(
      [
        "      g            g      ",
        "     ggg          ggg     ",
        "    ggggg   g    ggggg    ",
        "   ggggggg ggg  ggggggg   ",
        "  gggggggggggggggggggggg  ",
        "     kkk     kkk    kkk   ",
        "     kkk     kkk    kkk   ",
      ],
      { g: C.g, k: C.k },
      { row: 25, column: -60 },
    ),
  },
  {
    id: "crescent-sky",
    title: "Crescent and stars",
    license: "CC0-1.0 (original)",
    origin: { row: -70, column: -10 },
    note: "Far N — night sky motif",
    pixels: fromMap(
      [
        "  y     y        ",
        "             y   ",
        "    cc           ",
        "   c  c    y     ",
        "  c    c         ",
        "  c    c      y  ",
        "   c  c  y       ",
        "    cc           ",
        "y         y   y  ",
      ],
      { c: C.c, y: C.y },
      { row: -70, column: -10 },
    ),
  },
  {
    id: "mountain-range",
    title: "Mountain range",
    license: "CC0-1.0 (original)",
    origin: { row: 40, column: 30 },
    note: "SE of origin — silhouette mountains",
    pixels: fromMap(
      [
        "        kk              ",
        "       kbbk       kk    ",
        "      kbbbbk     kttk   ",
        "  kk kbbbbbbk   kttttk  ",
        " kggkbbbbbbbbk kttttttk ",
        "kggggbbbbbbbbbkttttttttk",
        "ggggggbbbbbbbbtttttttttg",
      ],
      { k: C.k, b: C.b, t: C.t, g: C.g },
      { row: 40, column: 30 },
    ),
  },
  {
    id: "abstract-flower",
    title: "Abstract six-petal",
    license: "CC0-1.0 (original)",
    origin: { row: -20, column: 50 },
    note: "NE — geometric flower, not franchise-like",
    pixels: fromMap(
      [
        "    p   p    ",
        "  ppp   ppp  ",
        "  ppp r ppp  ",
        "    prrrp    ",
        "ppprrryyrrppp",
        "  p rryyr p  ",
        "    prrrp    ",
        "  ppp r ppp  ",
        "  ppp   ppp  ",
        "    p   p    ",
      ],
      { p: C.p, r: C.r, y: C.y },
      { row: -20, column: 50 },
    ),
  },
  {
    id: "simple-heart",
    title: "Classic heart motif",
    license: "CC0-1.0 (public-domain motif, original pixels)",
    origin: { row: 10, column: 10 },
    note: "Near origin SE — classic heart",
    pixels: fromMap(
      [
        " rr   rr ",
        "rrrr rrrr",
        "rrrrrrrrr",
        " rrrrrrr ",
        "  rrrrr  ",
        "   rrr   ",
        "    r    ",
      ],
      { r: C.r },
      { row: 10, column: 10 },
    ),
  },
  {
    id: "leaf-pair",
    title: "Paired leaves",
    license: "CC0-1.0 (original)",
    origin: { row: 55, column: -25 },
    note: "S — nature leaves",
    pixels: fromMap(
      [
        "   g      g  ",
        "  ggg    ggg ",
        " ggggg  ggggg",
        "ggggggggggggg",
        " ggggkkgggg  ",
        "  gg k gg    ",
        "     k       ",
      ],
      { g: C.g, k: C.k },
      { row: 55, column: -25 },
    ),
  },
  {
    id: "fish-silhouette",
    title: "Abstract fish",
    license: "CC0-1.0 (original)",
    origin: { row: -15, column: -80 },
    note: "W — simple fish silhouette",
    pixels: fromMap(
      [
        "    tttt     ",
        "  tttttttt t ",
        " tttkttttttt ",
        "tttttttttt   ",
        " tttttttt t  ",
        "  tttttt     ",
      ],
      { t: C.t, k: C.k },
      { row: -15, column: -80 },
    ),
  },
  {
    id: "bird-perch",
    title: "Geometric bird",
    license: "CC0-1.0 (original)",
    origin: { row: -80, column: 45 },
    note: "NE far — perched bird silhouette",
    pixels: fromMap(
      [
        "     kk      ",
        "    kook     ",
        "   kooook    ",
        "  kooooook   ",
        " koooookk    ",
        "koooook      ",
        " kkkkk       ",
        "    k        ",
        "   kk        ",
        "  k  k       ",
      ],
      { k: C.k, o: C.o },
      { row: -80, column: 45 },
    ),
  },
  {
    id: "rainbow-arc",
    title: "Rainbow arc",
    license: "CC0-1.0 (original)",
    origin: { row: 70, column: 50 },
    note: "Far SE — spectral arc",
    pixels: fromMap(
      [
        "   rrrrrrrr   ",
        "  roooooooor  ",
        " royyyyyyyyor ",
        "royggggggggyor",
        " oyttttttttyo ",
        "  ybbbbbbby   ",
        "   bpppppb    ",
        "    bbbbb     ",
      ],
      {
        r: C.r,
        o: C.o,
        y: C.y,
        g: C.g,
        t: C.t,
        b: C.b,
        p: C.p,
      },
      { row: 70, column: 50 },
    ),
  },
  {
    id: "quilt-block",
    title: "Quilt checker 12×12",
    license: "CC0-1.0 (original)",
    origin: { row: -30, column: 80 },
    note: "E — textile-style checker",
    pixels: checker({ row: -30, column: 80 }, 12, C.r, C.c),
  },
  {
    id: "concentric-nest",
    title: "Concentric nest",
    license: "CC0-1.0 (original)",
    origin: { row: 80, column: -70 },
    note: "Far SW — nested squares",
    pixels: concentricSquares({ row: 80, column: -70 }, 8),
  },
  {
    id: "diamond-field",
    title: "Diamond tessellation",
    license: "CC0-1.0 (original)",
    origin: { row: -100, column: -50 },
    note: "Far NW — abstract diamonds 16×12",
    pixels: diamondTessellation({ row: -100, column: -50 }, 16, 12),
  },
  {
    id: "wave-banner",
    title: "Wave banner",
    license: "CC0-1.0 (original)",
    origin: { row: 100, column: -40 },
    note: "Far S — rolling waves 24×8",
    pixels: waveBand({ row: 100, column: -40 }, 24, 8),
  },
  {
    id: "color-spiral",
    title: "Palette spiral",
    license: "CC0-1.0 (original)",
    origin: { row: -5, column: 100 },
    note: "Far E — 15×15 rainbow spiral",
    pixels: spiral({ row: -5, column: 100 }, 15),
  },
  {
    id: "house-silhouette",
    title: "Simple house",
    license: "CC0-1.0 (original)",
    origin: { row: 20, column: -100 },
    note: "Far W — generic house",
    pixels: fromMap(
      [
        "     k     ",
        "    kyk    ",
        "   kyyyk   ",
        "  kyyyyyk  ",
        " kyyyyyyyk ",
        "kkkkkkkkkkk",
        "k c k   k k",
        "k c k   k k",
        "k c k   k k",
        "kkkkkkkkkkk",
      ],
      { k: C.k, y: C.y, c: C.c },
      { row: 20, column: -100 },
    ),
  },
  {
    id: "star-cluster",
    title: "Star cluster",
    license: "CC0-1.0 (original)",
    origin: { row: -90, column: 80 },
    note: "Far NE — geometric stars",
    pixels: fromMap(
      [
        "  y     y      y ",
        " yyy   yyy    yyy",
        "yyyyy yyyyy  yyyy",
        " yyy   yyy    yyy",
        "  y  o  y  o   y ",
        "    ooo   ooo    ",
        "   ooooo ooooo   ",
        "    ooo   ooo    ",
        "  y  o  y  o   y ",
      ],
      { y: C.y, o: C.o },
      { row: -90, column: 80 },
    ),
  },
  {
    id: "cross-stitch-frame",
    title: "Cross-stitch frame",
    license: "CC0-1.0 (original)",
    origin: { row: 110, column: 20 },
    note: "Far S — embroidery-style border around open center",
    pixels: fromMap(
      [
        "prprprprprprprpr",
        "r              p",
        "p              r",
        "r   g  g  g    p",
        "p              r",
        "r   g  y  g    p",
        "p              r",
        "r   g  g  g    p",
        "p              r",
        "rprprprprprprprp",
      ],
      { p: C.p, r: C.r, g: C.g, y: C.y },
      { row: 110, column: 20 },
    ),
  },
  {
    id: "meander-border",
    title: "Greek-key meander",
    license: "CC0-1.0 (classic public-domain motif, original pixels)",
    origin: { row: -120, column: 10 },
    note: "Far N — classic meander pattern",
    pixels: fromMap(
      [
        "kkkkkkkkkkkkkkkk",
        "k              k",
        "k kkkk kkkk kk k",
        "k k  k k  k k  k",
        "k k  kkk  kkk  k",
        "k k            k",
        "k kkkkkkkkkkkk k",
        "k              k",
        "kkkkkkkkkkkkkkkk",
      ],
      { k: C.k },
      { row: -120, column: 10 },
    ),
  },
  {
    id: "tulip-row",
    title: "Tulip row",
    license: "CC0-1.0 (original)",
    origin: { row: 5, column: -35 },
    note: "Near origin W — three tulips",
    pixels: fromMap(
      [
        "  r   y   p  ",
        " rrr yyy ppp ",
        " rrr yyy ppp ",
        "  g   g   g  ",
        "  g   g   g  ",
        "  g   g   g  ",
      ],
      { r: C.r, y: C.y, p: C.p, g: C.g },
      { row: 5, column: -35 },
    ),
  },
  {
    id: "boat-horizon",
    title: "Boat on horizon",
    license: "CC0-1.0 (original)",
    origin: { row: 90, column: 90 },
    note: "Far SE — sailboat",
    pixels: fromMap(
      [
        "      c      ",
        "     cc      ",
        "    c c      ",
        "   c  c      ",
        "  c   c      ",
        " cccccck     ",
        "       k     ",
        "  bbbbbkbbbb ",
        " bttttttttttb",
        "ttttttttttttt",
      ],
      { c: C.c, k: C.k, b: C.b, t: C.t },
      { row: 90, column: 90 },
    ),
  },
  {
    id: "mushroom-pair",
    title: "Forest mushrooms",
    license: "CC0-1.0 (original geometric toadstools)",
    origin: { row: 35, column: 70 },
    note: "E — original toadstools (not franchise)",
    pixels: fromMap(
      [
        "  rrr      ooo  ",
        " rrrrr    ooooo ",
        "rrwcwrr  oowowoo",
        " rrrrr    ooooo ",
        "   c        o   ",
        "   c        o   ",
        "   c        o   ",
      ],
      { r: C.r, o: C.o, c: C.c, w: C.c },
      { row: 35, column: 70 },
    ),
  },
];

const catalog = {
  generatedAt: new Date().toISOString(),
  license: "All packs are original CC0-1.0-style pixel art. No third-party IP.",
  palette: C,
  packs: packs.map((pack) => ({
    id: pack.id,
    title: pack.title,
    license: pack.license,
    origin: pack.origin,
    note: pack.note,
    pixelCount: pack.pixels.length,
    boundingBox: boundingBox(pack.pixels),
  })),
};

function boundingBox(pixels) {
  if (pixels.length === 0) return null;
  let minR = Infinity;
  let maxR = -Infinity;
  let minC = Infinity;
  let maxC = -Infinity;
  for (const pixel of pixels) {
    minR = Math.min(minR, pixel.row);
    maxR = Math.max(maxR, pixel.row);
    minC = Math.min(minC, pixel.column);
    maxC = Math.max(maxC, pixel.column);
  }
  return {
    rowMin: minR,
    rowMax: maxR,
    columnMin: minC,
    columnMax: maxC,
  };
}

await mkdir(packsDir, { recursive: true });

for (const pack of packs) {
  const body = {
    id: pack.id,
    title: pack.title,
    license: pack.license,
    origin: pack.origin,
    note: pack.note,
    pixels: pack.pixels,
  };
  await writeFile(
    join(packsDir, `${pack.id}.json`),
    `${JSON.stringify(body, null, 2)}\n`,
  );
}

await writeFile(
  join(__dirname, "catalog.json"),
  `${JSON.stringify(catalog, null, 2)}\n`,
);

const total = packs.reduce((sum, pack) => sum + pack.pixels.length, 0);
console.log(
  `Wrote ${packs.length} packs (${total} pixels) to ${packsDir}`,
);
