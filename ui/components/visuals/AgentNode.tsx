"use client";

import { useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Anchor } from "./LabelProjector";
import type { SceneAgent } from "./model";
import { Tether } from "./Tether";
import { COLORS, SCENE } from "./theme";

interface AgentNodeProps {
  agent: SceneAgent;
  selected: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  anchors: MutableRefObject<Map<string, Anchor>>;
  positions: MutableRefObject<Map<string, THREE.Vector3>>;
}

export function AgentNode({
  agent,
  selected,
  onSelect,
  onHover,
  anchors,
  positions,
}: AgentNodeProps) {
  const group = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const position = useRef(new THREE.Vector3());
  const [hovered, setHovered] = useState(false);

  const box = useMemo(
    () => new THREE.BoxGeometry(SCENE.agentSize, SCENE.agentSize, SCENE.agentSize),
    [],
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(box), [box]);

  useEffect(() => {
    const map = anchors.current;
    const registry = positions.current;
    map.set(`agent:${agent.id}`, { position: position.current });
    registry.set(agent.id, position.current);
    return () => {
      map.delete(`agent:${agent.id}`);
      box.dispose();
      edges.dispose();
    };
  }, [agent.id, anchors, positions, box, edges]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const { radius, speed, phase } = agent.orbit;
    const angle = phase + t * speed;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = 0;

    position.current.set(x, y, z);
    if (shadow.current) shadow.current.position.set(x, SCENE.floorY + 0.03, z);
    if (group.current) {
      group.current.position.copy(position.current);
      group.current.rotation.y = angle;
      group.current.rotation.x = 0;
    }
  });

  const frozen = agent.status === "frozen";
  const color = frozen ? COLORS.softYellow : COLORS.softGreen;

  return (
    <group>
      <Tether target={position} lastHeartbeat={agent.lastHeartbeat} />
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, SCENE.floorY + 0.03, 0]}>
        <circleGeometry args={[0.55, 20]} />
        <meshBasicMaterial color={COLORS.grey} transparent opacity={0.35} />
      </mesh>

      <group
        ref={group}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(agent.id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          onHover(agent.id);
        }}
        onPointerOut={() => {
          setHovered(false);
          onHover(null);
        }}
      >
        <mesh geometry={box}>
          <meshStandardMaterial color={color} flatShading />
        </mesh>
        <lineSegments geometry={edges}>
          <lineBasicMaterial color={COLORS.ink} />
        </lineSegments>

        {frozen ? (
          <group>
            <mesh position={[0, 0, SCENE.agentSize / 2 + 0.01]}>
              <planeGeometry args={[SCENE.agentSize, SCENE.agentSize]} />
              <meshBasicMaterial color={COLORS.ink} transparent opacity={0.16} wireframe />
            </mesh>
          </group>
        ) : null}

        {hovered || selected ? (
          <lineSegments geometry={edges} scale={1.22}>
            <lineBasicMaterial color={COLORS.ink} linewidth={2} />
          </lineSegments>
        ) : null}
      </group>

      {hovered || selected ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[agent.orbit.radius, 0.012, 4, 128]} />
          <meshBasicMaterial color={COLORS.ink} transparent opacity={0.55} />
        </mesh>
      ) : null}
    </group>
  );
}
