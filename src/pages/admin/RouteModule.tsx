import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Card, Section, Input, Button, Badge, Empty } from '../../components/ui';

export default function RouteModule() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [routeId, setRouteId] = useState('');
  const [routeName, setRouteName] = useState('');
  const [startName, setStartName] = useState('');
  const [startLat, setStartLat] = useState('17.0504');
  const [startLng, setStartLng] = useState('82.1659');
  const [destName, setDestName] = useState('Aditya University');
  const [destLat, setDestLat] = useState('17.0912');
  const [destLng, setDestLng] = useState('82.0665');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const load = () => {
    api.listRoutes()
      .then(setRoutes)
      .catch(console.error);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeId || !routeName || !startLat || !startLng || !destLat || !destLng) {
      setErrorMsg('All fields are required');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setStatusMsg('Requesting OSRM road directions & geocoding stops...');

    try {
      const payload = {
        routeId: routeId.trim().toUpperCase(),
        routeName: routeName.trim(),
        startName: startName.trim() || 'Start Origin',
        startLat: Number(startLat),
        startLng: Number(startLng),
        destName: destName.trim() || 'College',
        destLat: Number(destLat),
        destLng: Number(destLng)
      };

      await api.createRoute(payload);
      setStatusMsg('Route successfully planned and saved to MongoDB!');
      setRouteId('');
      setRouteName('');
      setStartName('');
      load();
    } catch (err: any) {
      setErrorMsg(err.message || 'Route planning failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black">Route Management Module</h2>
        <p className="text-sm text-slate-500">
          Select starting and destination points. OSRM automatically computes intermediate village stops along the road.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <Section title="Auto-Plan New Route">
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input label="Route ID (e.g. ROUTE-E)" value={routeId} onChange={e => setRouteId(e.target.value)} required />
              <Input label="Route Name" placeholder="e.g. Samalkot to College" value={routeName} onChange={e => setRouteName(e.target.value)} required />
              
              <div className="border-t border-slate-100 my-2 pt-2">
                <p className="text-xs font-bold text-slate-500 mb-2 uppercase">Starting point (Origin)</p>
                <Input label="Origin Town/Village Name" placeholder="e.g. Samalkot" value={startName} onChange={e => setStartName(e.target.value)} />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Input label="Latitude" value={startLat} onChange={e => setStartLat(e.target.value)} required />
                  <Input label="Longitude" value={startLng} onChange={e => setStartLng(e.target.value)} required />
                </div>
              </div>

              <div className="border-t border-slate-100 my-2 pt-2">
                <p className="text-xs font-bold text-slate-500 mb-2 uppercase">Destination point (College)</p>
                <Input label="Destination Name" value={destName} onChange={e => setDestName(e.target.value)} />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Input label="Latitude" value={destLat} onChange={e => setDestLat(e.target.value)} required />
                  <Input label="Longitude" value={destLng} onChange={e => setDestLng(e.target.value)} required />
                </div>
              </div>

              {statusMsg && <div className="text-xs text-emerald-600 font-medium">{statusMsg}</div>}
              {errorMsg && <div className="text-xs text-rose-600 font-medium">{errorMsg}</div>}

              <Button type="submit" className="w-full mt-4" disabled={loading}>
                {loading ? 'Planning...' : 'Generate Route via OSRM'}
              </Button>
            </form>
          </Section>
        </Card>

        <Card className="lg:col-span-2">
          <Section title={`Planned Routes (${routes.length})`}>
            {routes.length === 0 ? <Empty message="No routes planned yet." /> : (
              <div className="space-y-4">
                {routes.map((route) => (
                  <div key={route.routeId} className="rounded-2xl border border-slate-200 p-4 bg-slate-50 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-black text-slate-900 text-lg">{route.routeName}</h4>
                        <p className="text-xs font-mono text-slate-500">{route.routeId}</p>
                      </div>
                      <Badge tone="blue">OSRM Guided</Badge>
                    </div>

                    <div className="mt-3">
                      <p className="text-xs font-bold uppercase text-slate-400">Village Progress Sequence:</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {route.villages.map((v: any, idx: number) => (
                          <div key={v.villageId} className="flex items-center gap-2">
                            <span className="rounded-lg bg-white px-2 py-1 text-xs border border-slate-200 font-medium shadow-sm">
                              {idx + 1}. {v.villageName} ({v.latitude.toFixed(4)}, {v.longitude.toFixed(4)})
                            </span>
                            {idx < route.villages.length - 1 && <span className="text-slate-400">→</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </Card>
      </div>
    </div>
  );
}
