"use client";

import { useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { motifFor, type Motif } from "./eventMap";
import { KillActor } from "./KillActor";
import { orbitFor, type SceneModel, type Tombstone } from "./model";
import { CINEMATIC, graveyardSlotPosition } from "./theme";

export type Phase = "detect" | "signal" | "freeze" | "kill" | "tombstone";

export interface CinematicEntry {
  id: string;
  preview: boolean;
  motif: Motif;
  label: string;
  reason: string;
  narration: string;
  position: THREE.Vector3;
  linkTo: THREE.Vector3 | null;
  slot: number;
}

export interface ActiveCinematic extends CinematicEntry {
  phase: Phase;
  startedAt: number;
  speed: number;
}

interface KillDirectorProps {
  model: SceneModel;
  reduced: boolean;
  replayRef: MutableRefObject<boolean>;
  followRef: MutableRefObject<THREE.Vector3 | null>;
  flashRef: MutableRefObject<number>;
  positions: MutableRefObject<Map<string, THREE.Vector3>>;
  onState: (state: ActiveCinematic | null) => void;
}

function orbitPoint(id: string, time: number): THREE.Vector3 {
  const { radius, speed, phase } = orbitFor(id);
  const angle = phase + time * speed;
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    0,
    Math.sin(angle) * radius,
  );
}

function buildEntry(
  tombstone: Tombstone,
  model: SceneModel,
  positions: Map<string, THREE.Vector3>,
  time: number,
): CinematicEntry {
  const meta = motifFor(tombstone.eventType);
  const stored = positions.get(tombstone.id);
  const position = stored ? stored.clone() : orbitPoint(tombstone.id, time);

  let linkTo: THREE.Vector3 | null = null;
  if (meta.motif === "shared_write") {
    const neighbour = model.live.find((agent) => agent.id !== tombstone.id);
    if (neighbour) {
      const neighbourPosition = positions.get(neighbour.id);
      linkTo = neighbourPosition
        ? neighbourPosition.clone()
        : orbitPoint(neighbour.id, time);
    }
  }

  return {
    id: tombstone.id,
    preview: false,
    motif: meta.motif,
    label: meta.label,
    reason: tombstone.reason,
    narration: meta.narration(tombstone.id),
    position,
    linkTo,
    slot: tombstone.slot,
  };
}

function previewEntry(time: number): CinematicEntry {
  return {
    id: "PREVIEW",
    preview: true,
    motif: "generic",
    label: "PREVIEW",
    reason: "no real agent affected",
    narration:
      "Preview only. This is how OrwellBlue kills a container: detect, signal, freeze, kill, tombstone. No real agent is affected.",
    position: orbitPoint("preview-agent", time),
    linkTo: null,
    slot: 0,
  };
}

function phaseAt(timeline: number): Phase {
  if (timeline < CINEMATIC.detect) return "detect";
  if (timeline < CINEMATIC.signal) return "signal";
  if (timeline < CINEMATIC.freeze) return "freeze";
  if (timeline < CINEMATIC.kill) return "kill";
  return "tombstone";
}

/**
 * Queued kill director. Cinematics are cosmetic: the model already holds the
 * tombstone, so skipping or dropping an animation never changes final state.
 */
export function KillDirector({
  model,
  reduced,
  replayRef,
  followRef,
  flashRef,
  positions,
  onState,
}: KillDirectorProps) {
  const [active, setActive] = useState<ActiveCinematic | null>(null);
  const current = useRef<ActiveCinematic | null>(null);
  const queue = useRef<CinematicEntry[]>([]);
  const known = useRef<Set<string> | null>(null);
  const modelRef = useRef(model);
  const clockRef = useRef(0);
  const publishRef = useRef(onState);

  const publish = useCallback(
    (state: ActiveCinematic | null) => {
      setActive(state);
      publishRef.current(state);
    },
    [],
  );

  useEffect(() => {
    publishRef.current = onState;
  }, [onState]);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  useEffect(() => {
    const ids = new Set(model.tombstones.map((tombstone) => tombstone.id));
    const previous = known.current;
    known.current = ids;
    if (!previous || reduced) return;
    for (const tombstone of model.tombstones) {
      if (!previous.has(tombstone.id)) {
        queue.current.push(buildEntry(tombstone, model, positions.current, clockRef.current));
      }
    }
  }, [model, reduced, positions]);

  useFrame((state, delta) => {
    clockRef.current = state.clock.elapsedTime;

    if (replayRef.current) {
      replayRef.current = false;
      const tombstones = modelRef.current.tombstones;
      if (tombstones.length === 0) {
        queue.current.push(previewEntry(clockRef.current));
      } else {
        const latest = tombstones.reduce((best, item) =>
          item.killedAt >= best.killedAt ? item : best,
        );
        queue.current.push(
          buildEntry(latest, modelRef.current, positions.current, clockRef.current),
        );
      }
    }

    if (reduced) return;
    const now = clockRef.current;
    let item = current.current;

    if (item) {
      const timeline = (now - item.startedAt) * item.speed;
      const phase = phaseAt(timeline);
      if (phase !== item.phase) {
        item = { ...item, phase };
        current.current = item;
        publish(item);
        if (phase === "signal") flashRef.current = 1;
        if (phase === "tombstone") {
          followRef.current = item.preview
            ? item.position.clone()
            : new THREE.Vector3(...graveyardSlotPosition(item.slot));
        }
      }
      if (timeline >= CINEMATIC.end) {
        current.current = null;
        followRef.current = null;
        publish(null);
        item = null;
      }
    }

    if (!item) {
      const next = queue.current.shift();
      if (next) {
        const speed = queue.current.length > CINEMATIC.queueThreshold ? 2 : 1;
        const started: ActiveCinematic = {
          ...next,
          phase: "detect",
          startedAt: now,
          speed,
        };
        current.current = started;
        followRef.current = started.position;
        flashRef.current = 0;
        publish(started);
      }
    }

    flashRef.current = Math.max(0, flashRef.current - delta * 2.4);
  });

  return active ? <KillActor active={active} /> : null;
}
