import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { syncAccountIndexes } from '../models/account.model';
import { migrateUsersToAccounts } from '../models/migrate';
import { syncUserIndexes } from '../models/user.model';

let memoryServer: MongoMemoryServer | null = null;

export async function connectDB(): Promise<void> {
  const useMemory = process.env.ENABLE_MEMORY_DB === 'true';
  let uri = process.env.MONGO_URI || 'mongodb://localhost:27017/gameServer';

  if (useMemory) {
    console.log('[db] 使用内存 MongoDB（开发模式，无需本地安装）...');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
    console.log('[db] 内存 MongoDB 已启动');
  }

  await mongoose.connect(uri);
  await migrateUsersToAccounts();
  await syncAccountIndexes();
  await syncUserIndexes();
  console.log('[db] MongoDB 连接成功:', useMemory ? '(memory)' : uri);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
