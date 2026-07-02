// In-browser mock backend. Persists to localStorage.
// Activated automatically when the real backend at /api isn't reachable.

import { v4 as uuidv4 } from './uuid';
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AlertRec, Bus, Driver, Notif, ScanLog, Student, User, Role } from './api';

const STORAGE_KEY = 'smartbus-db-v1';

export type SmsRecord = {
  id: string;
  to: string;
  body: string;
  provider: 'twilio' | 'mock';
  status: 'sent' | 'logged-only' | 'failed';
  error?: string | null;
  created_at: string;
};

type DB = {
  students: Student[];
  drivers: Driver[];
  buses: Bus[];
  admins: { username: string; password: string; name: string }[];
  alerts: AlertRec[];
  scanLogs: ScanLog[];
  notifications: Notif[];
  smsLog: SmsRecord[];
};

function nowTime() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function todayDate() {
  return new Date().toISOString().split('T')[0];
}

function seed(): DB {
  const today = new Date().toISOString();
  return {
    students: [
      {
        _id: 'STU001',
        register_no: '22B91A0501',
        name: 'Veera Kumar',
        gender: 'Male',
        year: '3rd Year',
        department: 'CSE',
        section: 'A',
        date_of_birth: '2004-07-15',
        address: { door_no: '12-45', street: 'Main Road', city: 'Tirupati', state: 'Andhra Pradesh', pincode: '517501' },
        bus_details: { bus_id: 'BUS001', bus_number: 'BUS-12', route_name: 'Route-A', boarding_point: 'Pakala' },
        parent_id: 'PAR001',
        driver_id: 'DRV001',
        qr_student_id: 'STU001',
        profile_photo: '',
        password: 'veera123',
        parent_password: 'parent123',
        parent_phone: '9876543210',
        parent_email: 'parent.veera@email.com',
        status: 'active',
        created_at: today,
      },
      {
        _id: 'STU002',
        register_no: '22B91A0502',
        name: 'Arjun Sharma',
        gender: 'Male',
        year: '3rd Year',
        department: 'CSE',
        section: 'A',
        date_of_birth: '2004-05-22',
        address: { door_no: '8-12', street: 'MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
        bus_details: { bus_id: 'BUS001', bus_number: 'BUS-12', route_name: 'Route-A', boarding_point: 'MG Road' },
        parent_id: 'PAR002',
        driver_id: 'DRV001',
        qr_student_id: 'STU002',
        profile_photo: '',
        password: 'arjun123',
        parent_password: 'parent123',
        parent_phone: '9876543211',
        parent_email: 'parent.arjun@email.com',
        status: 'active',
        created_at: today,
      },
    ],
    drivers: [
      {
        _id: 'DRV001',
        driver_id: 'DRV001',
        name: 'Rajan Kumar',
        phone: '9876543200',
        license: 'KA-2026-5521',
        bus_id: 'BUS001',
        bus_number: 'BUS-12',
        route_name: 'Morning Route A',
        password: 'rajan123',
        status: 'On route',
        created_at: today,
      },
      {
        _id: 'DRV002',
        driver_id: 'DRV002',
        name: 'Amit Rao',
        phone: '9876543201',
        license: 'KA-2026-4487',
        bus_id: '',
        bus_number: '',
        route_name: '',
        password: 'amit123',
        status: 'Available',
        created_at: today,
      },
    ],
    buses: [
      { bus_id: 'BUS001', bus_number: 'BUS-12', route_name: 'Route-A', capacity: 36 },
      { bus_id: 'BUS002', bus_number: 'BUS-07', route_name: 'Route-B', capacity: 40 },
      { bus_id: 'BUS003', bus_number: 'BUS-03', route_name: 'North Zone', capacity: 35 },
      { bus_id: 'BUS004', bus_number: 'BUS-09', route_name: 'South Zone', capacity: 38 },
    ],
    admins: [{ username: 'admin', password: 'admin123', name: 'Super Admin' }],
    alerts: [],
    scanLogs: [],
    notifications: [],
    smsLog: [],
  };
}

function loadDB(): DB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Backwards-compat: add smsLog field if missing
      if (!parsed.smsLog) parsed.smsLog = [];
      return parsed;
    }
  } catch {}
  const fresh = seed();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

function saveDB(db: DB) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function resetMockDB() {
  localStorage.removeItem(STORAGE_KEY);
}

function normalisePhone(phone?: string): string | null {
  if (!phone) return null;
  const cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.length === 10) return `+91${cleaned}`;
  if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`;
  return `+${cleaned}`;
}

function recordMockSms(db: DB, phone: string | null | undefined, body: string): SmsRecord {
  const sms: SmsRecord = {
    id: `SMS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    to: normalisePhone(phone || undefined) || '(missing)',
    body,
    provider: 'mock',
    status: phone ? 'logged-only' : 'failed',
    error: phone ? null : 'No phone number',
    created_at: new Date().toISOString(),
  };
  db.smsLog.unshift(sms);
  if (db.smsLog.length > 200) db.smsLog.length = 200;
  // eslint-disable-next-line no-console
  console.info(`[SmartBUS][SMS-MOCK] To ${sms.to}: ${body}`);
  return sms;
}

export const mock = {
  async login(role: Role, username: string, password: string): Promise<{ token: string; user: User }> {
    const db = loadDB();
    const u = username.trim();

    if (role === 'admin') {
      const a = db.admins.find((x) => x.username === u && x.password === password);
      if (!a) throw new Error('Invalid username or password');
      return { token: `tok-${uuidv4()}`, user: { id: 'admin', name: a.name, role: 'admin', username: u } };
    }
    if (role === 'student') {
      const s = db.students.find((x) => x.register_no === u && x.password === password);
      if (!s) throw new Error('Invalid username or password');
      return { token: `tok-${uuidv4()}`, user: { id: s._id, name: s.name, role: 'student', username: s.register_no, student: s } };
    }
    if (role === 'parent') {
      const s = db.students.find((x) => x.register_no === u && x.parent_password === password);
      if (!s) throw new Error('Invalid username or password');
      return { token: `tok-${uuidv4()}`, user: { id: s.parent_id, name: `Parent of ${s.name}`, role: 'parent', username: s.register_no, student: s } };
    }
    if (role === 'driver') {
      const d = db.drivers.find((x) => (x.driver_id === u || x.phone === u) && x.password === password);
      if (!d) throw new Error('Invalid username or password');
      return { token: `tok-${uuidv4()}`, user: { id: d._id, name: d.name, role: 'driver', username: d.driver_id, driver: d } };
    }
    throw new Error('Invalid role');
  },

  async changePassword(role: Role, username: string, currentPassword: string, newPassword: string): Promise<{ ok: true }> {
    const db = loadDB();
    await this.login(role, username, currentPassword); // will throw if wrong

    if (role === 'admin') {
      const a = db.admins.find((x) => x.username === username);
      if (a) a.password = newPassword;
    } else if (role === 'student') {
      const s = db.students.find((x) => x.register_no === username);
      if (s) s.password = newPassword;
    } else if (role === 'parent') {
      const s = db.students.find((x) => x.register_no === username);
      if (s) s.parent_password = newPassword;
    } else if (role === 'driver') {
      const d = db.drivers.find((x) => x.driver_id === username || x.phone === username);
      if (d) d.password = newPassword;
    }
    saveDB(db);
    return { ok: true };
  },

  async listStudents(): Promise<Student[]> {
    return loadDB().students;
  },

  async getStudent(id: string): Promise<Student> {
    const s = loadDB().students.find((x) => x._id === id);
    if (!s) throw new Error('Student not found');
    return s;
  },

  async createStudent(body: Partial<Student>): Promise<Student> {
    const db = loadDB();
    if (!body.register_no || !body.name) throw new Error('register_no and name required');
    if (db.students.find((x) => x.register_no === body.register_no)) {
      throw new Error('Student with this register number already exists');
    }
    const newStudent: Student = {
      _id: body._id || `STU${String(db.students.length + 1).padStart(3, '0')}`,
      register_no: body.register_no!,
      name: body.name!,
      gender: body.gender || 'Male',
      year: body.year || '',
      department: body.department || '',
      section: body.section || '',
      date_of_birth: body.date_of_birth || '',
      address: body.address || { door_no: '', street: '', city: '', state: '', pincode: '' },
      bus_details: body.bus_details || { bus_id: '', bus_number: '', route_name: '', boarding_point: '' },
      parent_id: body.parent_id || `PAR${String(db.students.length + 1).padStart(3, '0')}`,
      driver_id: body.driver_id || '',
      qr_student_id: body.register_no!,
      profile_photo: body.profile_photo || '',
      password: body.password || 'student123',
      parent_password: body.parent_password || 'parent123',
      parent_phone: body.parent_phone || '',
      parent_email: body.parent_email || '',
      boardingPoint: body.boardingPoint || body.bus_details?.boarding_point || '',
      landmark: body.landmark || '',
      latitude: Number(body.latitude) || Number(body.home_latitude) || 0,
      longitude: Number(body.longitude) || Number(body.home_longitude) || 0,
      allowedRadiusMeters: Number(body.allowedRadiusMeters) || 200,
      status: 'active',
      created_at: new Date().toISOString(),
    };
    db.students.unshift(newStudent);
    saveDB(db);
    return newStudent;
  },

  async deleteStudent(id: string): Promise<{ ok: true }> {
    const db = loadDB();
    db.students = db.students.filter((x) => x._id !== id);
    saveDB(db);
    return { ok: true };
  },

  async updateStudent(id: string, body: Partial<Student>): Promise<Student> {
    const db = loadDB();
    const idx = db.students.findIndex((x) => x._id === id);
    if (idx === -1) throw new Error('Student not found');
    db.students[idx] = { ...db.students[idx], ...body };
    saveDB(db);
    return db.students[idx];
  },

  async listDrivers(): Promise<Driver[]> {
    return loadDB().drivers;
  },

  async createDriver(body: Partial<Driver>): Promise<Driver> {
    const db = loadDB();
    if (!body.name || !body.phone) throw new Error('name and phone required');
    const driver_id = body.driver_id || `DRV${String(db.drivers.length + 1).padStart(3, '0')}`;
    if (db.drivers.find((x) => x.driver_id === driver_id)) throw new Error('Driver ID already exists');
    const newDriver: Driver = {
      _id: driver_id,
      driver_id,
      name: body.name!,
      phone: body.phone!,
      license: body.license || '',
      bus_id: '',
      bus_number: '',
      route_name: '',
      password: body.password || 'driver123',
      status: 'Available',
      created_at: new Date().toISOString(),
    };
    db.drivers.unshift(newDriver);
    saveDB(db);
    return newDriver;
  },

  async deleteDriver(id: string): Promise<{ ok: true }> {
    const db = loadDB();
    db.drivers = db.drivers.filter((x) => x._id !== id);
    saveDB(db);
    return { ok: true };
  },

  async assignBus(driverId: string, bus_id: string): Promise<Driver> {
    const db = loadDB();
    const driver = db.drivers.find((x) => x._id === driverId);
    if (!driver) throw new Error('Driver not found');
    const bus = db.buses.find((b) => b.bus_id === bus_id);
    if (!bus) throw new Error('Bus not found');
    const conflict = db.drivers.find((x) => x.bus_id === bus_id && x._id !== driver._id);
    if (conflict) throw new Error(`Bus ${bus.bus_number} is already assigned to ${conflict.name}`);
    driver.bus_id = bus.bus_id;
    driver.bus_number = bus.bus_number;
    driver.route_name = bus.route_name;
    driver.status = 'On route';
    saveDB(db);
    return driver;
  },

  async listBuses(): Promise<Bus[]> {
    return loadDB().buses;
  },

  async createBus(body: any): Promise<Bus> {
    const db = loadDB();
    if (!body.busNumber) throw new Error('Bus Number is required');
    const newBus: any = {
      bus_id: `BUS-${uuidv4().substring(0, 8)}`,
      bus_number: body.busNumber,
      busNumber: body.busNumber,
      busName: body.busName || '',
      vehicleNumber: body.vehicleNumber || '',
      capacity: Number(body.capacity) || 40,
      status: body.status || 'inactive',
      route_name: body.routeName || '',
      routeName: body.routeName || '',
    };
    db.buses.unshift(newBus);
    saveDB(db);
    return newBus;
  },

  async updateBus(id: string, body: any): Promise<Bus> {
    const db = loadDB();
    const idx = db.buses.findIndex((x) => x.bus_id === id);
    if (idx === -1) throw new Error('Bus not found');
    db.buses[idx] = {
      ...db.buses[idx],
      ...body,
      bus_number: body.busNumber || db.buses[idx].bus_number || db.buses[idx].busNumber,
      busNumber: body.busNumber || db.buses[idx].busNumber || db.buses[idx].bus_number,
      route_name: body.routeName || body.busName || db.buses[idx].route_name,
      bus_id: id
    };
    saveDB(db);
    return db.buses[idx];
  },

  async deleteBus(id: string): Promise<{ ok: true }> {
    const db = loadDB();
    db.buses = db.buses.filter((x) => x.bus_id !== id);
    saveDB(db);
    return { ok: true };
  },

  async listAlerts(): Promise<AlertRec[]> {
    return loadDB().alerts;
  },

  async createAlert(body: Partial<AlertRec>): Promise<AlertRec> {
    const db = loadDB();
    const newAlert: AlertRec = {
      id: `ALT-${Date.now()}`,
      time: nowTime(),
      date: todayDate(),
      bus: body.bus || '',
      driver_id: body.driver_id || '',
      driver_name: body.driver_name || '',
      type: (body.type as 'Delay' | 'Emergency') || 'Delay',
      category: body.category || '',
      message: body.message || '',
      status: 'Active',
      created_at: new Date().toISOString(),
    };
    db.alerts.unshift(newAlert);

    const studentsOnBus = db.students.filter((s) => s.bus_details?.bus_number === body.bus);
    const smsBody = `SafeRide ${newAlert.type.toUpperCase()} on bus ${newAlert.bus}: ${newAlert.category}. ${newAlert.message} (${newAlert.time})`;
    studentsOnBus.forEach((s) => {
      db.notifications.push({
        id: `N-${uuidv4()}`,
        to: 'parent',
        parent_id: s.parent_id,
        student_id: s._id,
        title: `${newAlert.type}: ${newAlert.category}`,
        message: newAlert.message,
        time: nowTime(),
        date: todayDate(),
        created_at: new Date().toISOString(),
        read: false,
      });
      recordMockSms(db, s.parent_phone, smsBody);
    });
    db.notifications.push({
      id: `N-${uuidv4()}`,
      to: 'admin',
      title: `${newAlert.type} from ${newAlert.driver_name || 'Driver'} (Bus ${newAlert.bus})`,
      message: newAlert.message,
      time: nowTime(),
      date: todayDate(),
      created_at: new Date().toISOString(),
      read: false,
    });
    saveDB(db);
    return newAlert;
  },

  async scan(qr_student_id: string, action: 'board' | 'dropoff', bus_number?: string): Promise<{ ok: true; log: ScanLog; sms: SmsRecord | null }> {
    const db = loadDB();
    const student = db.students.find((s) => s.qr_student_id === qr_student_id || s._id === qr_student_id);
    if (!student) throw new Error('Student not found');

    const log: ScanLog = {
      id: `SCAN-${Date.now()}`,
      student_id: student._id,
      student_name: student.name,
      register_no: student.register_no,
      action,
      bus_number: bus_number || student.bus_details?.bus_number || '',
      time: nowTime(),
      date: todayDate(),
      created_at: new Date().toISOString(),
    };
    db.scanLogs.unshift(log);

    const title = action === 'board' ? `${student.name} boarded the bus` : `${student.name} dropped off the bus`;
    const message = `${title} at ${log.time} (Bus ${log.bus_number})`;
    db.notifications.push({
      id: `N-${uuidv4()}`,
      to: 'parent',
      parent_id: student.parent_id,
      student_id: student._id,
      title,
      message,
      time: log.time,
      date: log.date,
      created_at: new Date().toISOString(),
      read: false,
    });

    // SMS to parent
    const smsBody = action === 'board'
      ? `SafeRide: Dear Parent, your child ${student.name} has BOARDED bus ${log.bus_number} at ${log.time} on ${log.date}.`
      : `SafeRide: Dear Parent, your child ${student.name} has DROPPED OFF bus ${log.bus_number} at ${log.time} on ${log.date}. Marked PRESENT.`;
    const sms = recordMockSms(db, student.parent_phone, smsBody);

    saveDB(db);
    return { ok: true, log, sms };
  },

  async listSmsLog(): Promise<SmsRecord[]> {
    return loadDB().smsLog;
  },

  async smsStatus(): Promise<{ configured: boolean; provider: string; info: string }> {
    return {
      configured: false,
      provider: 'mock',
      info: 'Browser demo mode — SMS messages are recorded to a local log so you can verify the content. To send real SMS, run the backend and configure Twilio in backend/.env.',
    };
  },

  async listScans(params?: { student_id?: string; date?: string; month?: number; year?: number }): Promise<ScanLog[]> {
    const db = loadDB();
    let logs = db.scanLogs;
    if (params?.student_id) logs = logs.filter((l) => l.student_id === params.student_id);
    if (params?.date) logs = logs.filter((l) => l.date === params.date);
    if (params?.month && params?.year) {
      const ym = `${params.year}-${String(params.month).padStart(2, '0')}`;
      logs = logs.filter((l) => l.date.startsWith(ym));
    }
    return logs;
  },

  async listNotifications(params?: { parent_id?: string; to?: 'parent' | 'admin' }): Promise<Notif[]> {
    const db = loadDB();
    let list = db.notifications;
    if (params?.to) list = list.filter((n) => n.to === params.to);
    if (params?.parent_id) list = list.filter((n) => n.parent_id === params.parent_id);
    return list.slice().reverse().slice(0, 100);
  },

  async overview() {
    const db = loadDB();
    const since = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const recentAlerts = db.alerts.filter((a) => new Date(a.created_at).getTime() >= since);
    return {
      totalStudents: db.students.length,
      totalBuses: db.buses.length,
      activeBuses: db.drivers.filter((d) => d.bus_number).length,
      alertsLast2Days: recentAlerts.length,
      recentAlerts,
    };
  },
};
