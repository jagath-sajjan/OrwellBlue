"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { SceneAgent } from "./model";
import { COLORS, SCENE } from "./theme";

/** Hard cap so a pathological fleet cannot allocate an unbounded instance buffer. */
const MAX_SWARM = 140;

const GREEN = new THREE.Color(COLORS.softGreen);
const YELLOW = new THREE.Color(COLORS.softYellow);

/**
 * Overflow renderer for large fleets. Every non-detailed agent becomes one
 * instance in a single draw call, so the per-agent React/DOM/geometry cost
 * stops scaling once the detailed budget is reached.
 */
export function AgentSwarm({ agents }: { agents: SceneAgent[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const shown = useMemo(() => agents.slice(0, MAX_SWARM), [agents]);

  useFrame(({ clock }) => {
    const instanced = mesh.current;
    if (!instanced) return;
    const time = clock.elapsedTime;

    for (let index = 0; index < MAX_SWARM; index += 1) {
      const agent = shown[index];
      if (!agent) {
        dummy.position.set(0, 0, 0);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        instanced.setMatrixAt(index, dummy.matrix);
        continue;
      }

      const { radius, speed, phase } = agent.orbit;
      const angle = phase + time * speed;
      dummy.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.setScalar(agent.status === "frozen" ? 0.82 : 1);
      dummy.updateMatrix();
      instanced.setMatrixAt(index, dummy.matrix);

      color.set(agent.status === "frozen" ? YELLOW : GREEN);
      instanced.setColorAt(index, color);
    }

    instanced.count = Math.min(shown.length, MAX_SWARM);
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  });

  if (shown.length === 0) return null;

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, MAX_SWARM]}
      frustumCulled={false}
    >
      <boxGeometry
        args={[SCENE.agentSize * 0.78, SCENE.agentSize * 0.78, SCENE.agentSize * 0.78]}
      />
      <meshStandardMaterial flatShading />
    </instancedMesh>
  );
}
