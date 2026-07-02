// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, type ScanLog, type TrackingSnapshot } from '../lib/api';
import DashboardLayout from '../components/DashboardLayout';
import { Card, Section, Badge, Empty } from '../components/ui';
import { cn } from '../utils/cn';
import TrackBus from '../components/tracking/TrackBus';
import ETAWidget from '../components/tracking/ETAWidget';
import { QRCodeSVG } from 'qrcode.react';

const NAV = [
  { id: 'overview', label: 'Overview', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> },
  { id: 'tracking', label: 'Track Bus', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M3 12h18M12 3l9 9-9 9" /></svg> },
  { id: 'history', label: 'Monthly History', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg> },
  { id: 'profile', label: 'My Profile', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><circle cx="12" cy="7" r="4" /><path d="M5 21c0-4 3-7 7-7s7 3 7 7" /></svg> },
];

export default function StudentDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [scans, setScans] = useState<ScanLog[]>([]);
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);

  useEffect(() => {
    if (!user?.student) return;
    const load = () => {
      api.listScans({ student_id: user.student._id }).then(setScans).catch(() => {});
      if (user.student.bus_details.bus_id) {
        api.getTrackingSnapshot(user.student.bus_details.bus_id).then(setSnapshot).catch(() => {});
      }
    };
    load();
    const t = setInterval(load, 7000);
    return () => clearInterval(t);
  }, [user]);

  if (!user || user.role !== 'student') return <Navigate to="/" replace />;
  const student = user.student!;

  return (
    <DashboardLayout title={`Hi, ${student.name.split(' ')[0]}!`} subtitle="Student Dashboard" nav={NAV} active={tab} onChangeTab={setTab}>
      {tab === 'overview' && <Overview student={student} scans={scans} snapshot={snapshot} />}
      {tab === 'tracking' && <TrackBus busId={student.bus_details.bus_id} busNumber={student.bus_details.bus_number} />}
      {tab === 'history' && <MonthlyHistory studentId={student._id} />}
      {tab === 'profile' && <Profile student={student} />}
    </DashboardLayout>
  );
}

function Overview({ student, scans, snapshot }) {
  const today = new Date().toISOString().split('T')[0];
  const todayScans = scans.filter((s) => s.date === today);
  const boardScan = todayScans.find((s) => s.action === 'board');
  const dropScan = todayScans.find((s) => s.action === 'dropoff');
  const presentToday = !!boardScan && !!dropScan;

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
          <p className="mt-2 text-3xl font-black text-emerald-600">{boardScan?.time || '—'}</p>
          <p className="text-sm text-slate-500">{boardScan ? 'Boarded from ' + student.bus_details.boarding_point : 'Not yet boarded'}</p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Today Drop-off</p>
          <p className="mt-2 text-3xl font-black text-violet-600">{dropScan?.time || '—'}</p>
          <p className="text-sm text-slate-500">{dropScan ? 'Marked as Present' : 'Pending'}</p>
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
        <Section title="Today's Trip Status">
          <div className="grid gap-3 md:grid-cols-4">
            <StatusTile label="Boarded" time={boardScan?.time} ok={!!boardScan} />
            <StatusTile label="Trip Status" time={snapshot?.status || 'inactive'} ok={snapshot?.status === 'active'} />
            <StatusTile label="Next Village" time={snapshot?.nextVillage?.villageName || '—'} ok={!!snapshot?.nextVillage} />
            <StatusTile label="Drop-off / Present" time={dropScan?.time} ok={presentToday} />
          </div>
        </Section>
      </Card>

      <Card>
        <Section title="My QR Code">
          <div className="flex flex-col items-center gap-4 md:flex-row md:items-start">
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
              <QRCodeSVG value={student.qr_student_id} size={180} level="M" />
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-sm text-slate-500">Scan this code at the authorized bus scanner.</p>
              <p className="font-bold">QR ID: <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm">{student.qr_student_id}</span></p>
              <p className="text-sm text-slate-600">When you scan to <b>board</b>, your parent gets an instant SMS notification. When you scan to <b>drop-off</b>, you're marked <b>present</b> and your parent gets a drop-off SMS.</p>
            </div>
          </div>
        </Section>
      </Card>
    </div>
  );
}

function StatusTile({ label, time, ok }) {
  return <div className={cn('rounded-2xl border p-4', ok ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50')}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={cn('mt-1 text-2xl font-black', ok ? 'text-emerald-700' : 'text-slate-400')}>{time || '—'}</p></div>;
}

function MonthlyHistory({ studentId }) {
  const [scans, setScans] = useState([]);
  const now = useMemo(() => new Date(), []);
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const monthName = now.toLocaleString('default', { month: 'long' });
  const daysInMonth = new Date(year, month, 0).getDate();

  useEffect(() => {
    api.listScans({ student_id: studentId, month, year }).then(setScans).catch(() => {});
  }, [studentId, month, year]);

  const byDate = useMemo(() => {
    const map = {};
    scans.forEach((s) => {
      map[s.date] = map[s.date] || {};
      if (s.action === 'board') map[s.date].board = s;
      if (s.action === 'dropoff') map[s.date].dropoff = s;
    });
    return map;
  }, [scans]);

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
        <Section title={`Attendance — ${monthName} ${year}`} action={<div className="flex gap-2"><Badge tone="green">{present} Present</Badge><Badge tone="red">{absent} Absent</Badge></div>}>
          <div className="grid grid-cols-7 gap-2 text-center text-xs">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="text-slate-500 font-bold">{d}</div>)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = i + 1;
              const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const day = byDate[date];
              const ok = day?.board && day?.dropoff;
              const partial = day?.board || day?.dropoff;
              const isToday = d === now.getDate();
              return <div key={d} className={cn('aspect-square rounded-xl flex items-center justify-center font-bold', isToday && 'ring-2 ring-blue-500', ok ? 'bg-emerald-100 text-emerald-700' : partial ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400')} title={date}>{d}</div>;
            })}
          </div>
        </Section>
      </Card>

      <Card>
        <Section title="Boarding & Drop-off Log">
          {scans.length === 0 ? <Empty message="No scans yet this month." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-3">Date</th><th>Board Time</th><th>Drop-off Time</th><th>Bus</th><th>Status</th></tr></thead>
                <tbody>
                  {Object.entries(byDate).sort(([a], [b]) => b.localeCompare(a)).map(([date, d]) => (
                    <tr key={date} className="border-b border-slate-100">
                      <td className="py-3 font-bold">{date}</td>
                      <td>{d.board?.time || '—'}</td>
                      <td>{d.dropoff?.time || '—'}</td>
                      <td>{(d.board || d.dropoff)?.bus_number || '—'}</td>
                      <td>{d.board && d.dropoff ? <Badge tone="green">Present</Badge> : d.board ? <Badge tone="amber">In Transit</Badge> : <Badge tone="red">Incomplete</Badge>}</td>
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

function Profile({ student }) {
  return (
    <Card>
      <Section title="Profile Details">
        <div className="grid gap-4 md:grid-cols-2">
          <Detail label="Name" value={student.name} />
          <Detail label="Roll No" value={student.register_no} />
          <Detail label="Year / Section" value={`${student.year} - ${student.section}`} />
          <Detail label="Department" value={student.department} />
          <Detail label="Date of Birth" value={student.date_of_birth} />
          <Detail label="Gender" value={student.gender} />
          <Detail label="Bus" value={`${student.bus_details.bus_number} (${student.bus_details.routeName || student.bus_details.route_name})`} />
          <Detail label="Boarding Point" value={student.bus_details.boarding_point} />
          <Detail label="Address" value={`${student.address.door_no}, ${student.address.street}, ${student.address.city}, ${student.address.state} - ${student.address.pincode}`} />
        </div>
      </Section>
    </Card>
  );
}

function Detail({ label, value }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-900">{value || '—'}</p></div>;
}
