"use client";

import { useFrame, useThree } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useRef } from "react";
import * as THREE from "three";

export interface Anchor {
  position: THREE.Vector3;
}

interface LabelProjectorProps {
  anchors: MutableRefObject<Map<string, Anchor>>;
  register: MutableRefObject<Map<string, HTMLDivElement>>;
  maxDistance?: number;
}

const FADE_START = 20;
const FADE_RANGE = 22;
const MIN_OPACITY = 0.45;
const MAX_LABELS = 96;
const RADIAL_X = 34;
const RADIAL_Y = 24;

/**
 * Projects world anchors into screen space and writes transforms straight to
 * the HUD DOM nodes. No React work happens per frame and no allocation is made
 * inside useFrame beyond style strings.
 */
export function LabelProjector({ anchors, register, maxDistance = 34 }: LabelProjectorProps) {
  const { camera, size } = useThree();
  const projected = useRef(new THREE.Vector3());
  const placedX = useRef(new Float32Array(MAX_LABELS));
  const placedY = useRef(new Float32Array(MAX_LABELS));

  useFrame(() => {
    const point = projected.current;
    const labels = register.current;
    const xs = placedX.current;
    const ys = placedY.current;
    let placed = 0;
    const halfWidth = size.width / 2;
    const halfHeight = size.height / 2;

    for (const [key, anchor] of anchors.current) {
      const element = labels.get(key);
      if (!element) continue;

      point.copy(anchor.position).project(camera);
      if (point.z < -1 || point.z > 1) {
        element.style.opacity = "0";
        continue;
      }

      const screenX = point.x * halfWidth + halfWidth;
      const screenY = -point.y * halfHeight + halfHeight;
      if (screenX < -90 || screenX > size.width + 90 || screenY < -50 || screenY > size.height + 60) {
        element.style.opacity = "0";
        continue;
      }

      const distance = camera.position.distanceTo(anchor.position);
      if (distance > maxDistance) {
        element.style.opacity = "0";
        continue;
      }

      const dx = screenX - halfWidth;
      const dy = screenY - halfHeight;
      const length = Math.sqrt(dx * dx + dy * dy) || 1;
      const x = screenX + (dx / length) * RADIAL_X;
      let y = screenY + (dy / length) * RADIAL_Y;

      for (let attempt = 0; attempt < 4; attempt += 1) {
        let collides = false;
        for (let index = 0; index < placed; index += 1) {
          if (Math.abs(x - xs[index]) < 52 && Math.abs(y - ys[index]) < 17) {
            collides = true;
            break;
          }
        }
        if (!collides) break;
        y -= 19;
      }

      if (placed < MAX_LABELS) {
        xs[placed] = x;
        ys[placed] = y;
        placed += 1;
      }

      const opacity = THREE.MathUtils.clamp(
        1 - (distance - FADE_START) / FADE_RANGE,
        MIN_OPACITY,
        1,
      );
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      element.style.opacity = opacity.toFixed(2);
    }
  });

  return null;
}
