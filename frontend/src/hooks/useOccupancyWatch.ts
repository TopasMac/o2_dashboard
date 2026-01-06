import { useEffect, useState } from 'react';
import { fetchOccupancyWatch, type WatchParams, type OccupancyRow } from '../api/occupancyWatch';

export function useOccupancyWatch(params: WatchParams) {
  const [data, setData] = useState<OccupancyRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchOccupancyWatch(params)
      .then(rows => { if (!cancelled) { setData(rows); setErr(null); } })
      .catch(e => { if (!cancelled) setErr(e as Error); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params.period, params.city, params.low, params.high, params.filter]);

  return { data, loading, err };
}