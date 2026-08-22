import { prisma } from '../src/lib/prisma';

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    process.env.SKIP_INTEGRATION = 'true';
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    process.env.SKIP_INTEGRATION = 'false';
  } catch {
    process.env.SKIP_INTEGRATION = 'true';
    console.warn('Integration tests skipped — database unreachable');
  } finally {
    await prisma.$disconnect();
  }
}
