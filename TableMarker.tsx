import React, { useState, useEffect } from 'react';
import { SeatBubbles } from './SeatBubbles';

interface TableMarkerProps {
  name: string;
  capacity: number;
  shape: 'circle' | 'square' | 'rectangle';
  status?: 'green' | 'yellow' | 'red';
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  showLabels?: boolean;
  isFocused?: boolean;
  isMuted?: boolean;
  isCustomerView?: boolean;
}

export function TableMarker({ name, capacity, shape, status, scaleX = 1, scaleY = 1, rotation = 0, showLabels = true, isFocused = false, isMuted = false, isCustomerView = false }: TableMarkerProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const getBaseDimensions = () => {
    const mobileScale = isMobile ? 0.7 : 1;
    switch (shape) {
      case 'circle':
      case 'square':
        return { width: 64 * mobileScale, height: 64 * mobileScale };
      case 'rectangle':
        return { width: 80 * mobileScale, height: 56 * mobileScale };
    }
  };

  const getScaledDimensions = () => {
    const base = getBaseDimensions();
    if (shape === 'circle' || shape === 'square') {
      const uniformScale = scaleX;
      return {
        width: base.width * uniformScale,
        height: base.height * uniformScale,
      };
    } else {
      return {
        width: base.width * scaleX,
        height: base.height * scaleY,
      };
    }
  };

  const getShapeStyles = () => {
    const borderWidth = isMobile ? 'border-2' : 'border-[3px]';
    const baseStyles = `${borderWidth} flex items-center justify-center transition-all duration-200`;
    const roundedClass = shape === 'circle' ? 'rounded-full' : 'rounded-lg';

    if (status) {
      if (isCustomerView) {
        const statusColors = isMuted ? {
          green: 'border-emerald-700/30 bg-emerald-600/30',
          yellow: 'border-amber-600/30 bg-amber-500/30',
          red: 'border-slate-500/30 bg-slate-400/30',
        } : {
          green: isFocused ? 'border-blue-600 bg-emerald-600 shadow-md' : 'border-emerald-700 bg-emerald-600 shadow-sm',
          yellow: isFocused ? 'border-blue-600 bg-amber-500 shadow-md' : 'border-amber-600 bg-amber-500 shadow-sm',
          red: 'border-slate-500 bg-slate-400 opacity-70 shadow-sm',
        };
        return `${baseStyles} ${statusColors[status]} ${roundedClass}`;
      } else {
        const statusColors = isMuted ? {
          green: 'border-green-500/40 bg-green-400/40 shadow-sm',
          yellow: 'border-yellow-500/40 bg-yellow-300/40 shadow-sm',
          red: 'border-red-500/40 bg-red-400/40 shadow-sm',
        } : {
          green: 'border-green-600 bg-green-500 shadow-lg',
          yellow: 'border-yellow-600 bg-yellow-400 shadow-lg',
          red: 'border-red-600 bg-red-500 shadow-lg',
        };
        return `${baseStyles} ${statusColors[status]} ${roundedClass}`;
      }
    } else {
      return `${baseStyles} border-blue-600 bg-blue-500 ${roundedClass} hover:shadow-xl shadow-lg`;
    }
  };

  const dimensions = getScaledDimensions();
  const fontSize = isMobile ? 'text-xs' : 'text-sm';
  const capacitySize = isMobile ? 'text-[10px]' : 'text-xs';

  const getTextColor = () => {
    return 'text-white';
  };

  return (
    <div
      className="relative pointer-events-none"
      style={{
        transform: `rotate(${rotation}deg) ${isFocused ? 'scale(1.08)' : 'scale(1)'}`,
        transformOrigin: 'center center'
      }}
    >
      <SeatBubbles capacity={capacity} shape={shape} scaleX={scaleX} scaleY={scaleY} isMobile={isMobile} />
      <div
        className={getShapeStyles()}
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          pointerEvents: 'none',
        }}
      >
        {showLabels && (
          <div className="text-center">
            <div className={`font-semibold ${fontSize} ${getTextColor()}`}>{name}</div>
            <div className={`${capacitySize} ${getTextColor()}`}>{capacity}</div>
          </div>
        )}
      </div>
    </div>
  );
}
