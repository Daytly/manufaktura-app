"""Adapter for the ReMarked cabinet API observed on 2026-10-22."""
from datetime import datetime, timedelta
from urllib.parse import urlsplit
import requests


class IntegrationError(Exception):
    pass


def trusted_url(url):
    parsed = urlsplit(url)
    if (parsed.scheme != 'https' or parsed.username or parsed.password
            or not (parsed.hostname or '').endswith('.clientomer.ru')):
        raise IntegrationError('Недопустимый адрес кабинета ReMarked.')
    return url.rstrip('/')


class ReMarked:
    def __init__(self, config):
        self.config = config
        self.session = requests.Session()
        self.base = None
        self.settings = {}

    def login(self):
        if not self.config.get('REMARKED_LOGIN') or not self.config.get('REMARKED_PASSWORD'):
            raise IntegrationError('Заполните логин и пароль ReMarked в .env.')
        # Resolve the regional cabinet BEFORE sending credentials. A 302 on a
        # POST changes it into a GET and loses the form body.
        url = trusted_url(self.config['REMARKED_CABINET_URL'])
        for _ in range(5):
            page = self.session.get(url, timeout=20, allow_redirects=False)
            if page.is_redirect:
                from urllib.parse import urljoin
                url = trusted_url(urljoin(url, page.headers['Location']))
                continue
            page.raise_for_status()
            break
        else:
            raise IntegrationError('Слишком много перенаправлений ReMarked.')
        point = urlsplit(self.config['REMARKED_CABINET_URL']).path.strip('/')
        if not point.isdigit():
            raise IntegrationError('В адресе кабинета отсутствует номер заведения.')
        origin = 'https://' + urlsplit(url).netloc
        self.base = origin + '/' + point
        self.session.headers.update({'Origin': origin, 'Referer': self.base})
        response = self.session.post(self.base + '/jlogin', data={
            'login': self.config['REMARKED_LOGIN'],
            'password': self.config['REMARKED_PASSWORD'], 'code': '',
        }, timeout=20, allow_redirects=False)
        response.raise_for_status()
        result = response.json()
        if result.get('status') == 'code':
            raise IntegrationError('ReMarked требует одноразовый код входа. Нужен сервисный доступ без интерактивного входа.')
        if result.get('status') != 'success':
            raise IntegrationError('ReMarked отклонил вход.')
        bootstrap = self.session.get(self.base + '/reserves.v2.api.bootstrap/', timeout=20, allow_redirects=False)
        bootstrap.raise_for_status()
        result = bootstrap.json()
        data = result.get('data', {})
        if result.get('status') != 'success' or int(data.get('point', {}).get('id', 0)) != int(point):
            raise IntegrationError('Не удалось проверить кабинет ReMarked.')
        if data.get('readOnly'):
            raise IntegrationError('Учётная запись ReMarked доступна только для чтения.')
        self.settings = data.get('settings', {})
        return data['point']

    def body(self, booking, request_id):
        duration = int(self.settings.get('durationByGuestCount', {}).get(str(booking['guests']),
                       self.settings.get('defaultReserveDurationMinutes', 180)))
        start = datetime.fromisoformat(booking['arrival_date'] + 'T' + booking['time'])
        return {
            'operationId': request_id, 'clientReserveId': request_id,
            'payload': {
                'type': 'booking', 'status': 'new',
                # Despite its API name, businessDate here is the calendar date
                # of arrival (the cabinet's own serializer uses selectedDate).
                'businessDate': booking['arrival_date'], 'startTime': booking['time'],
                'endTime': (start + timedelta(minutes=duration)).strftime('%H:%M'),
                'durationMinutes': duration, 'tableIds': [],
                'guestsCount': booking['guests'], 'childrenCount': 0,
                'isTransplantBlocked': False, 'withoutPhone': False,
                'shouldSendNotification': False, 'notificationTemplateId': None,
                'channelPreference': None, 'source': 'telegram',
                'responsibleId': None, 'eventTags': [], 'guestComment': '',
                'reserveComment': 'Заявка из мини-приложения Мануфактура.' +
                    ('\n' + booking['note'] if booking['note'] else ''),
                'guest': {'id': None, 'isSelected': False, 'firstName': booking['name'],
                          'lastName': '', 'patronymic': '', 'birthDate': '',
                          'phone': booking['phone'], 'email': '', 'telegramUsername': '', 'tags': []},
            },
        }

    def create(self, body):
        if not self.base:
            self.login()
        for attempt in range(2):
            response = self.session.post(self.base + '/reserves.v2.api.reserve.create/',
                                         json=body, timeout=25, allow_redirects=False)
            if response.status_code == 401 and attempt == 0:
                self.login()
                continue
            break
        if response.is_redirect:
            self.base = None
            raise IntegrationError('Сессия ReMarked истекла. Повторите отправку этой заявки.')
        response.raise_for_status()
        result = response.json()
        data = result.get('data', {})
        reserve = data.get('reserve', {})
        if result.get('status') != 'success':
            raise IntegrationError('ReMarked не принял заявку. Уточните бронь по телефону.')
        if data.get('operationId') != body['operationId'] or not isinstance(reserve.get('id'), int) or reserve['id'] <= 0:
            raise IntegrationError('ReMarked вернул неполное подтверждение. Повторите отправку этой заявки.')
        return reserve['id']
