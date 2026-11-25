# Резервные копии и восстановление CarpetLAB

## Что копируется
- **Ежедневный дамп БД** — `deploy/backup.sh` (формат `pg_dump -Fc`, хранится 14 дней, архив проверяется `pg_restore --list`). Запуск из cron:
  `15 3 * * *  DATABASE_ADMIN_URL=postgresql://carpet_admin:***@localhost:5432/carpetlab /opt/carpetlab/deploy/backup.sh`
- **Архив WAL** — включен в `docker-compose.prod.yml` (`archive_mode=on`, том `walarchive`). Вместе с базовой копией позволяет восстановить БД на любой момент времени (PITR). Раз в сутки делайте базовую копию (`pg_basebackup`) и храните вместе с WAL вне сервера.
- **Фото артикулов** — том `storage` (`STORAGE_DIR`). Копируйте тем же заданием (`rsync`/снапшот тома).
- Хранить копии нужно **на другом сервере в РФ** (152-ФЗ), а не рядом с рабочей БД.

## Проверка, что копия восстанавливается (делать раз в неделю)
```bash
export DATABASE_ADMIN_URL=postgresql://carpet_admin:***@localhost:5432/carpetlab
deploy/verify-restore.sh /var/backups/carpetlab/carpetlab-YYYYmmdd-HHMMSS.dump
```
Скрипт восстанавливает дамп во временную базу `carpetlab_restore_check`, сравнивает число записей во всех основных таблицах с рабочей базой и удаляет временную базу. Код выхода `0` — все совпало.

## Восстановление после аварии
1. Остановить `backend` и `web`: `docker compose -f deploy/docker-compose.prod.yml stop backend web`.
2. Создать чистую базу и восстановить дамп:
   ```bash
   psql "$DATABASE_ADMIN_URL_POSTGRES" -c "DROP DATABASE carpetlab" -c "CREATE DATABASE carpetlab"
   pg_restore --no-owner --dbname="$DATABASE_ADMIN_URL" /var/backups/carpetlab/carpetlab-….dump
   ```
3. Запустить сервис: `docker compose … up -d` (сервисы `init-roles`, `migrate`, `grants` по очереди создадут роль `carpet_app`, применят недостающие миграции и выдадут права).
4. Проверить вход, остатки и последний документ раскроя.

## Восстановление на момент времени (PITR)
Базовая копия + файлы WAL из тома `walarchive`: положить базовую копию в каталог данных, создать `recovery.signal`, указать `restore_command = 'cp /wal/%f %p'` и `recovery_target_time = '…'`. Подробности: документация PostgreSQL, раздел «Continuous Archiving and Point-in-Time Recovery».
