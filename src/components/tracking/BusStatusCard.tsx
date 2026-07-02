import { Card, Badge } from '../ui';

export default function BusStatusCard({
  busNumber,
  tripStatus,
  speedKmph,
  lastUpdatedAt,
  currentLocationLabel,
}: {
  busNumber: string;
  tripStatus: string;
  speedKmph?: number;
  lastUpdatedAt?: string | null;
  currentLocationLabel?: string | null;
}) {
  return (
    <Card>
      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Bus</p>
          <p className="mt-1 text-2xl font-black text-blue-600">{busNumber || '—'}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Trip Status</p>
          <div className="mt-2">
            <Badge tone={tripStatus === 'active' ? 'green' : tripStatus === 'inactive' ? 'slate' : 'amber'}>{tripStatus}</Badge>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Current Speed</p>
          <p className="mt-1 text-2xl font-black text-emerald-600">{Math.round(speedKmph || 0)} km/h</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Last Updated</p>
          <p className="mt-1 text-sm font-bold text-slate-700">{lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : '—'}</p>
          {currentLocationLabel && <p className="mt-1 text-xs text-slate-500">{currentLocationLabel}</p>}
        </div>
      </div>
    </Card>
  );
}
