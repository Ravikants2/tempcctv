import { useState } from 'react';
import { formatINR, formatINRInWords } from '../../utils/calculations';

export function CostValue({ amount }: { amount: number }) {
  const [tooltip, setTooltip] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const words = formatINRInWords(amount);

  const showWords = (element: HTMLSpanElement) => {
    const bounds = element.getBoundingClientRect();
    const left = Math.max(8, Math.min(bounds.left, window.innerWidth - 308));
    const above = bounds.top > 64;
    setTooltip({ left, top: above ? bounds.top - 8 : bounds.bottom + 8, above });
  };

  return (
    <span
      className="relative"
      title={words}
      onMouseEnter={event => showWords(event.currentTarget)}
      onMouseLeave={() => setTooltip(null)}
    >
      {formatINR(amount)}
      {tooltip && (
        <span
          role="tooltip"
          className="pointer-events-none fixed z-[100] max-w-[300px] -translate-y-full whitespace-normal rounded-md bg-gray-900 px-3 py-2 text-left text-xs font-normal leading-5 text-white shadow-lg"
          style={{
            left: tooltip.left,
            top: tooltip.top,
            transform: tooltip.above ? 'translateY(-100%)' : 'none',
          }}
        >
          {words}
        </span>
      )}
    </span>
  );
}
