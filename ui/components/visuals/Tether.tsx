"use client";

import { useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { COLORS } from "./theme";

const LOST_AFTER = 10;
const DEAD_AFTER = 26;

interface TetherProps {
  target: MutableRefObject<THREE.Vector3>;
  lastHeartbeat: number;
}

/**
 * Black line from the core to the agent, plus a black dot that runs toward the
 * core each time a real heartbeat lands. A stale heartbeat dashes the tether,
 * a fully lost one removes it.
 */
export function Tether({ target, lastHeartbeat }: TetherProps) {
  const dot = useRef<THREE.Mesh>(null);
  const solid = useRef<THREE.LineSegments>(null);
  const dashed = useRef<THREE.LineSegments>(null);
  const dotStart = useRef(-1);
  const previousBeat = useRef(lastHeartbeat);

  const geometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0]), 3),
    );
    return buffer;
  }, []);

  useFrame(({ clock }) => {
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const point = target.current;
    position.setXYZ(1, point.x, point.y, point.z);
    position.needsUpdate = true;

    if (lastHeartbeat !== previousBeat.current) {
      previousBeat.current = lastHeartbeat;
      dotStart.current = clock.elapsedTime;
    }

    const age = Math.max(0, Date.now() / 1000 - lastHeartbeat);
    const dead = age > DEAD_AFTER;
    const lost = age > LOST_AFTER;

    if (solid.current) solid.current.visible = !dead && !lost;
    if (dashed.current) {
      dashed.current.visible = !dead && lost;
      if (dashed.current.visible) dashed.current.computeLineDistances();
    }

    const marker = dot.current;
    if (!marker) return;
    marker.visible = !dead && dotStart.current >= 0;
    if (!marker.visible) return;
    const progress = (clock.elapsedTime - dotStart.current) / 0.6;
    if (progress > 1) {
      marker.visible = false;
      return;
    }
    marker.position.set(
      point.x * (1 - progress),
      point.y * (1 - progress),
      point.z * (1 - progress),
    );
  });

  return (
    <group>
      <lineSegments ref={solid} geometry={geometry}>
        <lineBasicMaterial color={COLORS.ink} transparent opacity={0.42} />
      </lineSegments>
      <lineSegments ref={dashed} geometry={geometry}>
        <lineDashedMaterial
          color={COLORS.ink}
          transparent
          opacity={0.55}
          dashSize={0.24}
          gapSize={0.18}
        />
      </lineSegments>
      <mesh ref={dot}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial color={COLORS.ink} />
      </mesh>
    </group>
  );
}
