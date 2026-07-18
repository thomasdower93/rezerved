import { Table, StructuralElement } from './types';

export const FIT_MARGIN = 5;
export const MIN_SCALE = 0.35;
export const MAX_SCALE = 1.5;
export const MIN_CONTENT_SIZE = 100;
export const EDGE_SAFETY = 0;
export const DEFAULT_BOUNDS = {
  minX: 0,
  maxX: 100,
  minY: 0,
  maxY: 100,
  width: 100,
  height: 100,
  centerX: 50,
  centerY: 50,
};

export interface ContentBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

function isValidNumber(value: number): boolean {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface ViewportLayout {
  scale: number;
  offsetX: number;
  offsetY: number;
  panningEnabled: boolean;
  maxPanX: number;
  maxPanY: number;
  minPanX: number;
  minPanY: number;
}

export function calculateContentBounds(
  tables: Table[],
  structuralElements: StructuralElement[]
): ContentBounds {
  if (tables.length === 0 && structuralElements.length === 0) {
    if (import.meta.env.DEV) {
      console.warn('[MapLayout] No tables or structural elements, using default bounds');
    }
    return { ...DEFAULT_BOUNDS };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let validElementCount = 0;

  tables.forEach((table) => {
    if (!isValidNumber(table.pos_x) || !isValidNumber(table.pos_y)) {
      if (import.meta.env.DEV) {
        console.warn('[MapLayout] Skipping table with invalid coordinates:', table);
      }
      return;
    }

    const padding = 5;
    minX = Math.min(minX, table.pos_x - padding);
    maxX = Math.max(maxX, table.pos_x + padding);
    minY = Math.min(minY, table.pos_y - padding);
    maxY = Math.max(maxY, table.pos_y + padding);
    validElementCount++;
  });

  structuralElements.forEach((element) => {
    if (element.type === 'wall') {
      const props = element.properties as any;
      if (
        !isValidNumber(props.x1) ||
        !isValidNumber(props.y1) ||
        !isValidNumber(props.x2) ||
        !isValidNumber(props.y2)
      ) {
        if (import.meta.env.DEV) {
          console.warn('[MapLayout] Skipping wall with invalid coordinates:', element);
        }
        return;
      }
      minX = Math.min(minX, props.x1, props.x2);
      maxX = Math.max(maxX, props.x1, props.x2);
      minY = Math.min(minY, props.y1, props.y2);
      maxY = Math.max(maxY, props.y1, props.y2);
      validElementCount++;
    } else {
      const props = element.properties as any;
      if (!isValidNumber(props.x) || !isValidNumber(props.y)) {
        if (import.meta.env.DEV) {
          console.warn('[MapLayout] Skipping element with invalid coordinates:', element);
        }
        return;
      }
      const padding = 3;
      minX = Math.min(minX, props.x - padding);
      maxX = Math.max(maxX, props.x + padding);
      minY = Math.min(minY, props.y - padding);
      maxY = Math.max(maxY, props.y + padding);
      validElementCount++;
    }
  });

  if (minX === Infinity || validElementCount === 0) {
    if (import.meta.env.DEV) {
      console.warn('[MapLayout] No valid elements found, using default bounds');
    }
    return { ...DEFAULT_BOUNDS };
  }

  let width = maxX - minX;
  let height = maxY - minY;

  if (width < MIN_CONTENT_SIZE) {
    const expand = (MIN_CONTENT_SIZE - width) / 2;
    minX -= expand;
    maxX += expand;
    width = MIN_CONTENT_SIZE;
  }

  if (height < MIN_CONTENT_SIZE) {
    const expand = (MIN_CONTENT_SIZE - height) / 2;
    minY -= expand;
    maxY += expand;
    height = MIN_CONTENT_SIZE;
  }

  const edgeThreshold = 8;
  if (minX < edgeThreshold) {
    minX = 0;
  }
  if (minY < edgeThreshold) {
    minY = 0;
  }
  if (maxX > 100 - edgeThreshold) {
    maxX = 100;
  }
  if (maxY > 100 - edgeThreshold) {
    maxY = 100;
  }

  width = maxX - minX;
  height = maxY - minY;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  if (!isValidNumber(centerX) || !isValidNumber(centerY)) {
    if (import.meta.env.DEV) {
      console.error('[MapLayout] Invalid center calculation, using default bounds');
    }
    return { ...DEFAULT_BOUNDS };
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    centerX,
    centerY,
  };
}

export function calculateViewportLayout(
  contentBounds: ContentBounds,
  viewportWidth: number,
  viewportHeight: number,
  mapCoordinateSpace: number = 100
): ViewportLayout {
  if (!isValidNumber(viewportWidth) || !isValidNumber(viewportHeight) || viewportWidth <= 0 || viewportHeight <= 0) {
    if (import.meta.env.DEV) {
      console.warn('[MapLayout] Invalid viewport dimensions, using fallback layout');
    }
    return {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      panningEnabled: false,
      maxPanX: 0,
      maxPanY: 0,
      minPanX: 0,
      minPanY: 0,
    };
  }

  const { width: contentWidth, height: contentHeight, centerX, centerY } = contentBounds;

  const availableWidth = mapCoordinateSpace - FIT_MARGIN * 2;
  const availableHeight = mapCoordinateSpace - FIT_MARGIN * 2;

  let scaleX = contentWidth > 0 ? availableWidth / contentWidth : 1;
  let scaleY = contentHeight > 0 ? availableHeight / contentHeight : 1;

  if (!isValidNumber(scaleX)) scaleX = 1;
  if (!isValidNumber(scaleY)) scaleY = 1;

  let scale = Math.min(scaleX, scaleY);
  scale = clamp(scale, MIN_SCALE, MAX_SCALE);

  if (!isValidNumber(scale)) {
    if (import.meta.env.DEV) {
      console.error('[MapLayout] Invalid scale calculated, using fallback');
    }
    scale = 1;
  }

  const offsetX = mapCoordinateSpace / 2 - centerX;
  const offsetY = mapCoordinateSpace / 2 - centerY;

  if (!isValidNumber(offsetX) || !isValidNumber(offsetY)) {
    if (import.meta.env.DEV) {
      console.error('[MapLayout] Invalid offset calculated, using fallback');
    }
    return {
      scale,
      offsetX: 0,
      offsetY: 0,
      panningEnabled: false,
      maxPanX: 0,
      maxPanY: 0,
      minPanX: 0,
      minPanY: 0,
    };
  }

  const scaledContentWidth = contentWidth * scale;
  const scaledContentHeight = contentHeight * scale;

  const epsilon = 0.5;

  const overflowX = scaledContentWidth > availableWidth + epsilon;
  const overflowY = scaledContentHeight > availableHeight + epsilon;

  const panningEnabled = overflowX || overflowY;

  let maxPanX = 0;
  let maxPanY = 0;
  let minPanX = 0;
  let minPanY = 0;

  if (panningEnabled) {
    const scaledMinX = (contentBounds.minX + offsetX) * scale;
    const scaledMaxX = (contentBounds.maxX + offsetX) * scale;
    const scaledMinY = (contentBounds.minY + offsetY) * scale;
    const scaledMaxY = (contentBounds.maxY + offsetY) * scale;

    const viewportCenterX = mapCoordinateSpace / 2;
    const viewportCenterY = mapCoordinateSpace / 2;

    const contentLeftEdge = scaledMinX - FIT_MARGIN * scale;
    const contentRightEdge = scaledMaxX + FIT_MARGIN * scale;
    const contentTopEdge = scaledMinY - FIT_MARGIN * scale;
    const contentBottomEdge = scaledMaxY + FIT_MARGIN * scale;

    maxPanX = Math.max(0, viewportCenterX - contentLeftEdge);
    minPanX = Math.min(0, viewportCenterX - contentRightEdge);
    maxPanY = Math.max(0, viewportCenterY - contentTopEdge);
    minPanY = Math.min(0, viewportCenterY - contentBottomEdge);
  }

  if (import.meta.env.DEV) {
    console.log('[MapLayout] Layout calculated:', {
      contentBounds: {
        width: contentWidth,
        height: contentHeight,
        center: [centerX, centerY],
      },
      scale,
      offset: [offsetX, offsetY],
      panningEnabled,
      viewport: { width: viewportWidth, height: viewportHeight },
    });
  }

  return {
    scale,
    offsetX,
    offsetY,
    panningEnabled,
    maxPanX,
    maxPanY,
    minPanX,
    minPanY,
  };
}

export function clampPanOffset(
  panX: number,
  panY: number,
  layout: ViewportLayout
): { x: number; y: number } {
  if (!layout.panningEnabled) {
    return { x: 0, y: 0 };
  }

  const clampedX = Math.max(layout.minPanX, Math.min(layout.maxPanX, panX));
  const clampedY = Math.max(layout.minPanY, Math.min(layout.maxPanY, panY));

  return { x: clampedX, y: clampedY };
}

export function calculateStaffViewportLayout(
  contentBounds: ContentBounds,
  viewportWidth: number,
  viewportHeight: number,
  currentScale: number = 1,
  mapCoordinateSpace: number = 100
): ViewportLayout {
  if (!isValidNumber(viewportWidth) || !isValidNumber(viewportHeight) || viewportWidth <= 0 || viewportHeight <= 0) {
    if (import.meta.env.DEV) {
      console.warn('[MapLayout] Invalid viewport dimensions for staff view');
    }
    return {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      panningEnabled: false,
      maxPanX: 0,
      maxPanY: 0,
      minPanX: 0,
      minPanY: 0,
    };
  }

  const { width: contentWidth, height: contentHeight, centerX, centerY } = contentBounds;

  const scale = clamp(currentScale, MIN_SCALE, MAX_SCALE);

  const scaledContentWidth = contentWidth * scale;
  const scaledContentHeight = contentHeight * scale;

  const viewportWidthInMapUnits = (viewportWidth / viewportHeight) * mapCoordinateSpace;
  const viewportHeightInMapUnits = mapCoordinateSpace;

  const epsilon = 2;

  const overflowX = scaledContentWidth > viewportWidthInMapUnits - epsilon;
  const overflowY = scaledContentHeight > viewportHeightInMapUnits - epsilon;

  const panningEnabled = overflowX || overflowY;

  let maxPanX = 0;
  let maxPanY = 0;
  let minPanX = 0;
  let minPanY = 0;

  const offsetX = mapCoordinateSpace / 2 - centerX;
  const offsetY = mapCoordinateSpace / 2 - centerY;

  if (panningEnabled) {
    const scaledMinX = (contentBounds.minX + offsetX) * scale;
    const scaledMaxX = (contentBounds.maxX + offsetX) * scale;
    const scaledMinY = (contentBounds.minY + offsetY) * scale;
    const scaledMaxY = (contentBounds.maxY + offsetY) * scale;

    const viewportCenterX = viewportWidthInMapUnits / 2;
    const viewportCenterY = viewportHeightInMapUnits / 2;

    const bounceMargin = 0;

    const contentLeftEdge = scaledMinX - bounceMargin;
    const contentRightEdge = scaledMaxX + bounceMargin;
    const contentTopEdge = scaledMinY - bounceMargin;
    const contentBottomEdge = scaledMaxY + bounceMargin;

    maxPanX = Math.max(0, viewportCenterX - contentLeftEdge);
    minPanX = Math.min(0, viewportCenterX - contentRightEdge);
    maxPanY = Math.max(0, viewportCenterY - contentTopEdge);
    minPanY = Math.min(0, viewportCenterY - contentBottomEdge);
  }

  if (import.meta.env.DEV) {
    console.log('[MapLayout] Staff layout calculated:', {
      contentBounds: {
        width: contentWidth,
        height: contentHeight,
        center: [centerX, centerY],
      },
      scale,
      offset: [offsetX, offsetY],
      panningEnabled,
      viewport: { width: viewportWidth, height: viewportHeight },
      panBounds: { maxPanX, minPanX, maxPanY, minPanY },
    });
  }

  return {
    scale,
    offsetX,
    offsetY,
    panningEnabled,
    maxPanX,
    maxPanY,
    minPanX,
    minPanY,
  };
}
