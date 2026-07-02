import { useNavigate } from 'react-router-dom';

const MODULES = [
  {
    id: 'parent',
    title: 'Parent Module',
    desc: "Track your child's bus, boarding & drop-off notifications, attendance.",
    color: 'from-pink-500 to-rose-500',
    ring: 'shadow-pink-200',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-10 w-10">
        <circle cx="12" cy="7" r="4" />
        <path d="M5 21c0-4 3-7 7-7s7 3 7 7" />
      </svg>
    ),
  },
  {
    id: 'student',
    title: 'Student Module',
    desc: 'View assigned bus, departure & drop-off times, attendance.',
    color: 'from-blue-500 to-cyan-500',
    ring: 'shadow-blue-200',
    featured: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-10 w-10">
        <path d="M12 14 3 9l9-5 9 5-9 5Z" />
        <path d="M5 11v5c2 3 12 3 14 0v-5" />
      </svg>
    ),
  },
  {
    id: 'admin',
    title: 'Admin Module',
    desc: 'Manage students, drivers, bus assignments and view alerts.',
    color: 'from-violet-500 to-purple-500',
    ring: 'shadow-purple-200',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-10 w-10">
        <path d="M12 3 4 6v6c0 5 3.5 9 8 9s8-4 8-9V6l-8-3Z" />
      </svg>
    ),
  },
  {
    id: 'driver',
    title: 'Driver Module',
    desc: 'View boarded students, drop-offs, send delay or emergency alerts.',
    color: 'from-amber-500 to-orange-500',
    ring: 'shadow-amber-200',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-10 w-10">
        <path d="M3 17h18M5 17V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9M7 13h10M7 21v-4M17 21v-4" />
      </svg>
    ),
  },
];

const FEATURES = [
  { title: 'Safe Trips', text: 'Live notifications when student boards or drops off the bus.', color: 'bg-emerald-100 text-emerald-600', icon: '✓' },
  { title: 'Fast Updates', text: 'Real-time delay & emergency alerts directly from the driver.', color: 'bg-blue-100 text-blue-600', icon: '⚡' },
  { title: 'Mobile Ready', text: 'Works smoothly on phones, tablets and desktops.', color: 'bg-purple-100 text-purple-600', icon: '📱' },
  { title: 'Trusted Access', text: 'Role-based logins for parent, student, admin & driver.', color: 'bg-orange-100 text-orange-600', icon: '🛟' },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="h-2 bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900" />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
                <path d="M12 14 3 9l9-5 9 5-9 5Z" />
              </svg>
            </span>
            <div>
              <p className="text-xl font-black">SafeRide Tracking</p>
              <p className="text-xs font-medium text-slate-500">School Management System</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200">Help &amp; Support</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-14">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-black md:text-5xl">
            Welcome to <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">SafeRide Tracking</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600">
            Select your module below to access your personalized dashboard. Each module is designed to provide the best experience for its users.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {MODULES.map((m) => (
            <button
              key={m.id}
              onClick={() => navigate(`/login/${m.id}`)}
              className={`group flex min-h-[19rem] flex-col items-center rounded-3xl bg-white p-7 text-center shadow-lg ${m.ring} transition hover:-translate-y-1 hover:shadow-2xl`}
            >
              <span className={`flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${m.color} text-white shadow-md`}>
                {m.icon}
              </span>
              <h2 className="mt-5 text-xl font-black">{m.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{m.desc}</p>
              <span className={`mt-auto inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold ${m.featured ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md' : 'bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white'}`}>
                Login
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </span>
            </button>
          ))}
        </div>

        <section className="mt-16 rounded-3xl bg-white p-10 shadow-lg">
          <h2 className="text-center text-2xl font-black">Why Choose SafeRide Tracking?</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="text-center">
                <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${f.color} text-xl font-bold`}>
                  {f.icon}
                </span>
                <h3 className="mt-4 text-base font-black">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
