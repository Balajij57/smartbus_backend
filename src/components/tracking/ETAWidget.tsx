import { Card } from '../ui';
import { formatEta } from '../../lib/geo';

export default function ETAWidget({
  distanceRemainingKm,
  etaToNextVillageMinutes,
  etaToCollegeMinutes,
  nextVillageName,
  direction,
}: {
  distanceRemainingKm?: number;
  etaToNextVillageMinutes?: number;
  etaToCollegeMinutes?: number;
  nextVillageName?: string | null;
  direction?: string | null;
}) {
  const collegeLabel = direction === 'from_college' ? 'ETA to Home' : 'ETA to College';
  return (
    <Card>
      <div className="grid gap-4 md:grid-cols-4">
        <Tile label="Distance Remaining" value={distanceRemainingKm != null ? `${distanceRemainingKm.toFixed(2)} km` : '—'} color="text-blue-600" />
        <Tile label="Next Village" value={nextVillageName || '—'} color="text-violet-600" />
        <Tile label="ETA to Next Village" value={formatEta(etaToNextVillageMinutes)} color="text-amber-600" />
        <Tile label={collegeLabel} value={formatEta(etaToCollegeMinutes)} color="text-emerald-600" />
      </div>
    </Card>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${color}`}>{value}</p>
    </div>
  );
}
