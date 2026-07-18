import { V1LayoutData, V2LayoutData, V2LayoutObject, Table, StructuralElement, Wall, DoorWindowWC } from '../lib/types';

const LEGACY_CANVAS_WIDTH = 800;
const LEGACY_CANVAS_HEIGHT = 600;

const V2_WORLD_BOUNDS = {
  minX: -5000,
  minY: -5000,
  maxX: 5000,
  maxY: 5000,
};

function convertTableToV2Object(table: Table): V2LayoutObject {
  const baseSize = table.shape === 'circle' ? 60 : 80;
  const width = baseSize * (table.scale_x || 1);
  const height = baseSize * (table.scale_y || 1);

  // Convert percentage coordinates (0-100) to world coordinates (centered at 0,0)
  // Formula: worldX = (percentage / 100) * canvas_width - canvas_width / 2
  const worldX = (table.pos_x / 100) * LEGACY_CANVAS_WIDTH - LEGACY_CANVAS_WIDTH / 2;
  const worldY = (table.pos_y / 100) * LEGACY_CANVAS_HEIGHT - LEGACY_CANVAS_HEIGHT / 2;

  return {
    id: table.id,
    type: 'table',
    worldX,
    worldY,
    width,
    height,
    rotation: table.rotation || 0,
    zIndex: 10,
    name: table.name,
    capacity: table.capacity,
    shape: table.shape,
    areaId: table.area_id,
    locked: false,
    properties: {
      tableId: table.id,
      capacity: table.capacity,
      tableNumber: table.name,
    },
  };
}

function convertStructuralElementToV2Objects(element: StructuralElement): V2LayoutObject[] {
  const objects: V2LayoutObject[] = [];

  if (element.type === 'wall') {
    const wall = element.properties as Wall;
    // Convert percentage coordinates to world coordinates
    const centerX_pct = (wall.x1 + wall.x2) / 2;
    const centerY_pct = (wall.y1 + wall.y2) / 2;
    const centerX = (centerX_pct / 100) * LEGACY_CANVAS_WIDTH - LEGACY_CANVAS_WIDTH / 2;
    const centerY = (centerY_pct / 100) * LEGACY_CANVAS_HEIGHT - LEGACY_CANVAS_HEIGHT / 2;

    // Calculate length in pixels (convert percentage difference to pixel difference)
    const dx_pct = wall.x2 - wall.x1;
    const dy_pct = wall.y2 - wall.y1;
    const dx_px = (dx_pct / 100) * LEGACY_CANVAS_WIDTH;
    const dy_px = (dy_pct / 100) * LEGACY_CANVAS_HEIGHT;
    const length = Math.sqrt(dx_px * dx_px + dy_px * dy_px);
    const angle = Math.atan2(dy_px, dx_px);

    objects.push({
      id: element.id,
      type: 'wall',
      worldX: centerX,
      worldY: centerY,
      width: length,
      height: 10,
      rotation: angle * (180 / Math.PI),
      zIndex: 0,
      areaId: element.area_id,
      locked: false,
    });
  } else {
    const dwc = element.properties as DoorWindowWC;
    const size = element.type === 'wc' ? 40 : 30;

    // Convert percentage coordinates to world coordinates
    const worldX = (dwc.x / 100) * LEGACY_CANVAS_WIDTH - LEGACY_CANVAS_WIDTH / 2;
    const worldY = (dwc.y / 100) * LEGACY_CANVAS_HEIGHT - LEGACY_CANVAS_HEIGHT / 2;

    objects.push({
      id: element.id,
      type: element.type as 'door' | 'window' | 'wc',
      worldX,
      worldY,
      width: size,
      height: size,
      rotation: dwc.rotation || 0,
      zIndex: 1,
      areaId: element.area_id,
      locked: false,
    });
  }

  return objects;
}

export function convertV1ToV2(v1Data: V1LayoutData): V2LayoutData {
  const objects: V2LayoutObject[] = [];

  v1Data.tables.forEach(table => {
    objects.push(convertTableToV2Object(table));
  });

  v1Data.structural_elements.forEach(element => {
    objects.push(...convertStructuralElementToV2Objects(element));
  });

  return {
    version: 2,
    world: {
      bounds: V2_WORLD_BOUNDS,
    },
    camera: {
      panX: 0,
      panY: 0,
      zoom: 1,
    },
    objects,
  };
}

export function isV1LayoutData(data: any): data is V1LayoutData {
  return (
    data &&
    Array.isArray(data.tables) &&
    Array.isArray(data.areas) &&
    Array.isArray(data.structural_elements)
  );
}

export function isV2LayoutData(data: any): data is V2LayoutData {
  return (
    data &&
    data.version === 2 &&
    data.world &&
    data.camera &&
    Array.isArray(data.objects)
  );
}

export function cleanupOrphanedObjects(
  layout: V2LayoutData,
  validTableIds: Set<string>,
  validAreaIds: Set<string>
): V2LayoutData {
  const cleanedObjects = layout.objects.filter(obj => {
    if (obj.type === 'table') {
      const tableId = obj.properties?.tableId;
      if (tableId && !validTableIds.has(tableId)) {
        console.log('[cleanupOrphanedObjects] Removing orphaned table object:', obj.id, 'referencing deleted table:', tableId);
        return false;
      }
    }

    if (obj.areaId && !validAreaIds.has(obj.areaId)) {
      console.log('[cleanupOrphanedObjects] Removing object:', obj.id, 'referencing deleted area:', obj.areaId);
      return false;
    }

    return true;
  });

  const removedCount = layout.objects.length - cleanedObjects.length;
  if (removedCount > 0) {
    console.log(`[cleanupOrphanedObjects] Removed ${removedCount} orphaned objects`);
  }

  return {
    ...layout,
    objects: cleanedObjects,
  };
}

export function getLayoutAsV2(layoutData: V1LayoutData | V2LayoutData): V2LayoutData {
  if (isV2LayoutData(layoutData)) {
    return layoutData;
  }

  if (isV1LayoutData(layoutData)) {
    return convertV1ToV2(layoutData);
  }

  return {
    version: 2,
    world: {
      bounds: V2_WORLD_BOUNDS,
    },
    camera: {
      panX: 0,
      panY: 0,
      zoom: 1,
    },
    objects: [],
  };
}
