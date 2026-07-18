import { supabase } from '../lib/supabase';
import { V2LayoutData, V2LayoutObject, TableAvailability, StructuralElement, Wall, DoorWindowWC } from '../lib/types';
import { getOrCreateLegacyFloorplan } from './floorplans';
import { getLayoutAsV2, cleanupOrphanedObjects } from './legacyAdapter';
import { getTables } from './tables';
import { getAreas } from './areas';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

export interface CustomerViewTable extends TableAvailability {
  pos_x: number;
  pos_y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  shape: 'circle' | 'square' | 'rectangle';
}

export interface CustomerViewLayout {
  tables: CustomerViewTable[];
  structuralElements: StructuralElement[];
}

export async function getCustomerViewLayout(
  restaurantId: string,
  tables: TableAvailability[],
  areaId?: string
): Promise<CustomerViewLayout> {
  try {
    const floorplan = await getOrCreateLegacyFloorplan(restaurantId);
    let v2Layout = getLayoutAsV2(floorplan.layout_data);

    const allTables = await getTables(restaurantId);
    const validTableIds = new Set(allTables.map(t => t.id));

    const areas = await getAreas(restaurantId);
    const validAreaIds = new Set(areas.map(a => a.id));

    v2Layout = cleanupOrphanedObjects(v2Layout, validTableIds, validAreaIds);

    if (import.meta.env.DEV) {
      console.log('[customerView] Floorplan loaded:', {
        version: floorplan.version,
        engine: floorplan.engine,
        totalObjects: v2Layout.objects.length,
        tableObjects: v2Layout.objects.filter(o => o.type === 'table').length,
        requestedAreaId: areaId,
        areaIdsInLayout: [...new Set(v2Layout.objects.map(o => o.areaId))],
      });
    }

    const filteredObjects = v2Layout.objects;

    if (import.meta.env.DEV) {
      const tableSample = v2Layout.objects.filter(o => o.type === 'table').slice(0, 3);
      const requestTablesSample = tables.slice(0, 3);
      console.log('[customerView] Matching Analysis:', {
        floorplanVersion: floorplan.version,
        floorplanEngine: floorplan.engine,
        totalLayoutObjects: filteredObjects.length,
        tableObjectsCount: filteredObjects.filter(o => o.type === 'table').length,
        requestTablesCount: tables.length,
        layoutTableSample: tableSample.map(o => ({
          objId: o.id,
          objName: o.name,
          propTableId: o.properties?.tableId,
          shape: o.shape,
          worldX: o.worldX,
          worldY: o.worldY,
        })),
        requestTablesSample: requestTablesSample.map(t => ({
          tableId: t.id,
          tableName: t.name,
          tableShape: t.shape,
        })),
      });
    }

    const WORLD_TO_PERCENT_WIDTH = 800;
    const WORLD_TO_PERCENT_HEIGHT = 600;

    const tablesWithLayout: CustomerViewTable[] = tables
      .map(table => {
        const layoutObj = filteredObjects.find(obj =>
          obj.type === 'table' &&
          (obj.properties?.tableId === table.id || obj.id === table.id)
        );

        if (!layoutObj) {
          if (import.meta.env.DEV) {
            console.warn('[customerView] No layout found for table:', table.id, table.name, 'area:', table.area_id);
          }
          return null;
        }

        const pos_x = 50 + (layoutObj.worldX / WORLD_TO_PERCENT_WIDTH) * 100;
        const pos_y = 50 + (layoutObj.worldY / WORLD_TO_PERCENT_HEIGHT) * 100;

        const shape = (layoutObj.shape || layoutObj.properties?.shape || table.shape || 'circle') as 'circle' | 'square' | 'rectangle';
        const baseSize = shape === 'circle' ? 60 : 80;
        const scale_x = layoutObj.width / baseSize;
        const scale_y = layoutObj.height / baseSize;

        if (import.meta.env.DEV) {
          console.log('[customerView] Matched table:', {
            id: table.id,
            name: table.name,
            matchedBy: layoutObj.properties?.tableId === table.id ? 'properties.tableId' : 'obj.id',
            objId: layoutObj.id,
            propTableId: layoutObj.properties?.tableId,
            worldX: layoutObj.worldX,
            worldY: layoutObj.worldY,
            pos_x: Math.max(5, Math.min(95, pos_x)),
            pos_y: Math.max(5, Math.min(95, pos_y)),
            shape,
          });
        }

        return {
          ...table,
          pos_x: Math.max(5, Math.min(95, pos_x)),
          pos_y: Math.max(5, Math.min(95, pos_y)),
          scale_x,
          scale_y,
          rotation: layoutObj.rotation,
          shape,
        };
      })
      .filter((table): table is CustomerViewTable => table !== null);

    if (import.meta.env.DEV) {
      console.log('[customerView] Final result:', {
        totalTables: tables.length,
        matchedTables: tablesWithLayout.length,
        totalLayoutObjects: filteredObjects.filter(o => o.type === 'table').length,
      });
    }

    const structuralElements: StructuralElement[] = filteredObjects
      .filter(obj => obj.type !== 'table' && obj.type !== 'fixture')
      .map(obj => {
        if (obj.type === 'wall') {
          const halfWidth = obj.width / 2;
          const angleRad = (obj.rotation * Math.PI) / 180;
          const dx = Math.cos(angleRad) * halfWidth;
          const dy = Math.sin(angleRad) * halfWidth;

          const x1_world = obj.worldX - dx;
          const y1_world = obj.worldY - dy;
          const x2_world = obj.worldX + dx;
          const y2_world = obj.worldY + dy;

          const x1_pct = 50 + (x1_world / WORLD_TO_PERCENT_WIDTH) * 100;
          const y1_pct = 50 + (y1_world / WORLD_TO_PERCENT_HEIGHT) * 100;
          const x2_pct = 50 + (x2_world / WORLD_TO_PERCENT_WIDTH) * 100;
          const y2_pct = 50 + (y2_world / WORLD_TO_PERCENT_HEIGHT) * 100;

          const wall: Wall = {
            x1: x1_pct,
            y1: y1_pct,
            x2: x2_pct,
            y2: y2_pct,
          };

          return {
            id: obj.id,
            area_id: obj.areaId || '',
            type: 'wall' as const,
            properties: wall,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        } else {
          const x_pct = 50 + (obj.worldX / WORLD_TO_PERCENT_WIDTH) * 100;
          const y_pct = 50 + (obj.worldY / WORLD_TO_PERCENT_HEIGHT) * 100;

          const dwc: DoorWindowWC = {
            x: x_pct,
            y: y_pct,
            rotation: obj.rotation,
          };

          return {
            id: obj.id,
            area_id: obj.areaId || '',
            type: obj.type as 'door' | 'window' | 'wc',
            properties: dwc,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }
      });

    return {
      tables: tablesWithLayout,
      structuralElements,
    };
  } catch (error) {
    console.error('Failed to load customer view layout:', error);

    return {
      tables: tables.map(table => ({
        ...table,
        pos_x: 50,
        pos_y: 50,
        scale_x: 1,
        scale_y: 1,
        rotation: 0,
        shape: table.shape || 'circle' as const,
      })),
      structuralElements: [],
    };
  }
}
