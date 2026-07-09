import type { Locator } from "@playwright/test";

export type Box = { x: number; y: number; width: number; height: number };

export async function getBoundingBox(locator: Locator): Promise<Box | null> {
  const box = await locator.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) return null;
  return box;
}

/** True when two axis-aligned boxes overlap by more than `margin` px (negative margin = require gap). */
export function boxesOverlap(a: Box, b: Box, margin = 0): boolean {
  return !(
    a.x + a.width + margin <= b.x ||
    b.x + b.width + margin <= a.x ||
    a.y + a.height + margin <= b.y ||
    b.y + b.height + margin <= a.y
  );
}

/** Vertical center delta between two boxes (px). */
export function verticalCenterDelta(a: Box, b: Box): number {
  const aCenter = a.y + a.height / 2;
  const bCenter = b.y + b.height / 2;
  return Math.abs(aCenter - bCenter);
}

/**
 * Assert sibling locators do not overlap each other (pairwise).
 * Skips hidden/zero-size elements.
 */
export async function assertNoInternalOverlap(
  locators: Locator[],
  margin = 2,
): Promise<void> {
  const boxes: Box[] = [];
  for (const loc of locators) {
    const count = await loc.count();
    if (count === 0) continue;
    const box = await getBoundingBox(loc.first());
    if (box) boxes.push(box);
  }

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(boxes[i], boxes[j], margin)) {
        throw new Error(
          `Layout overlap detected between elements ${i} and ${j}: ` +
            `${JSON.stringify(boxes[i])} vs ${JSON.stringify(boxes[j])}`,
        );
      }
    }
  }
}

/** Title and badge row should share roughly the same vertical center (flex row). */
export function assertVerticallyAligned(
  titleBox: Box,
  badgeBox: Box,
  maxDeltaPx = 24,
): void {
  const delta = verticalCenterDelta(titleBox, badgeBox);
  if (delta > maxDeltaPx) {
    throw new Error(
      `Profile header misalignment: title/badge vertical center delta ${delta}px (max ${maxDeltaPx}px). ` +
        `title=${JSON.stringify(titleBox)} badges=${JSON.stringify(badgeBox)}`,
    );
  }
}

/** Nav bar should sit above page content and not sit under a modal overlay. */
export function assertNavNotObscuredByOverlay(navBox: Box, overlayBox: Box | null): void {
  if (!overlayBox) return;
  if (boxesOverlap(navBox, overlayBox, -4)) {
    throw new Error(
      `Nav appears obscured by overlay: nav=${JSON.stringify(navBox)} overlay=${JSON.stringify(overlayBox)}`,
    );
  }
}
