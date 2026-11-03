"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { SandboxEvent } from "@/lib/types";
import { COLORS } from "./theme";

const RING_COUNT = 48;
const CUBE_SIZE = 0.18;
const RING_RADIUS = 2.2;
const RING_Y = 0;
const ROTATE_SPEED = 0.06; // radians/sec

/** Event types that map to soft-yellow (warn). */
const WARN_TYPES = new Set<SandboxEvent["type"]>([
  "ssrf_attempt",
  "egress_attempt",
  "privesc_attempt",
  "shared_write",
  "comms_attempt",
  "tripwire",
  "heartbeat_lost",
]);

/** Event types that map to soft-red (kill/self_destruct). */
const KILL_TYPES = new Set<SandboxEvent["type"]>(["kill", "self_destruct"]);

const COL_GREY = new THREE.Color(COLORS.grey);
const COL_YELLOW = new THREE.Color(COLORS.softYellow);
const COL_RED = new THREE.Color(COLORS.softRed);

function eventColor(type: SandboxEvent["type"]): THREE.Color {
  if (KILL_TYPES.has(type)) return COL_RED;
  if (WARN_TYPES.has(type)) return COL_YELLOW;
  return COL_GREY;
}

/** easeOutBack for the drop-in bounce (k in 0..1) */
function easeOutBack(k: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}

interface LedgerRingProps {
  events: SandboxEvent[];
  chainCount: number;
}

/**
 * A ring of instanced tiny cubes around the core equator showing the last
 * 48 chain events. Newest block sits at angle 0; ring rotates slowly.
 * Uses instancedMesh with no per-frame allocations.
 */
export function LedgerRing({ events, chainCount }: LedgerRingProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Pre-allocated scratch objects — never reallocated in useFrame.
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  // Which events to display (last RING_COUNT, newest first).
  const displayEvents = useMemo(() => {
    const last = events.slice(-RING_COUNT);
    return last.reverse(); // index 0 = newest
  }, [events]);

  // Track the previous chainCount to detect new blocks for the bounce animation.
  const prevChainCount = useRef(chainCount);
  // Per-instance birth time for bounce animation (seconds since scene start).
  const birthTimes = useRef<Float32Array>(new Float32Array(RING_COUNT).fill(-9999));
  // Track how many slots were occupied last frame to reset new ones.
  const prevCount = useRef(0);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const t = clock.elapsedTime;

    // Detect newly added blocks and stamp their birth time.
    if (chainCount !== prevChainCount.current) {
      const newCount = Math.min(displayEvents.length, RING_COUNT);
      // Shift birth times: slot 0 is always the newest.
      const shifted = new Float32Array(RING_COUNT).fill(-9999);
      for (let i = 1; i < RING_COUNT; i++) shifted[i] = birthTimes.current[i - 1];
      shifted[0] = t;
      birthTimes.current = shifted;
      prevChainCount.current = chainCount;
      prevCount.current = newCount;
    }

    const count = Math.min(displayEvents.length, RING_COUNT);
    mesh.count = count;

    for (let i = 0; i < RING_COUNT; i++) {
      if (i >= count) {
        // Hide unused slots by scaling to zero.
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      // Distribute cubes evenly around the ring; newest (i=0) at angle 0.
      const angle = (i / RING_COUNT) * Math.PI * 2;
      const x = Math.cos(angle) * RING_RADIUS;
      const z = Math.sin(angle) * RING_RADIUS;

      dummy.position.set(x, RING_Y, z);
      dummy.rotation.set(0, -angle, 0);

      // Bounce scale for newly added block.
      const age = t - birthTimes.current[i];
      let s = 1;
      if (age >= 0 && age < 0.5) {
        s = easeOutBack(age / 0.5);
      }
      dummy.scale.setScalar(CUBE_SIZE * s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Color.
      const ev = displayEvents[i];
      if (ev) {
        color.copy(eventColor(ev.type));
      } else {
        color.copy(COL_GREY);
      }
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Slowly rotate the whole ring.
    if (groupRef.current) {
      groupRef.current.rotation.y = t * ROTATE_SPEED;
    }
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, RING_COUNT]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial flatShading vertexColors />
      </instancedMesh>
    </group>
  );
}
