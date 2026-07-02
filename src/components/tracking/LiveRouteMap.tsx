import LiveMap from './LiveMap';
import type { TrackingProgressVillage, TrackingSnapshot } from '../../lib/api';

export default function LiveRouteMap({
  snapshot,
  villages,
}: {
  snapshot: TrackingSnapshot | null;
  villages: TrackingProgressVillage[];
}) {
  return <LiveMap snapshot={snapshot} villages={villages} collegeName="Aditya University" />;
}
