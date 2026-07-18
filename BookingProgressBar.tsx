import React from 'react';
import { Check, MapPin, Clock, ClipboardList, CheckCircle } from 'lucide-react';

export type BookingStep = 'search' | 'select-table' | 'details' | 'confirmation';

interface BookingProgressBarProps {
  currentStep: BookingStep;
}

const steps: { id: BookingStep; label: string; icon: React.ReactNode }[] = [
  { id: 'search', label: 'Choose Restaurant', icon: <MapPin className="w-4 h-4" /> },
  { id: 'select-table', label: 'Select Table', icon: <Clock className="w-4 h-4" /> },
  { id: 'details', label: 'Your Details', icon: <ClipboardList className="w-4 h-4" /> },
  { id: 'confirmation', label: 'Confirmed', icon: <CheckCircle className="w-4 h-4" /> },
];

const stepOrder: BookingStep[] = ['search', 'select-table', 'details', 'confirmation'];

function getStepIndex(step: BookingStep): number {
  return stepOrder.indexOf(step);
}

export function BookingProgressBar({ currentStep }: BookingProgressBarProps) {
  const currentIndex = getStepIndex(currentStep);

  return (
    <div className="w-full py-4 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between relative">
          <div
            className="absolute top-4 left-0 right-0 bg-app-border/40"
            style={{ zIndex: 0, height: '1px' }}
          />
          <div
            className="absolute top-4 left-0 bg-app-accent transition-all duration-500 ease-out"
            style={{
              height: '1px',
              width: currentIndex === 0
                ? '0%'
                : `${(currentIndex / (steps.length - 1)) * 100}%`,
              zIndex: 1,
            }}
          />

          {steps.map((step, index) => {
            const isCurrent = index === currentIndex;
            const isLastStep = index === steps.length - 1;
            const isCompleted = index < currentIndex || (isLastStep && isCurrent);

            return (
              <div
                key={step.id}
                className="flex flex-col items-center relative"
                style={{ zIndex: 2, gap: '10px' }}
              >
                <div
                  className={`
                    rounded-full flex items-center justify-center
                    transition-all duration-150 ease-out border-2
                    ${isCompleted
                      ? 'w-8 h-8 bg-app-accent border-app-accent text-white'
                      : isCurrent
                        ? 'w-9 h-9 bg-app-accent/10 border-app-accent text-app-accent ring-4 ring-app-accent/20 shadow-[0_0_16px_rgba(var(--color-accent-rgb,202,138,4),0.18)]'
                        : 'w-8 h-8 bg-app-bg border-app-border/40 text-app-text-muted'
                    }
                  `}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : isCurrent ? (
                    <div className="w-4.5 h-4.5">{step.icon}</div>
                  ) : (
                    step.icon
                  )}
                </div>
                <span
                  className={`
                    whitespace-nowrap hidden sm:block text-center
                    transition-all duration-150 ease-out
                    ${isCurrent
                      ? 'text-xs font-semibold text-app-accent'
                      : isCompleted
                        ? 'text-xs font-medium text-app-text'
                        : 'text-xs font-medium text-app-text-muted'
                    }
                  `}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
