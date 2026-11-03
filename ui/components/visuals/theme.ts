/** Mirrors the global design tokens for the 3D scene (no globals edited). */

export const COLORS = {
  bg: "#FFFFFF",
  ink: "#000000",
  ink2: "#525252",
  surface: "#F4F4F4",
  surface2: "#F4F4F4",
  softRed: "#F4A3A0",
  softGreen: "#A8E6B8",
  softYellow: "#FFE08A",
  grey: "#A3A3A3",
  orwellBlue: "#0052FF",
} as const;

export const SCENE = {
  coreRadius: 1.5,
  boundaryRadius: 7,
  agentSize: 0.62,
  floorY: -3.2,
  floorHalf: 9.5,
  orbitBase: 4.8,
  orbitRange: 0,
  tetherY: 0,
  camera: { position: [0, 12.5, 23] as [number, number, number], target: [0, -0.6, 2] as [number, number, number] },
} as const;

export const GRAVEYARD = {
  cols: 8,
  xStart: -5.6,
  xStep: 1.6,
  zStart: 4.2,
  zStep: 1.5,
} as const;

export const STATUS_COLOR: Record<string, string> = {
  running: COLORS.softGreen,
  frozen: COLORS.softYellow,
  killed: COLORS.softRed,
  self_destructed: COLORS.softRed,
};

/** Absolute seconds from the start of one kill cinematic. */
export const CINEMATIC = {
  detect: 0.5,
  signal: 1.1,
  freeze: 1.8,
  kill: 2.2,
  end: 3.2,
  fastFactor: 0.5,
  queueThreshold: 2,
} as const;

/** Deterministic graveyard slot -> world position (matches the zone outline). */
export function graveyardSlotPosition(slot: number): [number, number, number] {
  const col = slot % GRAVEYARD.cols;
  const row = Math.floor(slot / GRAVEYARD.cols);
  return [
    GRAVEYARD.xStart + col * GRAVEYARD.xStep,
    SCENE.floorY + 0.55,
    GRAVEYARD.zStart + row * GRAVEYARD.zStep,
  ];
}

export const GRAVEYARD_ZONE = {
  minX: -6.6,
  maxX: 6.6,
  minZ: 3.3,
  maxZ: 6.2,
} as const;

export const TOMBSTONE_LIMIT = 12;
