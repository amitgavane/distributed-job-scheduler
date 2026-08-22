import { ReactElement, useEffect, useState } from 'react';
import { ResponsiveContainer } from 'recharts';

interface Props {
  height: number;
  children: ReactElement;
}

export function ChartBox({ height, children }: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => {
      cancelAnimationFrame(id);
      setReady(false);
    };
  }, []);

  return (
    <div style={{ width: '100%', height, minHeight: height }}>
      {ready ? (
        <ResponsiveContainer width="100%" height={height} minWidth={0} debounce={50}>
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
