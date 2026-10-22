import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
from contextlib import closing
from datetime import datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from dotenv import dotenv_values
from flask import Flask, abort, jsonify, request, send_from_directory
import requests
from remarked import ReMarked, IntegrationError

ROOT = Path(__file__).resolve().parent


def validate(data, now=None):
    if not isinstance(data, dict):
        raise ValueError('Некорректные данные заявки.')
    def string(key, minimum, maximum):
        value = data.get(key, '')
        if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum:
            raise ValueError('Проверьте поле: ' + key)
        return value.strip()
    name = string('name', 2, 100)
    note = string('note', 0, 1000)
    phone = re.sub(r'\D', '', string('phone', 11, 25))
    if phone.startswith('8'):
        phone = '7' + phone[1:]
    if not re.fullmatch(r'7\d{10}', phone):
        raise ValueError('Укажите российский номер телефона.')
    guests = data.get('guests')
    if type(guests) is not int or not 1 <= guests <= 20:
        raise ValueError('Укажите от 1 до 20 гостей.')
    date = string('date', 10, 10)
    slot = string('time', 5, 5)
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date) or not re.fullmatch(r'\d{2}:\d{2}', slot):
        raise ValueError('Некорректная дата или время.')
    service_day = datetime.strptime(date, '%Y-%m-%d')
    hour, minute = map(int, slot.split(':'))
    close = 5 if service_day.weekday() in (4, 5) else 2
    # Match the existing form: last arrival is one hour before closing.
    if minute not in (0, 30) or not (17 <= hour <= 23 or 0 <= hour < close):
        raise ValueError('Выберите время работы бара.')
    total = hour * 60 + minute + (1440 if hour < 5 else 0)
    if total > (24 + close - 1) * 60:
        raise ValueError('На это время бронь уже недоступна.')
    start = service_day + timedelta(minutes=total)
    tz = ZoneInfo('Asia/Barnaul')
    now = now or datetime.now(tz)
    if start.replace(tzinfo=tz) <= now or start.replace(tzinfo=tz) > now + timedelta(days=91):
        raise ValueError('Выберите будущее время в пределах 90 дней.')
    return dict(name=name, phone='+'+phone, note=note, guests=guests,
                date=date, time=slot, arrival_date=start.strftime('%Y-%m-%d'))


def create_app(config=None, adapter=None, db_path=None):
    app = Flask(__name__, static_folder=None)
    app.config['MAX_CONTENT_LENGTH'] = 8192
    config = config if config is not None else {**dotenv_values(ROOT / '.env'), **os.environ}
    adapter = adapter or ReMarked(config)
    private = Path(config.get('DATA_DIR') or ROOT / '.private')
    private.mkdir(mode=0o700, exist_ok=True)
    db_path = db_path or private / 'bookings.sqlite3'
    with closing(sqlite3.connect(db_path)) as db, db:
        db.execute('CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, body TEXT NOT NULL, reserve_id INTEGER)')
    os.chmod(db_path, 0o600)
    lock = threading.Lock()
    rate = {}

    @app.get('/healthz')
    def health():
        return jsonify(ok=True)

    @app.after_request
    def cors(response):
        origin = request.headers.get('Origin')
        if origin and origin == config.get('PUBLIC_ORIGIN') and request.path == '/api/bookings':
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Vary'] = 'Origin'
            response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Idempotency-Key'
        return response

    @app.get('/')
    def index():
        return send_from_directory(ROOT, 'index.html')

    @app.get('/<path:filename>')
    def assets(filename):
        allowed = filename in {'app.js', 'booking-api.js', 'config.js', 'data.js', 'index.html', 'robots.txt'}
        allowed = allowed or (filename.startswith(('fonts/', 'img/')) and not any(p.startswith('.') or p == '..' for p in filename.split('/')))
        if not allowed:
            abort(404)
        return send_from_directory(ROOT, filename)

    @app.post('/api/bookings')
    def book():
        origin = request.headers.get('Origin')
        allowed = {request.host_url.rstrip('/'), config.get('PUBLIC_ORIGIN'), config.get('APP_ORIGIN')}
        if origin and origin not in allowed:
            return jsonify(ok=False, message='Недопустимый источник запроса.'), 403
        if not request.is_json:
            return jsonify(ok=False, message='Ожидается JSON.'), 415
        try:
            request_id = str(UUID(request.headers.get('Idempotency-Key', '')))
            data = request.get_json()
            booking = validate(data)
        except (ValueError, TypeError):
            return jsonify(ok=False, message='Проверьте имя, телефон, дату, время и число гостей.'), 400
        fingerprint = hashlib.sha256(json.dumps(booking, sort_keys=True).encode()).hexdigest()
        with lock:
            now = time.monotonic()
            # Bounded rate-limit memory; don't trust spoofable forwarded headers.
            for ip in list(rate):
                rate[ip] = [t for t in rate[ip] if now-t < 60]
                if not rate[ip]:
                    del rate[ip]
            hits = rate.setdefault(request.remote_addr, [])
            if len(hits) >= 10:
                return jsonify(ok=False, message='Слишком много запросов. Подождите минуту.'), 429
            hits.append(now)
            try:
                with closing(sqlite3.connect(db_path, timeout=90)) as db, db:
                    db.execute('BEGIN IMMEDIATE')
                    row = db.execute('SELECT fingerprint, body, reserve_id FROM bookings WHERE id=?', (request_id,)).fetchone()
                    if row:
                        if row[0] != fingerprint:
                            return jsonify(ok=False, message='Данные заявки изменились. Отправьте новую заявку.'), 409
                        if row[2]:
                            return jsonify(ok=True, reservation_id=row[2])
                        body = json.loads(row[1])
                    else:
                        if not adapter.base:
                            adapter.login()
                        body = adapter.body(booking, request_id)
                        db.execute('INSERT INTO bookings VALUES (?,?,?,NULL)', (request_id, fingerprint, json.dumps(body)))
                    # Commit operationId before the external mutation, so a lost
                    # response/restart can reuse exactly the same operation.
                    db.commit()
                    reserve_id = adapter.create(body)
                    db.execute('UPDATE bookings SET reserve_id=? WHERE id=?', (reserve_id, request_id))
                return jsonify(ok=True, reservation_id=reserve_id)
            except (IntegrationError, requests.RequestException, ValueError, sqlite3.Error):
                # Never expose upstream responses, credentials or guest data.
                app.logger.warning('Booking delivery not confirmed; request_id=%s', request_id)
                return jsonify(ok=False, message='Не удалось получить подтверждение ReMarked. Повторите отправку с теми же данными или позвоните в бар.'), 502

    return app


app = create_app()

if __name__ == '__main__':
    import sys
    if '--check-remarked' in sys.argv:
        client = ReMarked({**dotenv_values(ROOT / '.env'), **os.environ})
        try:
            point = client.login()
            print('Вход успешен. Кабинет:', point['id'], point['name'])
            print('Создание броней при этой проверке не выполняется.')
        except (IntegrationError, requests.RequestException, ValueError) as exc:
            print('Проверка не пройдена:', str(exc) if isinstance(exc, IntegrationError) else type(exc).__name__)
            raise SystemExit(1)
    else:
        app.run(host='127.0.0.1', port=8080, debug=False)
