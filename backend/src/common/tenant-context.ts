import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

/** Runs `fn` in a transaction where RLS sees only rows of `orgId`. */
export async function runInTenant<T>(
  prisma: PrismaClient,
  orgId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
    return fn(tx);
  });
}
