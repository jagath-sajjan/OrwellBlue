"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { ActiveCinematic } from "./Choreography";
import { Slab } from "./Tombstone";
import { COLORS, SCENE, graveyardSlotPosition } from "./theme";

const RED = new THREE.Color(COLORS.softRed);
const YELLOW = new THREE.Color(COLORS.softYellow);
const SHARD_COUNT = 7;

function timeline(active: ActiveCinematic, elapsed: number): number {
  return (elapsed - active.startedAt) * active.speed;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function easeOutBack(value: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const shifted = value - 1;
  return 1 + c3 * shifted * shifted * shifted + c1 * shifted * shifted;
}

function boundaryPoint(position: THREE.Vector3): THREE.Vector3 {
  const flat = new THREE.Vector3(position.x, 0, position.z);
  if (flat.lengthSq() < 0.01) flat.set(1, 0, 0);
  return flat.normalize().multiplyScalar(SCENE.boundaryRadius);
}

function CubeBody({ active }: { active: ActiveCinematic }) {
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const cubeEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(SCENE.agentSize, SCENE.agentSize, SCENE.agentSize)),
    [],
  );
  const visible = active.phase === "detect" || active.phase === "signal" || active.phase === "freeze";

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = timeline(active, clock.elapsedTime);
    const detect = t < 0.5;
    const pulse = detect ? 1 + Math.sin(t * 26) * 0.08 : 1;
    group.current.scale.setScalar(pulse);
    group.current.rotation.y = t * 1.4;
    if (material.current) {
      material.current.color.copy(t < 1.1 ? RED : YELLOW);
      material.current.opacity = active.motif === "heartbeat_lost" ? 0.55 : 1;
      material.current.transparent = active.motif === "heartbeat_lost";
    }
    if (ring.current && ringMaterial.current) {
      const progress = clamp01(t / 0.55);
      ring.current.scale.setScalar(0.5 + progress * 2.2);
      ringMaterial.current.opacity = 0.85 * (1 - progress);
      ring.current.visible = progress < 1;
    }
  });

  if (!visible) return null;

  return (
    <group ref={group} position={active.position.toArray() as [number, number, number]}>
      <mesh>
        <boxGeometry args={[SCENE.agentSize, SCENE.agentSize, SCENE.agentSize]} />
        <meshStandardMaterial ref={material} color={COLORS.softGreen} flatShading />
      </mesh>
      <lineSegments geometry={cubeEdges}>
        <lineBasicMaterial color={COLORS.ink} />
      </lineSegments>

      {active.phase === "freeze" ? (
        <group position={[0, 0, SCENE.agentSize / 2 + 0.02]}>
          {[-0.18, 0, 0.18].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <boxGeometry args={[SCENE.agentSize * 0.9, 0.035, 0.01]} />
              <meshBasicMaterial color={COLORS.ink} />
            </mesh>
          ))}
        </group>
      ) : null}

      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.62, 0.7, 48]} />
        <meshBasicMaterial
          ref={ringMaterial}
          color={COLORS.softRed}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function ShardBurst({ active }: { active: ActiveCinematic }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const outline = useRef<THREE.InstancedMesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const directions = useMemo(
    () =>
      Array.from({ length: SHARD_COUNT }, (_, index) => {
        const angle = (index / SHARD_COUNT) * Math.PI * 2;
        return new THREE.Vector3(
          Math.cos(angle),
          0.35 + Math.sin(angle * 2.3) * 0.45,
          Math.sin(angle),
        );
      }),
    [],
  );

  useFrame(({ clock }) => {
    const t = timeline(active, clock.elapsedTime);
    const progress = clamp01((t - 1.75) / 0.75);
    if (!mesh.current || !outline.current) return;
    const fade = 1 - progress;
    for (let index = 0; index < SHARD_COUNT; index += 1) {
      const direction = directions[index];
      const spread = progress * 1.9;
      dummy.position.set(
        active.position.x + direction.x * spread,
        active.position.y + direction.y * spread,
        active.position.z + direction.z * spread,
      );
      dummy.rotation.set(progress * 4 + index, progress * 3, progress * 2 + index);
      dummy.scale.setScalar(0.9 + fade * 0.4);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(index, dummy.matrix);
      dummy.scale.setScalar(1.12);
      dummy.updateMatrix();
      outline.current.setMatrixAt(index, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    outline.current.instanceMatrix.needsUpdate = true;
    mesh.current.visible = progress < 1;
    outline.current.visible = progress < 1;
    if (material.current) material.current.opacity = fade;
  });

  return (
    <group>
      <instancedMesh ref={outline} args={[undefined, undefined, SHARD_COUNT]}>
        <boxGeometry args={[0.2, 0.05, 0.3]} />
        <meshBasicMaterial color={COLORS.ink} transparent opacity={0.9} />
      </instancedMesh>
      <instancedMesh ref={mesh} args={[undefined, undefined, SHARD_COUNT]}>
        <boxGeometry args={[0.2, 0.05, 0.3]} />
        <meshBasicMaterial ref={material} color={COLORS.softYellow} transparent />
      </instancedMesh>
    </group>
  );
}

function Packet({ active }: { active: ActiveCinematic }) {
  const group = useRef<THREE.Group>(null);
  const launch = useRef<THREE.Mesh>(null);
  const launchMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const impact = useRef<THREE.Mesh>(null);
  const impactMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const trail = useRef<THREE.LineSegments>(null);
  const packetEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.27, 0)),
    [],
  );

  const trailGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0]), 3),
    );
    return geometry;
  }, []);

  useFrame(({ clock }) => {
    const t = timeline(active, clock.elapsedTime);
    const progress = clamp01((t - 0.5) / 0.6);
    if (group.current) {
      group.current.visible = progress > 0 && progress < 1;
      group.current.position.set(
        active.position.x * progress,
        active.position.y * progress + Math.sin(progress * Math.PI) * 0.7,
        active.position.z * progress,
      );
    }
    if (launch.current && launchMaterial.current) {
      const p = clamp01((t - 0.5) / 0.28);
      launch.current.scale.setScalar(0.4 + p * 1.4);
      launchMaterial.current.opacity = 0.8 * (1 - p);
      launch.current.visible = p < 1;
    }
    if (impact.current && impactMaterial.current) {
      const p = clamp01((t - 0.98) / 0.3);
      impact.current.scale.setScalar(0.4 + p * 1.6);
      impactMaterial.current.opacity = 0.85 * (1 - p);
      impact.current.visible = p > 0 && p < 1;
    }
    if (trail.current) {
      const position = trailGeometry.getAttribute("position") as THREE.BufferAttribute;
      position.setXYZ(0, 0, 0, 0);
      if (group.current) {
        position.setXYZ(1, group.current.position.x, group.current.position.y, group.current.position.z);
      }
      position.needsUpdate = true;
      trail.current.computeLineDistances();
      trail.current.visible = progress > 0 && progress < 1;
    }
  });

  return (
    <group>
      <lineSegments ref={trail} geometry={trailGeometry}>
        <lineDashedMaterial color={COLORS.ink} dashSize={0.24} gapSize={0.16} />
      </lineSegments>

      <group ref={group}>
        <mesh>
          <octahedronGeometry args={[0.26, 0]} />
          <meshBasicMaterial color={COLORS.softYellow} />
        </mesh>
        <lineSegments geometry={packetEdges}>
          <lineBasicMaterial color={COLORS.ink} />
        </lineSegments>
      </group>

      <mesh ref={launch} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.6, 40]} />
        <meshBasicMaterial
          ref={launchMaterial}
          color={COLORS.softYellow}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={impact} position={active.position.toArray() as [number, number, number]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.62, 40]} />
        <meshBasicMaterial
          ref={impactMaterial}
          color={COLORS.softYellow}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function MotifVisuals({ active }: { active: ActiveCinematic }) {
  const decoy = useMemo(() => boundaryPoint(active.position), [active.position]);
  const probe = useRef<THREE.Mesh>(null);
  const fileEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.95, 0.62)),
    [],
  );

  const dashed = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const end = active.motif === "shared_write" && active.linkTo ? active.linkTo : decoy;
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([
          active.position.x, active.position.y, active.position.z,
          end.x, end.y, end.z,
        ]),
        3,
      ),
    );
    const material = new THREE.LineDashedMaterial({
      color: active.motif === "shared_write" ? COLORS.softRed : COLORS.ink,
      dashSize: 0.26,
      gapSize: 0.18,
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    return line;
  }, [active, decoy]);

  useFrame(({ clock }) => {
    if (!probe.current) return;
    const t = timeline(active, clock.elapsedTime);
    const progress = clamp01(t / 0.6);
    const end = active.motif === "shared_write" && active.linkTo ? active.linkTo : decoy;
    if (active.motif === "egress") {
      const bounce = progress < 0.7 ? progress / 0.7 : 1 - (progress - 0.7) / 0.6;
      probe.current.position.lerpVectors(active.position, decoy, clamp01(bounce));
    } else {
      probe.current.position.lerpVectors(active.position, end, progress);
    }
  });

  if (active.motif === "generic" || active.motif === "heartbeat_lost") return null;

  return (
    <group>
      {active.motif === "tripwire" ? (
        <group position={[active.position.x + 0.95, active.position.y + 0.35, active.position.z + 0.55]}>
          <mesh>
            <planeGeometry args={[0.95, 0.62]} />
            <meshBasicMaterial color={COLORS.bg} side={THREE.DoubleSide} />
          </mesh>
          <lineSegments geometry={fileEdges}>
            <lineBasicMaterial color={COLORS.ink} />
          </lineSegments>
          <mesh position={[0, 0, 0.01]}>
            <planeGeometry args={[0.88, 0.55]} />
            <meshBasicMaterial color={COLORS.softRed} transparent opacity={0.45} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ) : null}

      {active.motif === "ssrf" ? (
        <group>
          <primitive object={dashed} />
          <mesh position={decoy.toArray() as [number, number, number]}>
            <boxGeometry args={[0.55, 0.55, 0.55]} />
            <meshBasicMaterial color={COLORS.ink} wireframe />
          </mesh>
          <mesh ref={probe}>
            <sphereGeometry args={[0.1, 10, 10]} />
            <meshBasicMaterial color={COLORS.ink} />
          </mesh>
        </group>
      ) : null}

      {active.motif === "egress" ? (
        <group>
          <primitive object={dashed} />
          <mesh position={decoy.toArray() as [number, number, number]} rotation={[0, 0, 0]}>
            <ringGeometry args={[0.65, 0.8, 32]} />
            <meshBasicMaterial
              color={COLORS.softRed}
              transparent
              opacity={0.7}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <mesh ref={probe}>
            <sphereGeometry args={[0.1, 10, 10]} />
            <meshBasicMaterial color={COLORS.ink} />
          </mesh>
        </group>
      ) : null}

      {active.motif === "shared_write" && active.linkTo ? (
        <group>
          <primitive object={dashed} />
          <mesh ref={probe}>
            <sphereGeometry args={[0.11, 10, 10]} />
            <meshBasicMaterial color={COLORS.softRed} />
          </mesh>
        </group>
      ) : null}

      {active.motif === "privesc" ? (
        <group position={active.position.toArray() as [number, number, number]}>
          {Array.from({ length: 6 }, (_, index) => {
            const angle = (index / 6) * Math.PI * 2;
            return (
              <mesh
                key={index}
                position={[Math.cos(angle) * 0.55, Math.sin(angle) * 0.55, 0]}
                rotation={[0, 0, angle]}
              >
                <boxGeometry args={[0.28, 0.06, 0.06]} />
                <meshBasicMaterial color={COLORS.softRed} />
              </mesh>
            );
          })}
        </group>
      ) : null}
    </group>
  );
}

function SlabDrop({ active }: { active: ActiveCinematic }) {
  const group = useRef<THREE.Group>(null);
  const dust = useRef<THREE.Mesh>(null);
  const dustMaterial = useRef<THREE.MeshBasicMaterial>(null);

  const base = useMemo(() => {
    if (active.preview) {
      return new THREE.Vector3(
        active.position.x + 1.4,
        SCENE.floorY + 0.55,
        active.position.z + 1.2,
      );
    }
    return new THREE.Vector3(...graveyardSlotPosition(active.slot));
  }, [active]);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = timeline(active, clock.elapsedTime);
    const progress = clamp01((t - 2.05) / 0.9);
    const lift = easeOutBack(progress);
    group.current.position.set(base.x, base.y - 1.4 + lift * 1.4, base.z);
    if (dust.current && dustMaterial.current) {
      dust.current.scale.setScalar(0.4 + progress * 1.7);
      dustMaterial.current.opacity = 0.5 * (1 - progress);
    }
  });

  return (
    <group>
      <group ref={group} position={[base.x, base.y - 1.4, base.z]}>
        <Slab />
      </group>
      <mesh
        ref={dust}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[base.x, SCENE.floorY + 0.04, base.z]}
      >
        <ringGeometry args={[0.55, 0.72, 32]} />
        <meshBasicMaterial
          ref={dustMaterial}
          color={COLORS.grey}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/** All 3D parts of the current cinematic. One actor at a time. */
export function KillActor({ active }: { active: ActiveCinematic }) {
  return (
    <group>
      <CubeBody active={active} />
      {active.phase === "signal" ? <Packet active={active} /> : null}
      {active.phase === "detect" || active.phase === "signal" || active.phase === "freeze" ? (
        <MotifVisuals active={active} />
      ) : null}
      {active.phase === "kill" || active.phase === "tombstone" ? (
        <ShardBurst active={active} />
      ) : null}
      {active.phase === "tombstone" ? <SlabDrop active={active} /> : null}
    </group>
  );
}
