import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Student } from './src/models/Student.js';
import { BusRoute } from './src/models/BusRoute.js';
import { Bus } from './src/models/Bus.js';
import { Route } from './src/models/Route.js';
import { Trip } from './src/models/Trip.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  console.log('Connecting to:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  // 1. Bus
  const bus3 = await Bus.findOne({ busNumber: 'BUS-03' }).lean();
  console.log('BUS-03 details:', bus3);

  // 2. Students on BUS-03
  const students = await Student.find({ 'bus_details.bus_number': 'BUS-03' }).lean();
  console.log(`\nStudents on BUS-03 count: ${students.length}`);
  students.forEach(s => {
    console.log(`- ${s.name}: Boarding point: ${s.bus_details?.boarding_point}, coordinates: [${s.home_latitude}, ${s.home_longitude}]`);
  });

  // 3. BusRoute for BUS-03
  const busRoute = await BusRoute.findOne({ busNumber: 'BUS-03' }).lean();
  console.log('\nBusRoute for BUS-03:', busRoute);

  // 4. Route for Route-B / static route
  const staticRoute = await Route.findOne({ routeId: bus3?.routeId }).lean();
  console.log('\nStatic Route for BUS-03 routeId:', staticRoute);

  // 5. Trip progress for BUS-03
  const trip = await Trip.findOne({ busId: bus3?.busId, status: 'active' }).lean();
  console.log('\nActive Trip progress for BUS-03:', trip ? trip.routeProgress : 'No active trip');

  await mongoose.disconnect();
}

run().catch(console.error);
