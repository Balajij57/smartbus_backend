import FleetTrackingMap from './FleetTrackingMap';
import type { TrackingProgressVillage, TrackingSnapshot } from '../../lib/api';

export default function LiveMap({
  snapshot,
  villages,
  collegeName = 'Aditya University',
}: {
  snapshot: TrackingSnapshot | null;
  villages: TrackingProgressVillage[];
  collegeName?: string;
}) {
  return <FleetTrackingMap snapshot={snapshot} villages={villages} collegeName={collegeName} />;
}
