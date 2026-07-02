// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, type Driver, type Notif, type ScanLog, type TrackingSnapshot } from '../lib/api';
import DashboardLayout from '../components/DashboardLayout';
import { Card, Section, Badge, Empty } from '../components/ui';
import { cn } from '../utils/cn';
import TrackBus from '../components/tracking/TrackBus';
import ETAWidget from '../components/tracking/ETAWidget';

const NAV = [
  { id: 'overview', label: 'Overview', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> },
  { id: 'tracking', label: 'Live Bus Tracking', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M3 12h18M12 3l9 9-9 9" /></svg> },
  { id: 'student', label: 'Student Details', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><circle cx="12" cy="7" r="4" /><path d="M5 21c0-4 3-7 7-7s7 3 7 7" /></svg> },
  { id: 'driver', label: 'Driver Details', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M3 17h18M5 17V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9" /></svg> },
  { id: 'notifications', label: 'Notifications', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg> },
];

export default function ParentDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [scans, setScans] = useState<ScanLog[]>([]);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);

  useEffect(() => {
    if (!user?.student) return;
    const load = () => {
      api.listScans({ student_id: user!.student!._id }).then(setScans).catch(() => {});
      api.listNotifications({ parent_id: user!.student!.parent_id }).then(setNotifications).catch(() => {});
      api.listDrivers().then(setDrivers).catch(() => {});
      if (user!.student!.bus_details.bus_id) {
        api.getTrackingSnapshot(user!.student!.bus_details.bus_id).then(setSnapshot).catch(() => {});
      }
    };
    load();
    const t = setInterval(load, 7000);
    return () => clearInterval(t);
  }, [user]);

  if (!user || user.role !== 'parent') return <Navigate to="/" replace />;
  const student = user.student!;
  const driver = drivers.find((d) => d.driver_id === student.driver_id) || drivers.find((d) => d.bus_number === student.bus_details.bus_number);

  return (
    <DashboardLayout title={`Tracking ${student.name}`} subtitle="Parent Dashboard" nav={NAV} active={tab} onChangeTab={setTab}>
      {tab === 'overview' && <Overview student={student} scans={scans} notifications={notifications} snapshot={snapshot} />}
      {tab === 'tracking' && <TrackBus busId={student.bus_details.bus_id} busNumber={student.bus_details.bus_number} />}
      {tab === 'student' && <StudentDetails student={student} scans={scans} snapshot={snapshot} />}
      {tab === 'driver' && <DriverDetails driver={driver} bus={student.bus_details} />}
      {tab === 'notifications' && <Notifications notifications={notifications} />}
    </DashboardLayout>
  );
}

function Overview({ student, scans, notifications, snapshot }: { student: NonNullable<ReturnType<typeof useAuth>['user']>['student']; scans: ScanLog[]; notifications: Notif[]; snapshot: TrackingSnapshot | null }) {
  const today = new Date().toISOString().split('T')[0];
  const todayScans = scans.filter((s) => s.date === today);
  const board = todayScans.find((s) => s.action === 'board');
  const drop = todayScans.find((s) => s.action === 'dropoff');

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Assigned Bus</p>
          <p className="mt-2 text-3xl font-black text-blue-600">{student.bus_details.bus_number || '—'}</p>
          <p className="text-sm text-slate-500">{student.bus_details.routeName || student.bus_details.route_name}</p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Today Departure</p>
          <p className="mt-2 text-3xl font-black text-emerald-600">{board?.time || '—'}</p>
          <p className="text-sm text-slate-500">{board ? 'Boarded ' + board.bus_number : 'Not yet boarded'}</p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Today Drop-off</p>
          <p className="mt-2 text-3xl font-black text-violet-600">{drop?.time || '—'}</p>
          <p className="text-sm text-slate-500">{drop ? 'Marked Present' : 'Pending'}</p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Estimated Arrival</p>
          <p className="mt-2 text-3xl font-black text-cyan-600">{snapshot?.eta?.etaToCollegeMinutes != null ? `${Math.round(snapshot.eta.etaToCollegeMinutes)} min` : '—'}</p>
          <p className="text-sm text-slate-500">{snapshot?.nextVillage?.villageName ? `Next: ${snapshot.nextVillage.villageName}` : 'Waiting for trip'}</p>
        </Card>
      </div>

      <ETAWidget
        distanceRemainingKm={snapshot?.eta?.distanceRemainingKm ?? snapshot?.remainingDistanceKm}
        etaToNextVillageMinutes={snapshot?.eta?.etaToNextVillageMinutes}
        etaToCollegeMinutes={snapshot?.eta?.etaToCollegeMinutes}
        nextVillageName={snapshot?.nextVillage?.villageName || null}
        direction={snapshot?.direction}
      />

      <Card>
        <Section title="Today's Trip Updates">
          <div className="space-y-3">
            <TripRow ok={!!board} title={board ? `${student.name} boarded the bus at ${board.time}` : `${student.name} has not boarded yet`} tone="emerald" />
            <TripRow ok={snapshot?.status === 'active'} title={snapshot?.status === 'active' ? `Bus is moving • Speed ${Math.round(snapshot?.speedKmph || 0)} km/h` : 'Bus is not active'} tone="cyan" />
            <TripRow ok={!!drop} title={drop ? `${student.name} dropped off at ${drop.time} (Marked Present)` : 'Drop-off pending'} tone="violet" />
          </div>
        </Section>
      </Card>

      <Card>
        <Section title="Recent Notifications">
          {notifications.length === 0 ? <Empty message="No notifications yet." /> : (
            <div className="space-y-3">
              {notifications.slice(0, 5).map((n) => (
                <NotifRow key={n.id} n={n} />
              ))}
            </div>
          )}
        </Section>
      </Card>
    </div>
  );
}

function TripRow({ title, tone, ok }: { title: string; tone: 'emerald' | 'cyan' | 'violet'; ok: boolean }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
  };
  return <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium', ok ? tones[tone] : 'bg-slate-50 text-slate-400 border-slate-200')}><span className={cn('flex h-8 w-8 items-center justify-center rounded-full', ok ? 'bg-white' : 'bg-slate-200')}>{ok ? '✓' : '○'}</span>{title}</div>;
}

function StudentDetails({ student, scans, snapshot }: { student: NonNullable<ReturnType<typeof useAuth>['user']>['student']; scans: ScanLog[]; snapshot: TrackingSnapshot | null }) {
  const now = useMemo(() => new Date(), []);
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthName = now.toLocaleString('default', { month: 'long' });

  const byDate = useMemo(() => {
    const map: Record<string, { board?: ScanLog; dropoff?: ScanLog }> = {};
    scans.filter((s) => s.date.startsWith(`${year}-${String(month).padStart(2, '0')}`)).forEach((s) => {
      map[s.date] = map[s.date] || {};
      if (s.action === 'board') map[s.date].board = s;
      if (s.action === 'dropoff') map[s.date].dropoff = s;
    });
    return map;
  }, [scans, month, year]);

  let present = 0, absent = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const day = byDate[date];
    if (day?.board && day?.dropoff) present++;
    else absent++;
  }

  return (
    <div className="space-y-6">
      <Card>
        <Section title="Student Information">
          <div className="grid gap-4 md:grid-cols-2">
            <Detail label="Name" value={student.name} />
            <Detail label="Roll No" value={student.register_no} />
            <Detail label="Year / Section" value={`${student.year} - ${student.section}`} />
            <Detail label="Department" value={student.department} />
            <Detail label="Boarding Point" value={student.bus_details.boarding_point} />
            <Detail label="Bus Number" value={student.bus_details.bus_number} />
            <Detail label="Distance Remaining" value={snapshot?.eta?.distanceRemainingKm != null ? `${snapshot.eta.distanceRemainingKm.toFixed(2)} km` : '—'} />
            <Detail label="Next Village" value={snapshot?.nextVillage?.villageName || '—'} />
          </div>
        </Section>
      </Card>

      <Card>
        <Section title={`Boarding History — ${monthName} ${year}`} action={<div className="flex gap-2"><Badge tone="green">{present} Present</Badge><Badge tone="red">{absent} Absent</Badge></div>}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-3">Date</th><th>Departure</th><th>Drop-off</th><th>Bus</th><th>Status</th></tr></thead>
              <tbody>
                {Array.from({ length: daysInMonth }, (_, i) => daysInMonth - i).map((d) => {
                  const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const day = byDate[date];
                  if (!day && new Date(date) > now) return null;
                  return (
                    <tr key={date} className="border-b border-slate-100">
                      <td className="py-3 font-bold">{date}</td>
                      <td>{day?.board?.time || '—'}</td>
                      <td>{day?.dropoff?.time || '—'}</td>
                      <td>{day?.board?.bus_number || day?.dropoff?.bus_number || '—'}</td>
                      <td>{day?.board && day?.dropoff ? <Badge tone="green">Present</Badge> : day?.board ? <Badge tone="amber">In Transit</Badge> : <Badge tone="red">Absent</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      </Card>
    </div>
  );
}

function DriverDetails({ driver, bus }: { driver?: Driver; bus: { bus_id: string; bus_number: string; route_name: string; routeName?: string; boarding_point: string } }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <Section title="Driver Details">
          {!driver ? <Empty message="Driver not assigned yet." /> : <div><div className="flex items-center gap-5"><div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-violet-600 text-2xl font-black text-white">{driver.name[0]}</div><div><h3 className="text-2xl font-black">{driver.name}</h3><p className="text-slate-500">Driver ID: {driver.driver_id}</p><p className="mt-1 text-emerald-600 font-bold">● {driver.status}</p></div></div><div className="mt-6 space-y-2 text-slate-700"><p><b>Phone:</b> +91 {driver.phone}</p><p><b>License:</b> {driver.license || '—'}</p></div></div>}
        </Section>
      </Card>
      <Card>
        <Section title="Bus Details" action={<Badge tone="green">Active</Badge>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail label="Bus Number" value={bus.bus_number} />
            <Detail label="Route" value={bus.routeName || bus.route_name} />
            <Detail label="Boarding Point" value={bus.boarding_point} />
            <Detail label="Bus ID" value={bus.bus_id} />
          </div>
        </Section>
      </Card>
    </div>
  );
}

function Notifications({ notifications }: { notifications: Notif[] }) {
  return <Card><Section title="All Notifications">{notifications.length === 0 ? <Empty message="No notifications yet." /> : <div className="space-y-3">{notifications.map((n) => <NotifRow key={n.id} n={n} />)}</div>}</Section></Card>;
}

function NotifRow({ n }: { n: Notif }) {
  const isEmergency = n.title.toLowerCase().includes('emergency');
  const isBoard = n.title.toLowerCase().includes('boarded');
  const isDrop = n.title.toLowerCase().includes('dropped');
  const tone = isEmergency ? 'red' : isBoard ? 'green' : isDrop ? 'violet' : 'blue';
  return <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start gap-3"><Badge tone={tone as 'red'}>{isEmergency ? 'Emergency' : isBoard ? 'Boarded' : isDrop ? 'Drop-off' : 'Info'}</Badge><div><p className="font-bold">{n.title}</p><p className="text-sm text-slate-600">{n.message}</p></div></div><span className="shrink-0 text-xs text-slate-500">{n.date} {n.time}</span></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-900">{value || '—'}</p></div>;
}
