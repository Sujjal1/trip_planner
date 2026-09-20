"""Small adapter for CoDrive's fixed SQL statements (SQLite locally, PostgreSQL hosted)."""
import re
import sqlite3
import psycopg

IntegrityError = (sqlite3.IntegrityError, psycopg.IntegrityError)
ID_TABLES = {'users', 'vehicles', 'trips', 'expenses', 'routines', 'payments', 'notifications'}


class Row(dict):
    def __getitem__(self, key):
        return tuple(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


def row_factory(cursor):
    columns = [c.name for c in cursor.description] if cursor.description else []
    return lambda values: Row(zip(columns, values))


class Result:
    def __init__(self, cursor, inserted=False):
        self.cursor = cursor
        self.rowcount = cursor.rowcount
        self.lastrowid = cursor.fetchone()[0] if inserted else None

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    def __iter__(self):
        return iter(self.cursor)


class Postgres:
    def __init__(self, url):
        self.connection = psycopg.connect(url, row_factory=row_factory,
                                         connect_timeout=15, prepare_threshold=None)
        # Preserve the small pilot's SQLite serialization semantics, including
        # read-check-write trip/odometer validation, across app restarts/instances.
        self.connection.execute("SET LOCAL lock_timeout = '15s'")
        self.connection.execute("SET LOCAL statement_timeout = '30s'")
        self.connection.execute('SELECT pg_advisory_xact_lock(207174, 1)')

    def execute(self, sql, params=()):
        if sql == 'BEGIN IMMEDIATE':
            return Result(self.connection.execute('SELECT 1'))
        sql = sql.replace('MAX(odometer,?)', 'GREATEST(odometer,?)')
        # Only application-owned statements pass through this adapter. Values
        # always remain bound parameters, never interpolated into SQL.
        sql = sql.replace('?', '%s')
        match = re.match(r'INSERT INTO (\w+)', sql, re.I)
        inserted = bool(match and match.group(1) in ID_TABLES)
        if inserted:
            sql += ' RETURNING id'
        params = tuple(int(p) if isinstance(p, bool) else p for p in params)
        return Result(self.connection.execute(sql, params), inserted)

    def executemany(self, sql, rows):
        for row in rows:
            self.execute(sql, row)

    def executescript(self, script):
        script = script.replace('id INTEGER PRIMARY KEY', 'id SERIAL PRIMARY KEY')
        script = re.sub(r'\bREAL\b', 'DOUBLE PRECISION', script)
        for statement in script.split(';'):
            if statement.strip():
                self.connection.execute(statement)

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        self.connection.close()
