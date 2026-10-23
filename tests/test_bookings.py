from datetime import datetime
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock
from uuid import uuid4
from zoneinfo import ZoneInfo
import requests
from remarked import ReMarked, IntegrationError
from server import create_app, validate


class BookingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.adapter = Mock()
        self.adapter.base = 'https://cabinet4.clientomer.ru/599599'
        self.adapter.body.side_effect = lambda b, key: {'operationId': key, 'payload': b}
        self.adapter.create.return_value = 123
        self.app = create_app({}, self.adapter, Path(self.tmp.name)/'test.sqlite3')
        self.client = self.app.test_client()
        from datetime import timedelta
        day = datetime.now(ZoneInfo('Asia/Barnaul')) + timedelta(days=2)
        self.payload = dict(name='Тест', phone='+7 900 000-00-00', date=day.strftime('%Y-%m-%d'), time='20:00', guests=2, note='')
        self.headers = {'Idempotency-Key': str(uuid4())}

    def tearDown(self):
        self.tmp.cleanup()

    def post(self, **kwargs):
        return self.client.post('/api/bookings', json=kwargs.get('data', self.payload), headers=kwargs.get('headers', self.headers))

    def test_success_and_duplicate(self):
        self.assertEqual(self.post().json, {'ok': True, 'reservation_id': 123})
        self.assertEqual(self.post().status_code, 200)
        self.adapter.create.assert_called_once()

    def test_changed_payload_with_same_key(self):
        self.post()
        self.assertEqual(self.post(data={**self.payload, 'guests': 3}).status_code, 409)
        self.adapter.create.assert_called_once()

    def test_timeout_reuses_operation_after_restart(self):
        self.adapter.create.side_effect = [requests.Timeout(), 123]
        self.assertEqual(self.post().status_code, 502)
        self.client = create_app({}, self.adapter, Path(self.tmp.name)/'test.sqlite3').test_client()
        self.assertEqual(self.post().status_code, 200)
        bodies = [call.args[0] for call in self.adapter.create.call_args_list]
        self.assertEqual(bodies[0], bodies[1])

    def test_error_never_returns_success(self):
        self.adapter.create.side_effect = IntegrationError('secret upstream text')
        response = self.post()
        self.assertEqual(response.status_code, 502)
        self.assertFalse(response.json['ok'])
        self.assertNotIn('secret', response.text)

    def test_invalid_input_does_not_reach_remarked(self):
        for patch in [{'phone':'123'}, {'guests':True}, {'guests':21}, {'time':'12:00'}, {'date':'2020-01-01'}, {'note':'x'*1001}]:
            self.assertEqual(self.post(data={**self.payload, **patch}).status_code, 400)
        self.adapter.create.assert_not_called()

    def test_secrets_not_served(self):
        for url in ['/.env', '/.private/bookings.sqlite3', '/server.py', '/requirements.txt', '/img/../.env']:
            self.assertEqual(self.client.get(url).status_code, 404)
        with self.client.get('/booking-api.js') as response:
            self.assertEqual(response.status_code, 200)

    def test_cross_origin_rejected(self):
        self.assertEqual(self.post(headers={**self.headers,'Origin':'https://evil.example'}).status_code, 403)
        self.adapter.create.assert_not_called()

    def test_midnight_is_next_calendar_day(self):
        now = datetime(2026, 10, 23, 17, tzinfo=ZoneInfo('Asia/Barnaul'))
        result = validate({**self.payload, 'date':'2026-10-23','time':'01:00'}, now)
        self.assertEqual(result['arrival_date'], '2026-10-24')
        adapter = ReMarked({})
        adapter.settings = {'defaultReserveDurationMinutes':180}
        body = adapter.body(result, str(uuid4()))['payload']
        self.assertEqual(body['businessDate'], '2026-10-24')
        self.assertEqual(body['endTime'], '04:00')
        self.assertEqual(body['status'], 'new')
        self.assertEqual(body['tableIds'], [])

    def test_login_posts_to_resolved_cabinet(self):
        client = ReMarked({'REMARKED_CABINET_URL':'https://cabinet.clientomer.ru/599599','REMARKED_LOGIN':'test','REMARKED_PASSWORD':'test'})
        redirect = Mock(is_redirect=True, headers={'Location':'https://cabinet4.clientomer.ru/599599'})
        landing = Mock(is_redirect=False)
        bootstrap = Mock()
        bootstrap.json.return_value = {'status':'success','data':{'point':{'id':599599},'settings':{},'dictionaries':{'employees':[{'id':713982014}]}}}
        client.session = Mock()
        client.session.get.side_effect = [redirect, landing, bootstrap]
        client.session.post.return_value.json.return_value = {'status':'success'}
        client.login()
        self.assertEqual(client.session.post.call_args.args[0], 'https://cabinet4.clientomer.ru/599599/jlogin')
        self.assertFalse(client.session.post.call_args.kwargs['allow_redirects'])

    def test_creation_requires_matching_operation_and_reserve_id(self):
        client = ReMarked({})
        client.base = 'https://cabinet4.clientomer.ru/599599'
        response = Mock(is_redirect=False, status_code=200)
        client.session = Mock()
        client.session.post.return_value = response
        for result in [{'status':'error'}, {'status':'success','data':{}}, {'status':'success','data':{'operationId':'other','reserve':{'id':123}}}]:
            response.json.return_value = result
            with self.assertRaises(IntegrationError):
                client.create({'operationId':'requested'})

    def test_calendar_date_is_not_shifted_after_midnight(self):
        now = datetime(2026,10,22,17,tzinfo=ZoneInfo('Asia/Barnaul'))
        result = validate({**self.payload,'date':'2026-10-23','time':'00:30','date_mode':'calendar'},now)
        self.assertEqual(result['arrival_date'],'2026-10-23')
        self.assertEqual(ReMarked({}).body(result,str(uuid4()))['payload']['responsibleId'],713982014)

    def test_calendar_early_hours_use_previous_evenings_schedule(self):
        now = datetime(2026,10,22,17,tzinfo=ZoneInfo('Asia/Barnaul'))
        with self.assertRaises(ValueError):
            validate({**self.payload,'date':'2026-10-23','time':'03:00','date_mode':'calendar'},now)
        self.assertEqual(validate({**self.payload,'date':'2026-10-24','time':'03:00','date_mode':'calendar'},now)['arrival_date'],'2026-10-24')


if __name__ == '__main__':
    unittest.main()
