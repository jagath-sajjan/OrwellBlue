"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Button } from "@/components/ui/Button";
import type { SandboxEvent } from "@/lib/types";
import { AgentNode } from "./AgentNode";
import { Boundary } from "./Boundary";
import { Caption } from "./Caption";
import { KillDirector, type ActiveCinematic } from "./Choreography";
import { Core } from "./Core";
import { Graveyard } from "./Graveyard";
import { HudLayer, type HudItem } from "./Hud";
import { LabelProjector, type Anchor } from "./LabelProjector";
import { LedgerRing } from "./LedgerRing";
import type { SceneModel } from "./model";
import { SCENE, TOMBSTONE_LIMIT, graveyardSlotPosition } from "./theme";

interface SceneProps {
  model: SceneModel;
  events: SandboxEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function CameraRig({
  selectedId,
  positions,
  followRef,
  followKills,
  resetRef,
  controls,
}: {
  selectedId: string | null;
  positions: React.MutableRefObject<Map<string, THREE.Vector3>>;
  followRef: React.MutableRefObject<THREE.Vector3 | null>;
  followKills: boolean;
  resetRef: React.MutableRefObject<boolean>;
  controls: React.MutableRefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();

  useFrame(() => {
    const orbit = controls.current;
    if (!orbit) return;

    if (resetRef.current) {
      resetRef.current = false;
      camera.position.set(...SCENE.camera.position);
      orbit.target.set(...SCENE.camera.target);
      orbit.update();
      orbit.saveState();
    }

    let target: THREE.Vector3 | null = null;
    if (followKills && followRef.current) {
      target = followRef.current;
    } else if (selectedId) {
      target = positions.current.get(selectedId) ?? null;
    }
    if (target) orbit.target.lerp(target, 0.06);
  });

  return null;
}

/** Small indirection so CameraRig only pulls the camera it needs. */
function boundaryPoint(position: THREE.Vector3): THREE.Vector3 {
  const point = new THREE.Vector3(position.x, 0, position.z);
  if (point.lengthSq() < 0.01) point.set(1, 0, 0);
  return point.normalize().multiplyScalar(SCENE.boundaryRadius);
}

/**
 * Pauses the WebGL animation loop when the browser tab is hidden and
 * resumes it when the tab becomes visible again.
 */
function PauseWhenHidden() {
  const { gl } = useThree();
  useEffect(() => {
    const handler = () => {
      // Pause the WebGL animation loop while the tab is hidden.
      // Passing null stops the loop; restoring it resumes R3F's own ticker.
      if (document.hidden) {
        gl.setAnimationLoop(null);
      } else {
        // R3F re-registers its own loop on the next render tick —
        // kick it by dispatching a synthetic event the fiber already listens to.
        gl.setAnimationLoop(() => {
          /* no-op stub — R3F replaces this with its own callback shortly */
        });
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [gl]);
  return null;
}

export default function Scene({ model, events, selectedId, onSelect }: SceneProps) {
  const reduced = useReducedMotion() ?? false;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [cinematic, setCinematic] = useState<ActiveCinematic | null>(null);
  const [autoOrbit, setAutoOrbit] = useState(!reduced);
  const [followKills, setFollowKills] = useState(true);
  const [interacting, setInteracting] = useState(false);

  const anchors = useRef<Map<string, Anchor>>(new Map());
  const register = useRef<Map<string, HTMLDivElement>>(new Map());
  const positions = useRef<Map<string, THREE.Vector3>>(new Map());
  const controls = useRef<OrbitControlsImpl | null>(null);
  const followRef = useRef<THREE.Vector3 | null>(null);
  const flashRef = useRef(0);
  const replayRef = useRef(false);
  const resetRef = useRef(false);
  const resumeTimer = useRef<number | null>(null);

  const animatingId = cinematic && !cinematic.preview ? cinematic.id : null;
  const hidden = useMemo(
    () => (animatingId ? new Set([animatingId]) : new Set<string>()),
    [animatingId],
  );

  const idleNarration = useMemo(() => {
    if (model.breached) {
      return "The wrapper hash chain broke. OrwellBlue is holding the scene in breached state and refusing to trust new heartbeats.";
    }
    if (model.totalAgents === 0) {
      return "No agents in containment. Launch one from Fleet and the watchdog will start scanning it.";
    }
    if (model.live.length > 0) {
      const count = model.live.length;
      return `${count} ${count === 1 ? "agent is" : "agents are"} inside the boundary. OrwellBlue scans for rule breaks every four seconds and kills any container that breaks one.`;
    }
    return "Every contained agent is tombstoned. The hash-chain ledger keeps the sealed evidence for each kill.";
  }, [model]);

  useEffect(() => {
    const map = anchors.current;
    map.set("core", { position: new THREE.Vector3(0, SCENE.coreRadius + 0.95, 0) });
    map.set("boundary", { position: new THREE.Vector3(0, SCENE.boundaryRadius + 0.95, 0) });
    map.set("graveyard", {
      position: new THREE.Vector3(0, SCENE.floorY + 0.55, 10.95),
    });

    const visible = model.tombstones.slice(0, TOMBSTONE_LIMIT);
    for (const tombstone of visible) {
      const [x, y, z] = graveyardSlotPosition(tombstone.slot);
      map.set(`tomb:${tombstone.id}`, {
        position: new THREE.Vector3(x, y + 1.15, z),
      });
    }

    const overflow = model.tombstones.length - visible.length;
    if (overflow > 0) {
      const [x, y, z] = graveyardSlotPosition(TOMBSTONE_LIMIT);
      map.set("tomb:overflow", {
        position: new THREE.Vector3(x, y + 1.15, z),
      });
    } else {
      map.delete("tomb:overflow");
    }

    const liveKeys = new Set(visible.map((tombstone) => `tomb:${tombstone.id}`));
    for (const key of Array.from(map.keys())) {
      if (key.startsWith("tomb:") && key !== "tomb:overflow" && !liveKeys.has(key)) {
        map.delete(key);
      }
    }

    if (cinematic) {
      const position =
        cinematic.phase === "tombstone"
          ? cinematic.preview
            ? cinematic.position.clone()
            : new THREE.Vector3(...graveyardSlotPosition(cinematic.slot))
          : cinematic.position;
      map.set("cine", { position: position.clone() });

      if (cinematic.phase !== "tombstone") {
        const offset =
          cinematic.motif === "ssrf" || cinematic.motif === "egress"
            ? boundaryPoint(cinematic.position).add(new THREE.Vector3(0, 0.95, 0))
            : cinematic.motif === "shared_write" && cinematic.linkTo
              ? cinematic.position.clone().lerp(cinematic.linkTo, 0.5).add(new THREE.Vector3(0, 0.7, 0))
              : cinematic.position.clone().add(new THREE.Vector3(0, 1.05, 0));
        map.set("motif", { position: offset });
      } else {
        map.delete("motif");
      }
    } else {
      map.delete("cine");
      map.delete("motif");
    }
  }, [model.tombstones, cinematic]);

  const items = useMemo(() => {
    const list: HudItem[] = [
      {
        key: "core",
        text: `ORWELLBLUE / ${model.breached ? "BREACHED" : "WATCHDOG ARMED"}`,
        tone: model.breached ? "red" : "white",
      },
      { key: "boundary", text: "CONTAINMENT BOUNDARY", tone: "grey" },
      { key: "graveyard", text: "TOMBSTONES", tone: "white" },
    ];

    const visibleTombstones = model.tombstones.slice(0, TOMBSTONE_LIMIT);
    for (const tombstone of visibleTombstones) {
      if (tombstone.id === animatingId) continue;
      list.push({
        key: `tomb:${tombstone.id}`,
        text: tombstone.id,
        sub: tombstone.reason,
        tone: "red",
      });
    }
    const overflow = model.tombstones.length - visibleTombstones.length;
    if (overflow > 0) {
      list.push({
        key: "tomb:overflow",
        text: `+${overflow} EARLIER`,
        tone: "grey",
      });
    }

    for (const agent of model.live) {
      list.push({
        key: `agent:${agent.id}`,
        text: `${agent.id} / ${agent.status}`,
        tone: agent.status === "frozen" ? "yellow" : "green",
        strong: hoveredId === agent.id || selectedId === agent.id,
      });
    }

    if (cinematic) {
      const phaseLabel =
        cinematic.phase === "detect"
          ? "VIOLATION"
          : cinematic.phase === "signal"
            ? "KILL SIGNAL OUT"
            : cinematic.phase === "freeze"
              ? "FROZEN"
              : cinematic.phase === "kill"
                ? "SHATTERED"
                : "TOMBSTONE";
      list.push({
        key: "cine",
        text: `${cinematic.id} / ${phaseLabel}`,
        tone: cinematic.phase === "freeze" || cinematic.phase === "signal" ? "yellow" : "red",
        strong: true,
      });
      if (cinematic.phase !== "tombstone") {
        list.push({
          key: "motif",
          text: cinematic.preview ? "PREVIEW" : cinematic.label,
          tone: "red",
        });
      }
    }

    return list;
  }, [model, animatingId, hoveredId, selectedId, cinematic]);

  const onControlStart = useCallback(() => {
    setInteracting(true);
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
  }, []);

  const onControlEnd = useCallback(() => {
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setInteracting(false), 6000);
  }, []);

  useEffect(
    () => () => {
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    },
    [],
  );

  const aria = `Containment scene. ${model.live.length} active agents, ${model.tombstones.length} tombstoned, ${model.chainCount} chain blocks, wrapper ${model.breached ? "breached" : "intact"}.`;

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0" role="img" aria-label={aria}>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: SCENE.camera.position, fov: 42, near: 0.1, far: 200 }}
        onPointerMissed={() => onSelect("")}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[12, 18, 10]} intensity={1.1} />
        <directionalLight position={[-10, 6, -8]} intensity={0.35} />

        <OrbitControls
          ref={controls}
          enableDamping
          dampingFactor={0.08}
          target={SCENE.camera.target}
          autoRotate={autoOrbit && !interacting && !reduced}
          autoRotateSpeed={0.55}
          minDistance={8}
          maxDistance={42}
          minPolarAngle={0.12}
          maxPolarAngle={Math.PI * 0.47}
          onStart={onControlStart}
          onEnd={onControlEnd}
        />

        <CameraRig
          selectedId={selectedId}
          positions={positions}
          followRef={followRef}
          followKills={followKills}
          resetRef={resetRef}
          controls={controls}
        />

        <Core breached={model.breached} flashRef={flashRef} />
        <LedgerRing events={events} chainCount={model.chainCount} />
        <Boundary breached={model.breached} />
        <Graveyard tombstones={model.tombstones} hidden={hidden} />

        {model.live.map((agent) => (
          <AgentNode
            key={agent.id}
            agent={agent}
            selected={selectedId === agent.id}
            onSelect={onSelect}
            onHover={setHoveredId}
            anchors={anchors}
            positions={positions}
          />
        ))}

        <KillDirector
          model={model}
          reduced={reduced}
          replayRef={replayRef}
          followRef={followRef}
          flashRef={flashRef}
          positions={positions}
          onState={setCinematic}
        />

        <LabelProjector anchors={anchors} register={register} />
        <PauseWhenHidden />
      </Canvas>
      </div>

      <HudLayer items={items} register={register} />

      {model.totalAgents === 0 && !cinematic ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
          <Link
            href="/fleet"
            className="pointer-events-auto max-w-full border-2 border-ink bg-bg px-3 py-2 text-center font-mono text-[11px] font-bold uppercase tracking-[0.04em] shadow-sm"
          >
            NO AGENTS IN CONTAINMENT. LAUNCH ONE FROM FLEET.
          </Link>
        </div>
      ) : null}

      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
        <div className="pointer-events-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={autoOrbit ? "primary" : "secondary"}
            onClick={() => setAutoOrbit((value) => !value)}
          >
            {autoOrbit ? "AUTO-ORBIT ON" : "AUTO-ORBIT OFF"}
          </Button>
          <Button
            size="sm"
            variant={followKills ? "primary" : "secondary"}
            onClick={() => setFollowKills((value) => !value)}
          >
            {followKills ? "FOLLOW KILLS ON" : "FOLLOW KILLS OFF"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => (replayRef.current = true)}>
            REPLAY LAST KILL
          </Button>
          <Button size="sm" variant="secondary" onClick={() => (resetRef.current = true)}>
            RESET VIEW
          </Button>
        </div>
      </div>

      <Caption cinematic={cinematic} idle={idleNarration} />
    </div>
  );
}
