import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

export function useColumns(ref: RefObject<HTMLDivElement | null>, minimum = 180, maximum = 6) {
  const [columns, setColumns] = useState(Math.min(4, maximum));
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () =>
      setColumns(Math.max(1, Math.min(maximum, Math.floor(element.clientWidth / minimum))));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, minimum, maximum]);
  return columns;
}
