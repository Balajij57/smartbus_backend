import type { TrackingProgressVillage } from '../../lib/api';
import { Card, Badge } from '../ui';
import { cn } from '../../utils/cn';

export default function RouteProgress({ villages }: { villages: TrackingProgressVillage[] }) {
  const ordered = [...villages].sort((a, b) => a.sequence - b.sequence);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-black">Route Progress</h3>
        <Badge tone="blue">{ordered.filter((v) => v.crossed).length}/{ordered.length} crossed</Badge>
      </div>
      {ordered.length === 0 ? (
        <p className="text-sm text-slate-500">No route villages yet. Start a trip to generate the route sequence.</p>
      ) : (
        <div className="space-y-3">
          {ordered.map((v, index) => {
            const isDestination = index === ordered.length - 1 || v.kind === 'college';
            const tone = isDestination ? 'destination' : v.crossed ? 'crossed' : v.status === 'current' ? 'current' : 'pending';
            return (
              <div key={v.villageId} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      'mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black',
                      tone === 'crossed' && 'bg-emerald-500 text-white',
                      tone === 'current' && 'bg-amber-400 text-slate-900 ring-4 ring-amber-100',
                      tone === 'pending' && 'bg-slate-200 text-slate-600',
                      tone === 'destination' && 'bg-blue-600 text-white ring-4 ring-blue-100',
                    )}
                  >
                    {tone === 'crossed' ? '✓' : tone === 'destination' ? '🎓' : index + 1}
                  </span>
                  {index < ordered.length - 1 && <span className="mt-1 h-8 w-0.5 bg-slate-200" />}
                </div>
                <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-900">
                        {v.villageName} {isDestination ? '' : `(${v.studentCount || 0} students)`}
                      </p>
                      <p className="text-xs text-slate-500">
                        Sequence #{v.sequence} {v.landmark && `• Landmark: ${v.landmark}`}
                      </p>
                    </div>
                    <Badge
                      tone={
                        tone === 'crossed'
                          ? 'green'
                          : tone === 'current'
                            ? 'amber'
                            : tone === 'destination'
                              ? 'blue'
                              : 'slate'
                      }
                    >
                      {tone === 'crossed'
                        ? 'Crossed'
                        : tone === 'current'
                          ? 'Current'
                          : tone === 'destination'
                            ? 'Destination'
                            : 'Pending'}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
