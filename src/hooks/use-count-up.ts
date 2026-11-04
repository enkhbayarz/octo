import { useEffect, useRef, useState } from 'react';

/**
 * Counts from the previous value to `target` (ease-out), so earned XP visibly ticks up.
 * `initial` (default: `target`) is where the first render starts counting from.
 */
export function useCountUp(target: number, duration = 900, initial = target): number {
  const [shown, setShown] = useState(initial);
  const from = useRef(initial);

  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    const startedAt = Date.now();
    let frame = 0;

    const step = () => {
      const t = Math.min(1, (Date.now() - startedAt) / duration);
      setShown(Math.round(start + (target - start) * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      from.current = target;
    };
  }, [target, duration]);

  return shown;
}
