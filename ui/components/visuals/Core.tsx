"use client";

import { useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { COLORS, SCENE } from "./theme";

const WHITE = new THREE.Color(COLORS.bg);
const RED = new THREE.Color(COLORS.softRed);
const YELLOW = new THREE.Color(COLORS.softYellow);
const FLASH_COLOR = new THREE.Color();

// ── Shard helpers ────────────────────────────────────────────────────────────

const SHARD_COUNT = 5;

/** Static per-shard drift direction and rotation axis — computed once. */
const SHARD_DRIFTS: THREE.Vector3[] = Array.from({ length: SHARD_COUNT }, (_, i) => {
  const phi = (i / SHARD_COUNT) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(phi) * 0.7, 0.4 + i * 0.1, Math.sin(phi) * 0.7).normalize();
});
const SHARD_AXES: THREE.Vector3[] = Array.from({ length: SHARD_COUNT }, (_, i) =>
  new THREE.Vector3(Math.sin(i * 1.3), Math.cos(i * 0.9), Math.sin(i * 2.1)).normalize(),
);

// ── RadarRing ────────────────────────────────────────────────────────────────

function RadarRing() {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const progress = (clock.elapsedTime % 4) / 4;
    mesh.current?.scale.setScalar(0.7 + progress * 6.2);
    if (material.current) material.current.opacity = 0.55 * (1 - progress);
  });

  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.975, 1, 72]} />
      <meshBasicMaterial
        ref={material}
        color={COLORS.orwellBlue}
        transparent
        opacity={0.5}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── BreachShockwave ───────────────────────────────────────────────────────────

/**
 * One-shot soft-red ring that expands from the core outward on breach.
 * Scale goes from 1→8, opacity fades from 0.7→0 over SHOCKWAVE_DURATION seconds.
 */
const SHOCKWAVE_DURATION = 1.4;

function BreachShockwave({ startTime }: { startTime: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const age = clock.elapsedTime - startTime;
    const t = Math.min(age / SHOCKWAVE_DURATION, 1);
    if (mesh.current) mesh.current.scale.setScalar(1 + t * 7);
    if (mat.current) mat.current.opacity = 0.7 * (1 - t);
  });

  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.95, 1, 64]} />
      <meshBasicMaterial
        ref={mat}
        color={COLORS.softRed}
        transparent
        opacity={0.7}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Solid black low-poly watchdog core with white edges. Edges flash yellow
 * while a kill signal is in flight (driven by flashRef, no React churn).
 *
 * When `breached=true`:
 *  - A one-shot shockwave ring expands outward.
 *  - The solid icosahedron is replaced by 4-6 flat shards that drift apart.
 *  - Breathing/rotation continue but at reduced speed.
 */
export function Core({
  breached,
  flashRef,
}: {
  breached: boolean;
  flashRef: MutableRefObject<number>;
}) {
  const group = useRef<THREE.Group>(null);
  const edgeMaterial = useRef<THREE.LineBasicMaterial>(null);

  // useState so shockwave startTime drives a React re-render to mount BreachShockwave.
  const [shockwaveStart, setShockwaveStart] = useState<number | null>(null);

  // Track whether breach just transitioned true (using a ref, not state, to avoid churn).
  const wasBreached = useRef(false);

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(SCENE.coreRadius, 0), []);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  // Shard refs (one group per shard).
  const shardRefs = useRef<(THREE.Group | null)[]>(Array(SHARD_COUNT).fill(null));
  // Per-shard accumulated angle for continuous rotation after breach.
  const shardAngles = useRef<number[]>(Array(SHARD_COUNT).fill(0));
  // Breach start time stored in a ref for useFrame — only written once.
  const breachStartRef = useRef<number | null>(null);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;

    // Detect breach leading edge — stamp start time and trigger re-render.
    if (breached && !wasBreached.current) {
      wasBreached.current = true;
      breachStartRef.current = t;
      setShockwaveStart(t); // triggers the shockwave mount
    }

    if (group.current) {
      const scan = (t % 4) / 4;
      const speedMult = breached ? 0.35 : 1;
      const breathe = 1 + Math.sin(t * 2.2 * speedMult) * 0.03;
      const tick = 1 + Math.max(0, 1 - scan * 6) * 0.05;
      group.current.scale.setScalar(breathe * tick);
      group.current.rotation.y += delta * 0.35 * speedMult;
      group.current.rotation.x += delta * 0.1 * speedMult;
    }

    if (edgeMaterial.current) {
      FLASH_COLOR.copy(breached ? RED : WHITE).lerp(YELLOW, Math.min(1, flashRef.current));
      edgeMaterial.current.color.copy(FLASH_COLOR);
    }

    // Animate shards when breached.
    if (breached && breachStartRef.current !== null) {
      const age = t - breachStartRef.current;
      // Shards spread over 2 s, then float gently.
      const spreadT = Math.min(age / 2.0, 1);

      for (let i = 0; i < SHARD_COUNT; i++) {
        const ref = shardRefs.current[i];
        if (!ref) continue;

        const drift = SHARD_DRIFTS[i];
        const axis = SHARD_AXES[i];

        // Position: lerp from compact (inside core) to spread.
        const spread = spreadT * (1.2 + i * 0.18);
        ref.position.set(drift.x * spread, drift.y * spread, drift.z * spread);

        // Slow continuous rotation after breach.
        shardAngles.current[i] += delta * (0.18 + i * 0.06);
        const ang = shardAngles.current[i];
        ref.setRotationFromAxisAngle(axis, ang);
      }
    }
  });

  return (
    <group>
      <group ref={group}>
        {/* Normal icosahedron — hidden when breached */}
        {!breached && (
          <>
            <mesh geometry={geometry}>
              <meshStandardMaterial color={COLORS.orwellBlue} flatShading />
            </mesh>
            <lineSegments geometry={edges}>
              <lineBasicMaterial ref={edgeMaterial} color={COLORS.bg} />
            </lineSegments>
          </>
        )}

        {/* Shards — shown when breached */}
        {breached &&
          Array.from({ length: SHARD_COUNT }, (_, i) => (
            <group
              key={i}
              ref={(el) => {
                shardRefs.current[i] = el;
              }}
            >
              <mesh>
                {/* Flat elongated plane acting as a shard */}
                <planeGeometry args={[0.55 + i * 0.08, 0.22 + i * 0.04]} />
                <meshStandardMaterial
                  color={COLORS.orwellBlue}
                  flatShading
                  side={THREE.DoubleSide}
                />
              </mesh>
              <lineSegments>
                <edgesGeometry
                  attach="geometry"
                  args={[new THREE.PlaneGeometry(0.55 + i * 0.08, 0.22 + i * 0.04)]}
                />
                <lineBasicMaterial color={COLORS.softRed} />
              </lineSegments>
            </group>
          ))}
      </group>

      <RadarRing />

      {/* One-shot breach shockwave ring — mounted via React state, not ref access */}
      {shockwaveStart !== null && <BreachShockwave startTime={shockwaveStart} />}
    </group>
  );
}
