"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { Tombstone as TombstoneModel } from "./model";
import { Tombstone } from "./Tombstone";
import { COLORS, GRAVEYARD_ZONE, SCENE, TOMBSTONE_LIMIT, graveyardSlotPosition } from "./theme";

interface GraveyardProps {
  tombstones: TombstoneModel[];
  hidden: Set<string>;
}

export function Graveyard({ tombstones, hidden }: GraveyardProps) {
  const visible = tombstones.filter((tombstone) => !hidden.has(tombstone.id));
  const shown = visible.slice(0, TOMBSTONE_LIMIT);
  const earlier = visible.length - shown.length;

  const outline = useMemo(
    () =>
      new Float32Array([
        GRAVEYARD_ZONE.minX, SCENE.floorY + 0.03, GRAVEYARD_ZONE.minZ,
        GRAVEYARD_ZONE.maxX, SCENE.floorY + 0.03, GRAVEYARD_ZONE.minZ,
        GRAVEYARD_ZONE.maxX, SCENE.floorY + 0.03, GRAVEYARD_ZONE.maxZ,
        GRAVEYARD_ZONE.minX, SCENE.floorY + 0.03, GRAVEYARD_ZONE.maxZ,
      ]),
    [],
  );

  const geometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(outline, 3));
    return buffer;
  }, [outline]);

  const [overflowX, overflowY, overflowZ] = graveyardSlotPosition(TOMBSTONE_LIMIT);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SCENE.floorY, 0]}>
        <planeGeometry args={[SCENE.floorHalf * 2, SCENE.floorHalf * 2]} />
        <meshStandardMaterial color={COLORS.bg} />
      </mesh>
      <gridHelper
        args={[SCENE.floorHalf * 2, 20, COLORS.grey, "#E4E4E4"]}
        position={[0, SCENE.floorY + 0.01, 0]}
      />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[
          (GRAVEYARD_ZONE.minX + GRAVEYARD_ZONE.maxX) / 2,
          SCENE.floorY + 0.02,
          (GRAVEYARD_ZONE.minZ + GRAVEYARD_ZONE.maxZ) / 2,
        ]}
      >
        <planeGeometry
          args={[GRAVEYARD_ZONE.maxX - GRAVEYARD_ZONE.minX, GRAVEYARD_ZONE.maxZ - GRAVEYARD_ZONE.minZ]}
        />
        <meshBasicMaterial color={COLORS.surface2} transparent opacity={0.9} />
      </mesh>

      <lineLoop geometry={geometry}>
        <lineBasicMaterial color={COLORS.ink} />
      </lineLoop>

      {shown.map((tombstone) => (
        <Tombstone key={tombstone.id} tombstone={tombstone} />
      ))}

      {earlier > 0 ? (
        <group position={[overflowX, overflowY, overflowZ]}>
          <mesh>
            <boxGeometry args={[0.9, 1.1, 0.24]} />
            <meshStandardMaterial color={COLORS.grey} flatShading />
          </mesh>
          <mesh position={[0, 0, 0.13]}>
            <boxGeometry args={[0.5, 0.1, 0.02]} />
            <meshBasicMaterial color={COLORS.bg} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}
