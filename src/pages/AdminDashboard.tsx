import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, type AlertRec, type Driver, type SmsRecord, type Student, type BusRoute } from '../lib/api';
import DashboardLayout from '../components/DashboardLayout';
import { Badge, Button, Card, Empty, Input, Section } from '../components/ui';
import AddStudentModal from './admin/AddStudentModal';
import StudentDetailModal from './admin/StudentDetailModal';
import AddDriverModal from './admin/AddDriverModal';
import AssignBusModal from './admin/AssignBusModal';
import LiveFleetMap from '../components/tracking/LiveFleetMap';
import RouteModule from './admin/RouteModule';
import BusManagementModule from './admin/BusManagementModule';

const NAV = [
  { id: 'overview', label: 'Overview', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> },
  { id: 'live-fleet', label: 'Live Fleet Map', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg> },
  { id: 'routes', label: 'Route Creator', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M9 20l-5.447-2.724A2 2 0 012.44 15.53l.06-8.06a2 2 0 011.06-1.7l5.44-2.77a2 2 0 012 0l5.44 2.77a2 2 0 011.06 1.7l.06 8.06a2 2 0 01-1.11 1.748L11 20a2 2 0 01-2 0z"/></svg> },
  { id: 'buses', label: 'Bus Management', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM19 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM5 12h14v3H5zM5 8h14v2H5z" /></svg> },
  { id: 'bus-routes', label: 'Bus Routes', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M4 6h16M4 12h16M4 18h16" /></svg> },
  { id: 'students', label: 'Student Module', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M12 14 3 9l9-5 9 5-9 5Z" /><path d="M5 11v5c2 3 12 3 14 0v-5" /></svg> },
  { id: 'drivers', label: 'Driver Module', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M3 17h18M5 17V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9" /></svg> },
  { id: 'alerts', label: 'Alerts Monitor', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" /></svg> },
  { id: 'sms', label: 'SMS Log', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg> },
];

export default function AdminDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  if (!user || user.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <DashboardLayout title="Admin Control Center" subtitle="Admin Module" nav={NAV} active={tab} onChangeTab={setTab}>

      {tab === 'overview' && <Overview />}
      {tab === 'live-fleet' && <LiveFleetMap />}
      {tab === 'routes' && <RouteModule />}
      {tab === 'buses' && <BusManagementModule />}
      {tab === 'bus-routes' && <BusRoutesModule />}
      {tab === 'students' && <StudentModule />}
      {tab === 'drivers' && <DriverModule />}
      {tab === 'alerts' && <AlertsMonitor />}
      {tab === 'sms' && <SmsLog />}
    </DashboardLayout>
  );
}

function Overview() {
  const [stats, setStats] = useState({ totalStudents: 0, totalBuses: 0, activeBuses: 0, alertsLast2Days: 0, recentAlerts: [] as AlertRec[] });

  useEffect(() => {
    const load = () => api.overview().then(setStats).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total Students" value={stats.totalStudents} color="text-blue-600" icon="👥" />
        <StatCard label="Total Buses" value={stats.totalBuses} color="text-emerald-600" sub={`${stats.activeBuses} active`} icon="🚌" />
        <StatCard label="Alerts (Last 2 Days)" value={stats.alertsLast2Days} color="text-rose-600" icon="⚠️" />
      </div>

      <Card>
        <Section title="Recent Alerts (Last 2 Days)">
          {stats.recentAlerts.length === 0 ? <Empty message="No alerts in the last 2 days." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="py-3">Time</th><th>Bus</th><th>Driver</th><th>Type</th><th>Category</th><th>Message</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {stats.recentAlerts.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100">
                      <td className="py-3 font-bold">{a.date} {a.time}</td>
                      <td>{a.bus}</td>
                      <td>{a.driver_name}</td>
                      <td><Badge tone={a.type === 'Emergency' ? 'red' : 'amber'}>{a.type}</Badge></td>
                      <td>{a.category}</td>
                      <td className="max-w-xs">{a.message}</td>
                      <td><Badge tone={a.status === 'Active' ? 'red' : 'green'}>{a.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </Card>
    </div>
  );
}

function StatCard({ label, value, color, sub, icon }: { label: string; value: number; color: string; sub?: string; icon: string }) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`mt-2 text-5xl font-black ${color}`}>{value}</p>
          {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </Card>
  );
}

function StudentModule() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Student | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const load = () => api.listStudents().then(setStudents).catch(() => {});
  useEffect(() => { load(); }, []);

  const filtered = students.filter((s) =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.register_no.toLowerCase().includes(search.toLowerCase()) ||
    s.bus_details.bus_number?.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleDelete(id: string) {
    await api.deleteStudent(id);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-black">Student Management</h2>
          <p className="text-sm text-slate-500">{students.length} students registered. Click a row to view details and QR code.</p>
        </div>
        <Button onClick={() => { setEditingStudent(null); setShowAdd(true); }} size="lg">+ Add Student</Button>
      </div>

      <Card>
        <Input placeholder="Search by name, roll number or bus..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4" />
        {filtered.length === 0 ? <Empty message="No students found." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="py-3">Student</th><th>Roll No</th><th>Class</th><th>Bus</th><th>Boarding Point</th><th>Status</th></tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s._id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => setSelected(s)}>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 font-black text-white">
                          {s.name[0]}
                        </span>
                        <div>
                          <p className="font-bold">{s.name}</p>
                          <p className="text-xs text-slate-500">{s._id}</p>
                        </div>
                      </div>
                    </td>
                    <td>{s.register_no}</td>
                    <td>{s.year} {s.section && `- ${s.section}`}</td>
                    <td>{s.bus_details.bus_number ? <Badge tone="blue">{s.bus_details.bus_number}</Badge> : '—'}</td>
                    <td>{s.bus_details.boarding_point || '—'}</td>
                    <td><Badge tone="green">{s.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddStudentModal
        open={showAdd || !!editingStudent}
        studentToEdit={editingStudent}
        onClose={() => {
          setShowAdd(false);
          setEditingStudent(null);
        }}
        onCreated={load}
      />
      <StudentDetailModal
        student={selected}
        onClose={() => setSelected(null)}
        onDelete={handleDelete}
        onEdit={(student) => setEditingStudent(student)}
      />
    </div>
  );
}

function DriverModule() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [assignTo, setAssignTo] = useState<Driver | null>(null);

  const load = () => api.listDrivers().then(setDrivers).catch(() => {});
  useEffect(() => { load(); }, []);

  async function handleDelete(d: Driver) {
    if (!confirm(`Delete driver ${d.name}?`)) return;
    await api.deleteDriver(d._id);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-black">Driver Management</h2>
          <p className="text-sm text-slate-500">{drivers.length} drivers in fleet. Assign buses, view details and remove drivers.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} size="lg">+ Add Driver</Button>
      </div>

      {drivers.length === 0 ? <Empty message="No drivers added yet." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {drivers.map((d) => (
            <Card key={d._id}>
              <div className="flex items-start gap-4">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-xl font-black text-white">
                  {d.name[0]}
                </span>
                <div className="flex-1">
                  <h3 className="text-lg font-black">{d.name}</h3>
                  <p className="text-xs text-slate-500">{d.driver_id}</p>
                  <p className="mt-1 text-sm text-slate-600">📞 {d.phone}</p>
                  {d.license && <p className="text-sm text-slate-600">🪪 {d.license}</p>}
                </div>
              </div>
              <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-500">Bus</span>
                  {d.bus_number ? <Badge tone="blue">{d.bus_number}</Badge> : <Badge tone="slate">Unassigned</Badge>}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-500">Route</span>
                  <span className="text-sm font-bold">{d.routeName || d.route_name || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-500">Status</span>
                  <Badge tone={d.bus_number ? 'green' : 'amber'}>{d.status}</Badge>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setAssignTo(d)}>
                  {d.bus_id ? 'Change Bus' : 'Assign Bus'}
                </Button>
                <Button variant="danger" size="sm" onClick={() => handleDelete(d)}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddDriverModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={load} />
      <AssignBusModal driver={assignTo} onClose={() => setAssignTo(null)} onAssigned={load} />
    </div>
  );
}

function AlertsMonitor() {
  const [alerts, setAlerts] = useState<AlertRec[]>([]);

  useEffect(() => {
    const load = () => api.listAlerts().then(setAlerts).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const delays = alerts.filter((a) => a.type === 'Delay');
  const emergencies = alerts.filter((a) => a.type === 'Emergency');

  const loadAlerts = () => api.listAlerts().then(setAlerts).catch(() => {});

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Active Emergency Alerts</p>
          <p className="mt-2 text-4xl font-black text-rose-600">{emergencies.filter((a) => a.status === 'Active').length}</p>
          <p className="text-sm text-slate-500">Total: {emergencies.length}</p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Active Delay Alerts</p>
          <p className="mt-2 text-4xl font-black text-amber-600">{delays.filter((a) => a.status === 'Active').length}</p>
          <p className="text-sm text-slate-500">Total: {delays.length}</p>
        </Card>
      </div>

      <Card>
        <Section title="Emergency Messages">
          <AlertList alerts={emergencies} emptyText="No emergency alerts yet." />
        </Section>
      </Card>

      <Card>
        <Section title="Delay Messages">
          <AlertList alerts={delays} emptyText="No delay alerts yet." />
        </Section>
      </Card>
    </div>
  );
}

function AlertList({ alerts, emptyText }: { alerts: AlertRec[]; emptyText: string }) {
  if (alerts.length === 0) return <Empty message={emptyText} />;
  return (
    <div className="space-y-3">
      {alerts.map((a) => (
        <div key={a.id} className={`rounded-xl border p-4 ${a.type === 'Emergency' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={a.type === 'Emergency' ? 'red' : 'amber'}>{a.type}</Badge>
                <Badge tone="blue">{a.bus || '—'}</Badge>
                <span className="text-sm font-bold text-slate-700">{a.category}</span>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-800">{a.message}</p>
              <p className="mt-1 text-xs text-slate-500">From driver: {a.driver_name || '—'} • {a.date} {a.time}</p>
            </div>
            <Badge tone={a.status === 'Active' ? 'red' : 'green'}>{a.status}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function SmsLog() {
  const [log, setLog] = useState<SmsRecord[]>([]);
  const [status, setStatus] = useState<{ configured: boolean; provider: string; info: string } | null>(null);

  useEffect(() => {
    const load = () => {
      api.listSmsLog().then(setLog).catch(() => {});
    };
    api.smsStatus().then(setStatus).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <div className={`rounded-xl border p-4 ${status?.configured ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className="text-sm font-bold">
            {status?.configured ? '✓ Real SMS enabled' : '⚠ Mock SMS mode'}
          </p>
          <p className="mt-1 text-xs text-slate-700">{status?.info}</p>
          {!status?.configured && (
            <p className="mt-2 text-xs text-slate-600">
              To enable real SMS: stop the backend, set <code className="rounded bg-white px-1 font-mono">TWILIO_ACCOUNT_SID</code>,{' '}
              <code className="rounded bg-white px-1 font-mono">TWILIO_AUTH_TOKEN</code> and{' '}
              <code className="rounded bg-white px-1 font-mono">TWILIO_FROM_NUMBER</code> in <code>backend/.env</code> and restart.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <Section title={`Parent SMS Log (${log.length})`}>
          {log.length === 0 ? <Empty message="No SMS messages yet. Trigger a scan or driver alert to see SMS here." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="py-3">Time</th><th>To</th><th>Body</th><th>Provider</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {log.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100">
                      <td className="py-3 text-xs text-slate-500 whitespace-nowrap">{new Date(s.created_at).toLocaleString()}</td>
                      <td className="font-mono text-xs">{s.to}</td>
                      <td className="max-w-md text-xs">{s.body}</td>
                      <td><Badge tone={s.provider === 'twilio' ? 'green' : 'slate'}>{s.provider}</Badge></td>
                      <td>
                        <Badge tone={s.status === 'sent' ? 'green' : s.status === 'failed' ? 'red' : 'amber'}>{s.status}</Badge>
                        {s.error && <p className="mt-1 text-xs text-rose-600">{s.error}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </Card>
    </div>
  );
}

function BusRoutesModule() {
  const [busRoutes, setBusRoutes] = useState<BusRoute[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingBus, setUpdatingBus] = useState<string | null>(null);

  const load = () => {
    Promise.all([
      api.listBusRoutes(),
      api.listBuses(),
      api.listRoutes()
    ])
      .then(([routesData, busesData, masterRoutes]) => {
        setBusRoutes(routesData);
        setBuses(busesData);
        setRoutes(masterRoutes);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const handleAssignRoute = async (busNumber: string, routeId: string) => {
    setUpdatingBus(busNumber);
    try {
      if (!routeId) {
        await api.updateBusRoute(busNumber, '', '');
      } else {
        const route = routes.find(r => r.routeId === routeId);
        if (route) {
          await api.updateBusRoute(busNumber, route.routeId, route.routeName);
        }
      }
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update bus route assignment.');
    } finally {
      setUpdatingBus(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black">Bus Route Management</h2>
        <p className="text-sm text-slate-500">Dynamically generated bus routes based on assigned student boarding points, with optional master Route association.</p>
      </div>

      {/* Admin Assignment Section */}
      <Card>
        <Section title="Bus Route Assignment">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-3">Bus Number</th>
                  <th>Assigned Route</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {buses.map((bus) => {
                  const bNum = bus.busNumber || bus.bus_number;
                  const bRoute = (() => {
                    if (bus.routeId && routes.some(r => r.routeId === bus.routeId)) {
                      return bus.routeId;
                    }
                    const name = bus.routeName || bus.route_name || '';
                    if (name) {
                      let matched = routes.find(r => r.routeName.toLowerCase() === name.toLowerCase());
                      if (matched) return matched.routeId;
                      const cleanName = name.split(' ')[0].toLowerCase();
                      matched = routes.find(r => r.routeName.toLowerCase().includes(cleanName));
                      if (matched) return matched.routeId;
                    }
                    return '';
                  })();
                  return (
                    <tr key={bNum} className="border-b border-slate-100">
                      <td className="py-3 font-bold">{bNum}</td>
                      <td>
                        <select
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                          value={bRoute}
                          onChange={(e) => handleAssignRoute(bNum, e.target.value)}
                          disabled={updatingBus === bNum}
                        >
                          <option value="">-- No Route Template --</option>
                          {routes.map((r) => (
                            <option key={r.routeId} value={r.routeId}>
                              {r.routeName} ({r.routeId})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {updatingBus === bNum ? (
                          <span className="text-xs text-slate-500">Saving...</span>
                        ) : (
                          <span className="text-xs text-emerald-600 font-bold">Auto-saved</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      </Card>

      {loading && busRoutes.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        </div>
      ) : busRoutes.length === 0 ? (
        <Empty message="No bus routes generated yet. Make sure students are assigned to buses with valid boarding points." />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {busRoutes.map((br) => {
            const totalStudents = br.stops.reduce((acc, stop) => acc + stop.studentCount, 0);
            return (
              <Card key={br.busNumber}>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{br.busNumber}</h3>
                    <p className="text-xs font-bold text-slate-500 uppercase">Dynamic Route Stop Sequence</p>
                  </div>
                  <Badge tone="blue">{totalStudents} Total Students</Badge>
                </div>

                <div className="mt-4 space-y-4 relative pl-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {br.stops.map((stop) => (
                    <div key={stop.stopName} className="relative flex items-center justify-between">
                      <div className="absolute -left-[20px] flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white bg-slate-400 ring-4 ring-slate-50"></div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{stop.stopName}</p>
                        <p className="text-xs text-slate-500">Coordinates: {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}</p>
                      </div>
                      <Badge tone={stop.stopName === 'Aditya University' ? 'green' : 'slate'}>
                        {stop.stopName === 'Aditya University' ? 'Destination' : `${stop.studentCount} students`}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
