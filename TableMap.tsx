import React, { useEffect, useState } from 'react';
import { TableAvailability, StructuralElement } from '../lib/types';
import { TableMarker } from './TableMarker';
import { StructuralElements } from './StructuralElements';
import { supabase } from '../lib/supabase';
import { Circle } from 'lucide-react';

interface TableMapProps {
  tables: TableAvailability[];
  onTableClick: (table: TableAvailability) => void;
  areaId?: string;
}

export function TableMap({ tables, onTableClick, areaId }: TableMapProps) {
  const [structuralElements, setStructuralElements] = useState<StructuralElement[]>([]);

  useEffect(() => {
    if (areaId) {
      loadStructuralElements();
    }
  }, [areaId]);

  const loadStructuralElements = async () => {
    if (!areaId) return;

    try {
      const { data, error } = await supabase
        .from('structural_elements')
        .select('*')
        .eq('area_id', areaId);

      if (!error && data) {
        setStructuralElements(data);
      }
    } catch (error) {
      console.error('Failed to load structural elements:', error);
    }
  };

  const handleTableClick = (table: TableAvailability) => {
    if (table.status !== 'red') {
      onTableClick(table);
    }
  };

  return (
    <div className="w-full">
      <div className="w-full mx-auto max-w-4xl">
        <div className="bg-slate-50 rounded-xl border-2 border-slate-200 p-4 sm:p-8 relative aspect-video">
          <StructuralElements
            elements={structuralElements}
            selectedElementId={null}
            isStaffMode={false}
          />

          {tables.map((table) => (
            <div
              key={table.id}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 z-10 ${
                table.status !== 'red' ? 'hover:scale-110 cursor-pointer' : 'cursor-not-allowed'
              }`}
              style={{
                left: `${table.pos_x}%`,
                top: `${table.pos_y}%`,
              }}
              onClick={() => handleTableClick(table)}
              title={
                table.status === 'red'
                  ? table.reason || 'Not available'
                  : table.status === 'yellow'
                  ? 'Alternative time available'
                  : 'Available'
              }
            >
              <TableMarker
                name={table.name}
                capacity={table.capacity}
                shape={table.shape}
                status={table.status}
                scaleX={table.scale_x ?? 1}
                scaleY={table.scale_y ?? 1}
                rotation={table.rotation ?? 0}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 sm:mt-6 grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 bg-white rounded-lg p-3 sm:p-4 shadow-sm">
          <Circle className="w-5 h-5 sm:w-6 sm:h-6 fill-green-500 text-green-600 flex-shrink-0" />
          <div>
            <div className="font-medium text-slate-900 text-sm sm:text-base">Available</div>
            <div className="text-xs sm:text-sm text-slate-600">Book this table now</div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 bg-white rounded-lg p-3 sm:p-4 shadow-sm">
          <Circle className="w-5 h-5 sm:w-6 sm:h-6 fill-yellow-400 text-yellow-600 flex-shrink-0" />
          <div>
            <div className="font-medium text-slate-900 text-sm sm:text-base">Alternative Time</div>
            <div className="text-xs sm:text-sm text-slate-600">Different time available</div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 bg-white rounded-lg p-3 sm:p-4 shadow-sm">
          <Circle className="w-5 h-5 sm:w-6 sm:h-6 fill-red-500 text-red-600 flex-shrink-0" />
          <div>
            <div className="font-medium text-slate-900 text-sm sm:text-base">Not Available</div>
            <div className="text-xs sm:text-sm text-slate-600">Cannot book</div>
          </div>
        </div>
      </div>
    </div>
  );
}
