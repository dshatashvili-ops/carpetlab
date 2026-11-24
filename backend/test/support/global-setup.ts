import { execSync } from 'node:child_process';

export default async function globalSetup(): Promise<void> {
  const url = 'postgresql://carpet_admin:carpet@localhost:5432/carpetlab_test';
  execSync('npx prisma migrate reset --force --skip-generate --skip-seed', {
    env: { ...process.env, DATABASE_URL: url, DATABASE_ADMIN_URL: url },
    stdio: 'inherit',
  });
}
