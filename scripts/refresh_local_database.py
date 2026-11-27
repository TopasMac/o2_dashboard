#!/usr/bin/env python3
"""Explicit, local-only replacement of owners2_dev from a trusted mysqldump."""
import argparse
import json
from pathlib import Path
import re
import secrets
import subprocess
import sys

CONTAINER = 'owners2-mysql-dev'
DATABASE = 'owners2_dev'


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def prepare_dump(sql):
    # Transform executable dump comments only; quoted customer values stay intact.
    tokens = re.compile(r"'(?:\\.|''|[^'\\])*'|\"(?:\\.|\"\"|[^\"\\])*\"|`(?:``|[^`])*`|/\*![0-9]*.*?\*/|/\*.*?\*/|--[^\n]*|#[^\n]*", re.S)
    def localize(match):
        value = match.group(0)
        if value.startswith('/*!'):
            value = re.sub(r"SQL SECURITY DEFINER", "SQL SECURITY INVOKER", value)
            value = re.sub(r"DEFINER=`[^`]+`@`[^`]+`", "DEFINER=CURRENT_USER", value)
        return value
    sql = tokens.sub(localize, sql)
    validate_dump(sql)
    return sql.encode("utf-8")


def validate_dump(sql):
    # Remove quoted values before examining SQL, so customer text is never logged.
    tokens = re.compile(r"'(?:\\.|''|[^'\\])*'|\"(?:\\.|\"\"|[^\"\\])*\"|`(?:``|[^`])*`|/\*![0-9]*\s*(.*?)\*/|/\*.*?\*/|--[^\n]*|#[^\n]*", re.S)
    def replace(match):
        value = match.group(0)
        if value.startswith('`'):
            return value
        if value.startswith('/*!'):
            return ' ' + (match.group(1) or '') + ' '
        return ' '
    code = tokens.sub(replace, sql)
    if not re.search(r'\bCREATE\s+TABLE\s+`', code, re.I):
        raise ValueError('Expected a plain MySQL table dump.')
    forbidden = r'\b(?:USE|DATABASE|SCHEMA|DELIMITER|SOURCE|SYSTEM|TRIGGER|PROCEDURE|FUNCTION|EVENT|GRANT|REVOKE|OUTFILE|INFILE|LOAD_FILE|INSTALL|SHUTDOWN)\b|\\'
    # Backtick identifiers may legitimately contain reserved words.
    code = re.sub(r'`(?:``|[^`])*`', '`identifier`', code)
    if re.search(forbidden, code, re.I):
        raise ValueError('Dump contains unsupported SQL or database redirection; review it separately.')


def inspect_target():
    result = run(['docker', 'inspect', CONTAINER], capture_output=True, text=True)
    info = json.loads(result.stdout)[0]
    env = dict(item.split('=', 1) for item in info['Config']['Env'] if '=' in item)
    labels = info['Config'].get('Labels') or {}
    ports = info['HostConfig'].get('PortBindings') or {}
    mounts = info.get('Mounts', [])
    if (not info['State']['Running']
            or info['Config']['Image'] != 'mysql:8.0.43'
            or env.get('MYSQL_DATABASE') != DATABASE
            or env.get('MYSQL_USER') in (None, '', 'root')
            or labels.get('com.docker.compose.service') != 'database'
            or ports.get('3306/tcp') != [{'HostIp': '127.0.0.1', 'HostPort': '3308'}]
            or not any(m.get('Name') == 'owners2_mysql_dev_data' and m.get('Destination') == '/var/lib/mysql' for m in mounts)):
        raise ValueError('Container does not match the approved local Docker database.')
    return info['Id']


def mysql(container_id, sql, root=False, account=None):
    # Password is read inside the container, never placed on the host command line.
    if account:
        user, password = account
        return run(['docker', 'exec', '-i', container_id, 'sh', '-c',
                    'IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec mysql --user="$1" --database=owners2_dev --binary-mode=1', 'sh', user],
                   input=password.encode() + b'\n' + sql, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    return run(['docker', 'exec', '-i', container_id, 'sh', '-c',
                ('MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root --binary-mode=1' if root else
                 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database=owners2_dev --binary-mode=1')],
               input=sql, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup', type=Path, help='Exact path to a trusted plain .sql backup')
    parser.add_argument('--check', action='store_true', help='Validate file and Docker target without importing')
    args = parser.parse_args()
    path = args.backup.expanduser().resolve(strict=True)
    if path.suffix.lower() != '.sql' or not path.is_file():
        raise ValueError('Select an existing plain .sql file.')
    # Hold the validated bytes in memory so a file replacement cannot change the import.
    payload = path.read_bytes()
    payload = prepare_dump(payload.decode('utf-8'))
    container_id = inspect_target()
    mysql(container_id, b'SELECT 1;')
    print(f'Backup: {path}\nTarget: {CONTAINER}, 127.0.0.1:3308/{DATABASE}')
    print('Validation passed. No database changes made.')
    if args.check:
        return
    print('Stop local frontend/backend servers and any database writers before continuing.')
    print('This deletes all local testing data. No recovery copy will be created.')
    if input('Type "replace owners2_dev" to proceed: ') != 'replace owners2_dev':
        print('Cancelled. No database changes made.')
        return
    if inspect_target() != container_id:
        raise ValueError('Container changed during confirmation; rerun the command.')
    user = 'o2_refresh_' + secrets.token_hex(6)
    password = secrets.token_hex(24)
    try:
        mysql(container_id, (f"CREATE USER '{user}'@'localhost' IDENTIFIED BY '{password}'; "
                             f"GRANT ALL PRIVILEGES ON `owners2\\_dev`.* TO '{user}'@'localhost';").encode(), root=True)
        mysql(container_id, b'DROP DATABASE `owners2_dev`; CREATE DATABASE `owners2_dev` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;', root=True)
        mysql(container_id, payload, account=(user, password))
        mysql(container_id, b'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();', account=(user, password))
    finally:
        mysql(container_id, f"DROP USER IF EXISTS '{user}'@'localhost';".encode(), root=True)
    print('Import completed. Existing backup accounts retained; no fixtures or migrations run.')
    print('Before restarting the app, verify local environment settings and review migration status as documented.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, UnicodeError, subprocess.CalledProcessError) as exc:
        # MySQL stderr can contain data; do not echo it or secrets.
        print(f'Refresh failed ({type(exc).__name__}). No automatic retry was attempted. If you already confirmed replacement, leave the app stopped and reimport after resolving the failure.', file=sys.stderr)
        if isinstance(exc, ValueError):
            print(str(exc), file=sys.stderr)
        sys.exit(1)
