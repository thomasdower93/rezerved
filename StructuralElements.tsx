import React from 'react';
import { StructuralElement, Wall, DoorWindowWC } from '../lib/types';
import { DoorOpen, Square, Bath, Trash2, RotateCw, Repeat, Move } from 'lucide-react';

interface StructuralElementsProps {
  elements: StructuralElement[];
  selectedElementId: string | null;
  onElementClick?: (elementId: string) => void;
  onElementDragStart?: (elementId: string, e: React.MouseEvent) => void;
  onElementTouchStart?: (elementId: string, e: React.TouchEvent) => void;
  onElementTouchEnd?: (elementId: string, e: React.TouchEvent) => void;
  onElementDelete?: (elementId: string) => void;
  onElementRotate?: (elementId: string) => void;
  onElementReverse?: (elementId: string) => void;
  onWallHandleDragStart?: (elementId: string, handleType: 'start' | 'end', e: React.MouseEvent | React.TouchEvent) => void;
  isStaffMode?: boolean;
  isMobile?: boolean;
  isCustomerView?: boolean;
}

export function StructuralElements({
  elements,
  selectedElementId,
  onElementClick,
  onElementDragStart,
  onElementTouchStart,
  onElementTouchEnd,
  onElementDelete,
  onElementRotate,
  onElementReverse,
  onWallHandleDragStart,
  isStaffMode = false,
  isMobile = false,
  isCustomerView = false
}: StructuralElementsProps) {
  const walls = elements.filter(e => e.type === 'wall');
  const nonWalls = elements.filter(e => e.type !== 'wall');

  return (
    <>
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {walls.map((element) => {
          const props = element.properties as Wall;
          return (
            <line
              key={element.id}
              x1={`${props.x1}%`}
              y1={`${props.y1}%`}
              x2={`${props.x2}%`}
              y2={`${props.y2}%`}
              stroke={isCustomerView ? "#9CA3AF" : "#475569"}
              strokeWidth={isCustomerView ? "3" : isMobile ? "8" : "4"}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`${
                isStaffMode ? 'cursor-pointer transition-opacity' : ''
              } ${selectedElementId === element.id ? 'opacity-100' : isCustomerView ? '' : 'opacity-70 hover:opacity-90'}`}
              style={{
                pointerEvents: isStaffMode ? 'auto' : 'none',
                opacity: isCustomerView ? 1 : undefined
              }}
              onClick={(e) => {
                if (isStaffMode) {
                  e.stopPropagation();
                  onElementClick?.(element.id);
                }
              }}
              onTouchEnd={(e) => {
                if (isStaffMode && isMobile) {
                  e.stopPropagation();
                  e.preventDefault();
                  onElementClick?.(element.id);
                }
              }}
            />
          );
        })}
      </svg>

      {walls.map((element) => {
        if (selectedElementId === element.id && isStaffMode) {
          const props = element.properties as Wall;
          const midX = (props.x1 + props.x2) / 2;
          const midY = (props.y1 + props.y2) / 2;

          return (
            <React.Fragment key={`wall-controls-${element.id}`}>
              <div
                className="absolute transform -translate-x-1/2 -translate-y-1/2 touch-none pointer-events-auto"
                style={{
                  left: `${props.x1}%`,
                  top: `${props.y1}%`,
                  zIndex: 31
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onWallHandleDragStart?.(element.id, 'start', e);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  onWallHandleDragStart?.(element.id, 'start', e);
                }}
              >
                <div className="w-6 h-6 bg-blue-500 active:bg-blue-600 border-2 border-white rounded-full shadow-lg flex items-center justify-center cursor-move">
                  <Move className="w-3 h-3 text-white" />
                </div>
              </div>

              <div
                className="absolute transform -translate-x-1/2 -translate-y-1/2 touch-none pointer-events-auto"
                style={{
                  left: `${props.x2}%`,
                  top: `${props.y2}%`,
                  zIndex: 31
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onWallHandleDragStart?.(element.id, 'end', e);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  onWallHandleDragStart?.(element.id, 'end', e);
                }}
              >
                <div className="w-6 h-6 bg-blue-500 active:bg-blue-600 border-2 border-white rounded-full shadow-lg flex items-center justify-center cursor-move">
                  <Move className="w-3 h-3 text-white" />
                </div>
              </div>

              <div
                className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  left: `${midX}%`,
                  top: `${midY}%`,
                  zIndex: 30
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onElementDelete?.(element.id);
                  }}
                  className="w-9 h-9 bg-red-500 active:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg pointer-events-auto"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </React.Fragment>
          );
        }
        return null;
      })}

      {nonWalls.map((element) => {
        const props = element.properties as DoorWindowWC;

        if (element.type === 'door') {
          return (
            <div
              key={element.id}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${
                isStaffMode ? 'cursor-move' : 'pointer-events-none'
              } ${selectedElementId === element.id ? 'ring-2 ring-blue-500 rounded-full' : ''}`}
              style={{
                left: `${props.x}%`,
                top: `${props.y}%`,
                transform: `translate(-50%, -50%) rotate(${props.rotation || 0}deg)`,
                zIndex: 5,
                pointerEvents: isStaffMode ? 'auto' : 'none',
              }}
              onMouseDown={(e) => {
                if (isStaffMode) {
                  e.preventDefault();
                  e.stopPropagation();
                  onElementDragStart?.(element.id, e);
                }
              }}
              onTouchStart={(e) => {
                if (isStaffMode) {
                  e.stopPropagation();
                  onElementTouchStart?.(element.id, e);
                }
              }}
              onTouchEnd={(e) => {
                if (isStaffMode) {
                  e.stopPropagation();
                  onElementTouchEnd?.(element.id, e);
                }
              }}
              onClick={(e) => {
                if (isStaffMode) {
                  e.stopPropagation();
                  onElementClick?.(element.id);
                }
              }}
            >
              <div className="relative w-12 h-12 flex items-center justify-center">
                <div className={`absolute w-1.5 h-10 rounded ${isCustomerView ? 'bg-gray-400' : 'bg-amber-900'}`} />
                <div
                  className={`absolute w-2 h-2 rounded-full ${isCustomerView ? 'bg-gray-400' : 'bg-amber-900'}`}
                  style={{
                    [props.doorDirection === 1 ? 'left' : 'right']: '50%',
                    top: '4px',
                    transform: 'translateX(-50%)'
                  }}
                />
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 28 28"
                  className="absolute"
                  style={{
                    transform: props.doorDirection === 1 ? 'none' : 'scaleX(-1)',
                    left: '50%',
                    top: '50%',
                    marginLeft: '-14px',
                    marginTop: '-14px',
                  }}
                >
                  <path
                    d="M 3 3 Q 23 3 23 23"
                    fill="none"
                    stroke={isCustomerView ? "#9CA3AF" : "#78350f"}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
                {selectedElementId === element.id && isMobile && isStaffMode && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onElementRotate?.(element.id);
                      }}
                      className="absolute -top-11 left-1/2 -translate-x-1/2 w-9 h-9 bg-green-500 active:bg-green-600 text-white rounded-full flex items-center justify-center shadow-lg z-30"
                      style={{ pointerEvents: 'auto' }}
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onElementReverse?.(element.id);
                      }}
                      className="absolute -left-12 top-1/2 -translate-y-1/2 w-9 h-9 bg-purple-500 active:bg-purple-600 text-white rounded-full flex items-center justify-center shadow-lg z-30"
                      style={{ pointerEvents: 'auto' }}
                    >
                      <Repeat className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onElementDelete?.(element.id);
                      }}
                      className="absolute -bottom-2 -right-2 w-9 h-9 bg-red-500 active:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg z-30"
                      style={{ pointerEvents: 'auto' }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        }

        if (element.type === 'window') {
          return (
            <div
              key={element.id}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${
                isStaffMode ? 'cursor-move' : 'pointer-events-none'
              } ${selectedElementId === element.id ? 'ring-2 ring-blue-500 rounded' : ''}`}
              style={{
                left: `${props.x}%`,
                top: `${props.y}%`,
                transform: `translate(-50%, -50%) rotate(${props.rotation || 0}deg)`,
                zIndex: 5,
                pointerEvents: isStaffMode ? 'auto' : 'none',
              }}
              onMouseDown={(e) => {
                if (isStaffMode) {
                  e.preventDefault();
                  e.stopPropagation();
                  onElementDragStart?.(element.id, e);
                }
              }}
              onTouchStart={(e) => {
                if (isStaffMode) {
                  e.stopPropagation();
                  onElementTouchStart?.(element.id, e);
                }
              }}
              onTouchEnd={(e) => {
                if (isStaffMode) {
                  e.stopPropagation();
                  onElementTouchEnd?.(element.id, e);
                }
              }}
              onClick={(e) => {
                if (isStaffMode) {
                  e.stopPropagation();
                  onElementClick?.(element.id);
                }
              }}
            >
              <div
                className={`w-16 h-4 border-2 rounded relative ${isCustomerView ? 'bg-slate-50/50' : 'border-sky-500 bg-sky-50'}`}
                style={isCustomerView ? {
                  borderColor: '#B6C2D1',
                  borderStyle: 'dashed',
                } : undefined}
              >
                <div className="absolute inset-0 flex">
                  <div
                    className={`flex-1 border-r ${isCustomerView ? '' : 'border-sky-300'}`}
                    style={isCustomerView ? {
                      borderRightColor: '#B6C2D1',
                      borderRightStyle: 'dashed',
                    } : undefined}
                  />
                  <div className="flex-1" />
                </div>
                {selectedElementId === element.id && isMobile && isStaffMode && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onElementRotate?.(element.id);
                      }}
                      className="absolute -top-11 left-1/2 -translate-x-1/2 w-9 h-9 bg-green-500 active:bg-green-600 text-white rounded-full flex items-center justify-center shadow-lg z-30"
                      style={{ pointerEvents: 'auto' }}
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onElementDelete?.(element.id);
                      }}
                      className="absolute -bottom-7 left-1/2 -translate-x-1/2 w-9 h-9 bg-red-500 active:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg z-30"
                      style={{ pointerEvents: 'auto' }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        }

        if (element.type === 'wc') {
          return (
            <div
              key={element.id}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${
                isStaffMode ? 'cursor-move' : 'pointer-events-none'
              } ${selectedElementId === element.id ? 'ring-2 ring-blue-500 rounded-full' : ''}`}
              style={{
                left: `${props.x}%`,
                top: `${props.y}%`,
                zIndex: 5,
                pointerEvents: isStaffMode ? 'auto' : 'none',
              }}
              onMouseDown={(e) => {
                if (isStaffMode) {
                  e.preventDefault();
                  e.stopPropagation();
                  onElementDragStart?.(element.id, e);
                }
              }}
              onTouchStart={(e) => {
                if (isStaffMode) {
                  e.stopPropagation();
                  onElementTouchStart?.(element.id, e);
                }
              }}
              onTouchEnd={(e) => {
                if (isStaffMode) {
                  e.stopPropagation();
                  onElementTouchEnd?.(element.id, e);
                }
              }}
              onClick={(e) => {
                if (isStaffMode) {
                  e.stopPropagation();
                  onElementClick?.(element.id);
                }
              }}
            >
              <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${isCustomerView ? 'bg-slate-50/50 border-gray-400' : 'bg-violet-100 border-violet-600'}`}>
                <span className={`text-xs font-bold ${isCustomerView ? 'text-gray-400' : 'text-violet-600'}`}>WC</span>
                {selectedElementId === element.id && isMobile && isStaffMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onElementDelete?.(element.id);
                    }}
                    className="absolute -bottom-2 -right-2 w-9 h-9 bg-red-500 active:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg z-30"
                    style={{ pointerEvents: 'auto' }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        }

        return null;
      })}
    </>
  );
}
