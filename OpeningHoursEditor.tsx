import React from 'react';
import { OpeningHours, DayHours } from '../lib/types';

const DAYS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
] as const;

type DayKey = typeof DAYS[number]['key'];

export const DEFAULT_OPENING_HOURS: OpeningHours = Object.fromEntries(
  DAYS.map(({ key }) => [
    key,
    { open: '11:00', close: '22:00', last_booking: '21:00', closed: key === 'sunday' },
  ])
);

interface ValidationError {
  day: string;
  message: string;
}

function validateHours(hours: OpeningHours): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const { key, label } of DAYS) {
    const h = hours[key];
    if (!h || h.closed) continue;
    if (!h.open) { errors.push({ day: key, message: `${label}: opening time is required` }); continue; }
    if (!h.close) { errors.push({ day: key, message: `${label}: closing time is required` }); continue; }
    if (h.close <= h.open) {
      errors.push({ day: key, message: `${label}: closing time must be after opening time` });
    }
    if (h.last_booking) {
      if (h.last_booking < h.open || h.last_booking > h.close) {
        errors.push({ day: key, message: `${label}: last booking time must be between opening and closing` });
      }
    }
  }
  return errors;
}

interface OpeningHoursEditorProps {
  value: OpeningHours;
  onChange: (hours: OpeningHours) => void;
  errors?: ValidationError[];
}

export function OpeningHoursEditor({ value, onChange, errors }: OpeningHoursEditorProps) {
  const hours = value && Object.keys(value).length > 0 ? value : DEFAULT_OPENING_HOURS;

  const updateDay = (dayKey: DayKey, patch: Partial<DayHours>) => {
    const existing: DayHours = hours[dayKey] || { open: '11:00', close: '22:00', closed: false };
    onChange({ ...hours, [dayKey]: { ...existing, ...patch } });
  };

  const applyMonFri = () => {
    const mon = hours['monday'] || { open: '11:00', close: '22:00', closed: false };
    const updated = { ...hours };
    (['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as DayKey[]).forEach(d => {
      updated[d] = { ...mon };
    });
    onChange(updated);
  };

  const copyToAll = () => {
    const mon = hours['monday'] || { open: '11:00', close: '22:00', closed: false };
    const updated: OpeningHours = {};
    DAYS.forEach(({ key }) => { updated[key] = { ...mon }; });
    onChange(updated);
  };

  const markAllOpen = () => {
    const updated = { ...hours };
    DAYS.forEach(({ key }) => {
      updated[key] = { ...(updated[key] || { open: '11:00', close: '22:00' }), closed: false };
    });
    onChange(updated);
  };

  const markAllClosed = () => {
    const updated = { ...hours };
    DAYS.forEach(({ key }) => {
      updated[key] = { ...(updated[key] || { open: '', close: '' }), closed: true };
    });
    onChange(updated);
  };

  const globalErrors = errors?.filter(e => !DAYS.some(d => d.key === e.day)) || [];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={applyMonFri}
          className="text-xs px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
        >
          Copy Mon to Fri
        </button>
        <button
          type="button"
          onClick={copyToAll}
          className="text-xs px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
        >
          Copy Monday to all
        </button>
        <button
          type="button"
          onClick={markAllOpen}
          className="text-xs px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
        >
          Mark all open
        </button>
        <button
          type="button"
          onClick={markAllClosed}
          className="text-xs px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
        >
          Mark all closed
        </button>
      </div>

      {globalErrors.map((e, i) => (
        <p key={i} className="text-sm text-red-600 mb-2">{e.message}</p>
      ))}

      <div className="space-y-2">
        {DAYS.map(({ key, label }) => {
          const day: DayHours = hours[key] || { open: '', close: '', closed: false };
          const isClosed = day.closed ?? false;
          const dayErrors = errors?.filter(e => e.day === key) || [];

          const timeInputClass = 'text-sm px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors [color-scheme:dark]';

          return (
            <div
              key={key}
              className={`p-3 rounded-lg border transition-colors ${
                isClosed ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-800 border-slate-700'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Day name + toggle */}
                <div className="flex items-center gap-3 min-w-0 sm:w-36 flex-shrink-0">
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={!isClosed}
                      onChange={e => updateDay(key, { closed: !e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-600 rounded-full peer peer-checked:bg-blue-600 transition-colors" />
                    <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4" />
                  </label>
                  <span className={`text-sm font-medium ${isClosed ? 'text-slate-500' : 'text-slate-200'}`}>
                    {label}
                  </span>
                </div>

                {isClosed ? (
                  <span className="text-sm text-slate-500 italic">Closed</span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-slate-400 w-7">From</label>
                      <input
                        type="time"
                        value={day.open || ''}
                        onChange={e => updateDay(key, { open: e.target.value })}
                        className={timeInputClass}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-slate-400 w-4">to</label>
                      <input
                        type="time"
                        value={day.close || ''}
                        onChange={e => updateDay(key, { close: e.target.value })}
                        className={timeInputClass}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-slate-400 whitespace-nowrap">Last booking</label>
                      <input
                        type="time"
                        value={day.last_booking || ''}
                        onChange={e => updateDay(key, { last_booking: e.target.value || undefined })}
                        className={timeInputClass}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                )}
              </div>

              {dayErrors.map((e, i) => (
                <p key={i} className="text-xs text-red-400 mt-1.5 ml-12">{e.message}</p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { validateHours };
export type { ValidationError };
