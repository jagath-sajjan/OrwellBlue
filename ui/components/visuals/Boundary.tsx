"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { COLORS, SCENE } from "./theme";

/**
 * Low-density containment shell: thin grey icosahedron edges plus three thick
 * black great-circle rings. Nothing on this surface is noisy.
 */
export function Boundary({ breached }: { breached: boolean }) {
  const geometry = useMemo(
    () => new THREE.IcosahedronGeometry(SCENE.boundaryRadius, 1),
    [],
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  const shellColor = breached ? COLORS.softRed : COLORS.grey;
  const ringColor = breached ? COLORS.softRed : COLORS.ink;

  return (
    <group>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={shellColor} transparent opacity={0.55} />
      </lineSegments>

      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[SCENE.boundaryRadius, 0.045, 6, 96]} />
        <meshBasicMaterial color={ringColor} />
      </mesh>
      <mesh>
        <torusGeometry args={[SCENE.boundaryRadius, 0.045, 6, 96]} />
        <meshBasicMaterial color={ringColor} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[SCENE.boundaryRadius, 0.045, 6, 96]} />
        <meshBasicMaterial color={ringColor} />
      </mesh>
    </group>
  );
}
