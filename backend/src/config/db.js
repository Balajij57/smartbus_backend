import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';
  if (isConnected) return mongoose.connection;

  mongoose.set('strictQuery', true);
  await mongoose.connect(mongoUri, {
    autoIndex: true,
    serverSelectionTimeoutMS: 10000,
  });

  isConnected = true;
  console.log(`🗄️  MongoDB connected: ${mongoose.connection.name}`);
  return mongoose.connection;
}

export { mongoose };
