import { useLayoutEffect, useMemo, useRef, useState } from 'react';

// A single path avoids antialiased seams between repeated image tiles.
export function wavePath(width: number) {
  const ends = Math.ceil((width + 30) / 15);
  return (
    'M0 13Q7.5 5 15 13' +
    Array.from({ length: Math.max(0, ends - 1) }, (_, i) => `T${(i + 2) * 15} 13`).join('')
  );
}

export function Waveform() {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(300);
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const update = () => {
      const measured = parent.getBoundingClientRect().width;
      if (measured > 0) setWidth(Math.ceil(measured));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  const path = useMemo(() => wavePath(width), [width]);
  return (
    <svg ref={ref} viewBox={`0 0 ${width + 30} 26`} preserveAspectRatio="none" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
