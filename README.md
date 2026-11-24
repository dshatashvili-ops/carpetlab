# CarpetLAB
Сервис учета и раскроя ковров. Документы: `docs/superpowers/specs`, `docs/superpowers/plans`.
Запуск dev: PostgreSQL 16 (см. `docker-compose.yml` или локальный), `cd backend && npm test`.

## Администратор сервиса
Администратор CarpetLAB (цены тарифов, подтверждение счетов) назначается в БД:
`UPDATE "User" SET "isServiceAdmin" = true WHERE email = 'you@example.com';`
