// Shim: WASM-based PrismaClient using pg as the driver adapter
// Used in CI environments without the native libquery_engine binary.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const pg = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

// Import the WASM-based client from generated wasm.js 
const { PrismaClient: WasmPrismaClient, Prisma } = require('/home/claude/post2drive-app/node_modules/.prisma/client/wasm.js');

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:pw@127.0.0.1:5432/p2dlocal';

const pool = new Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);

export class PrismaClient extends WasmPrismaClient {
  constructor(opts = {}) {
    super({ ...opts, adapter });
  }
}

export { Prisma };

process.on('exit', () => pool.end().catch(() => {}));
