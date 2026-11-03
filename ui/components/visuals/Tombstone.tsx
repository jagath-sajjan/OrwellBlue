"use client";

import { COLORS, graveyardSlotPosition } from "./theme";
import type { Tombstone as TombstoneModel } from "./model";

/** Mesh-only slab so choreography can animate its wrapper. */
export function Slab() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.9, 1.1, 0.24]} />
        <meshStandardMaterial color={COLORS.ink} flatShading />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 4]} position={[0, 0.05, 0.13]}>
        <boxGeometry args={[0.55, 0.09, 0.02]} />
        <meshBasicMaterial color={COLORS.bg} />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 4]} position={[0, 0.05, 0.13]}>
        <boxGeometry args={[0.55, 0.09, 0.02]} />
        <meshBasicMaterial color={COLORS.bg} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.54, 0]}>
        <circleGeometry args={[0.55, 24]} />
        <meshBasicMaterial color={COLORS.grey} transparent opacity={0.45} />
      </mesh>
    </group>
  );
}

export function Tombstone({ tombstone }: { tombstone: TombstoneModel }) {
  const [x, y, z] = graveyardSlotPosition(tombstone.slot);
  return (
    <group position={[x, y, z]}>
      <Slab />
    </group>
  );
}
