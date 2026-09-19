// tests/setup.js — one in-memory MongoDB per test file.
//
// Started as a replica set of one so transactions behave in tests exactly as
// they do against Atlas. Collections are cleared between tests, so no test
// depends on another having run first.
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await replSet?.stop();
});
