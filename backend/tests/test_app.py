import os
import tempfile
from pathlib import Path

os.environ['DATABASE_PATH'] = str(Path(tempfile.mkdtemp()) / 'test.sqlite3')
os.environ['DEMO_MODE'] = 'false'
from backend import main
from fastapi.testclient import TestClient
import pytest

HEADERS = {'X-CoDrive':'1'}

@pytest.fixture(autouse=True)
def clean(tmp_path, monkeypatch):
    monkeypatch.setattr(main,'DB',str(tmp_path/'garage.sqlite3'))
    main.attempts.clear()
    main.init_db()


def client(name='Alex'):
    c=TestClient(main.app,headers=HEADERS)
    r=c.post('/api/auth/register',json={'name':name,'email':name.lower()+'@test.com','password':'a-long-password'})
    assert r.status_code==200,r.text
    return c


def vehicle(c):
    r=c.post('/api/vehicles',json={'name':'Our RAV4','plate':'TEST 123','mpg':30,'odometer':10000,'fuel_price':3.60})
    assert r.status_code==200,r.text
    return r.json()['id']


def start(c,vid,**kw):
    body={'origin':'Home','destination':'Office','purpose':'Commute','start_odometer':10000,'sharing':True,**kw}
    return c.post(f'/api/vehicles/{vid}/trips',json=body)


def join(c,owner,vid):
    code=owner.get(f'/api/vehicles/{vid}').json()['vehicle']['invite']
    r=c.post('/api/vehicles/join',json={'code':code})
    assert r.status_code==200,r.text


def test_auth_sessions_csrf_and_isolation():
    owner=client();vid=vehicle(owner);outsider=client('Other')
    assert outsider.get(f'/api/vehicles/{vid}').status_code==404
    assert outsider.post(f'/api/vehicles/{vid}/expenses',json={'description':'Bad','category':'Fuel purchase','amount':30}).status_code==404
    assert TestClient(main.app).get('/api/me').status_code==401
    assert TestClient(main.app).post('/api/auth/logout').status_code==403
    owner.post('/api/auth/logout')
    assert owner.get('/api/me').status_code==401
    assert owner.post('/api/auth/login',json={'email':'alex@test.com','password':'bad-password'}).status_code==401
    assert owner.post('/api/auth/login',json={'email':'alex@test.com','password':'a-long-password'}).status_code==200
    assert owner.get('/api/me').status_code==200


def test_trip_cost_snapshot_and_single_active_trip():
    c=client();vid=vehicle(c)
    tid=start(c,vid).json()['id']
    assert start(c,vid).status_code==409
    c.patch(f'/api/vehicles/{vid}',json={'mpg':15,'fuel_price':5})
    assert c.post(f'/api/trips/{tid}/finish',json={'end_odometer':9999}).status_code==400
    result=c.post(f'/api/trips/{tid}/finish',json={'end_odometer':10060})
    assert result.json()['cost_cents']==720 # 60 / original 30 * original $3.60
    assert c.post(f'/api/trips/{tid}/finish',json={'end_odometer':10060}).status_code==409
    data=c.get(f'/api/vehicles/{vid}').json()
    assert data['vehicle']['odometer']==10060
    assert data['owners'][0]['balance_cents']==720
    assert start(c,vid).status_code==400


def test_private_trip_redaction_and_location_deletion():
    c=client();vid=vehicle(c);co=client('Jamie');join(co,c,vid)
    tid=start(c,vid).json()['id']
    c.post(f'/api/trips/{tid}/location',json={'latitude':41.9,'longitude':-87.6})
    assert co.get(f'/api/vehicles/{vid}').json()['trips'][0]['latitude']==41.9
    assert co.post(f'/api/trips/{tid}/location',json={'latitude':0,'longitude':0}).status_code==404
    assert co.patch(f'/api/trips/{tid}/privacy',json={'sharing':False}).status_code==404
    assert co.post(f'/api/trips/{tid}/finish',json={'end_odometer':10020}).status_code==404
    c.patch(f'/api/trips/{tid}/privacy',json={'sharing':False})
    other=co.get(f'/api/vehicles/{vid}').json()['trips'][0]
    assert other['latitude'] is None and other['longitude'] is None
    assert other['origin']==other['destination']=='Private location'
    assert c.get(f'/api/vehicles/{vid}').json()['trips'][0]['origin']=='Home'
    assert c.post(f'/api/trips/{tid}/location',json={'latitude':0,'longitude':0}).status_code==409
    with main.db() as db:
        assert db.execute('SELECT latitude FROM trips WHERE id=?',(tid,)).fetchone()[0] is None
    c.patch(f'/api/trips/{tid}/privacy',json={'sharing':True})
    c.post(f'/api/trips/{tid}/location',json={'latitude':41,'longitude':-87})
    c.post(f'/api/trips/{tid}/finish',json={'end_odometer':10001})
    assert co.get(f'/api/vehicles/{vid}').json()['trips'][0]['latitude'] is None


def test_expense_rounding_fuel_credits_and_membership_snapshot():
    a=client();vid=vehicle(a);b=client('Jamie');d=client('Sam');join(b,a,vid);join(d,a,vid)
    assert a.post(f'/api/vehicles/{vid}/expenses',json={'description':'Oil change','category':'Maintenance','amount':10}).status_code==200
    data=a.get(f'/api/vehicles/{vid}').json()
    assert sorted(o['shared_cents'] for o in data['owners'])==[333,333,334]
    assert sum(o['balance_cents'] for o in data['owners'])==0
    later=client('Later');join(later,a,vid)
    assert later.get(f'/api/vehicles/{vid}').json()['owners'][-1]['shared_cents']==0
    b.post(f'/api/vehicles/{vid}/expenses',json={'description':'Fuel','category':'Fuel purchase','amount':25})
    data=b.get(f'/api/vehicles/{vid}').json()
    jamie=next(o for o in data['owners'] if o['name']=='Jamie')
    assert jamie['shared_cents']==333
    assert jamie['paid_cents']==2500
    assert jamie['balance_cents']==-2167


def test_invite_controls_routines_and_notifications():
    a=client();vid=vehicle(a);b=client('Jamie');join(b,a,vid)
    old=a.get(f'/api/vehicles/{vid}').json()['vehicle']['invite']
    assert 'invite' not in b.get(f'/api/vehicles/{vid}').json()['vehicle']
    assert b.post(f'/api/vehicles/{vid}/invite').status_code==403
    a.post(f'/api/vehicles/{vid}/invite')
    assert b.post('/api/vehicles/join',json={'code':old}).status_code==404
    rid=a.post(f'/api/vehicles/{vid}/routines',json={'origin':'Home','destination':'Work','days':'Mon, Fri','time':'08:30','miles':24}).json()['id']
    assert b.delete(f'/api/routines/{rid}').status_code==404
    assert a.delete(f'/api/routines/{rid}').status_code==200
    data=b.get(f'/api/vehicles/{vid}').json()
    assert any('joined' in n['message'] for n in data['notifications'])


def test_validation_and_unconfigured_integrations(monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY',raising=False)
    monkeypatch.delenv('EIA_API_KEY',raising=False)
    c=client();vid=vehicle(c)
    assert c.patch(f'/api/vehicles/{vid}',json={'mpg':0,'fuel_price':3}).status_code==422
    assert start(c,vid,start_odometer=-1).status_code==422
    assert c.post(f'/api/vehicles/{vid}/expenses',json={'description':'Oops','category':'Maintenance','amount':-1}).status_code==422
    assert c.get('/api/fuel-price').status_code==503
    assert c.post('/api/scan',json={'image':'test','consent':False}).status_code==400
    assert c.post('/api/scan',json={'image':'test','consent':True}).status_code==503
    assert c.post('/api/demo').status_code==404


def test_demo_isolated_and_opt_in(monkeypatch):
    monkeypatch.setenv('DEMO_MODE','true')
    a=TestClient(main.app,headers=HEADERS);b=TestClient(main.app,headers=HEADERS)
    assert a.post('/api/demo').status_code==200
    assert b.post('/api/demo').status_code==200
    va=a.get('/api/me').json()['vehicles'][0]['id']
    vb=b.get('/api/me').json()['vehicles'][0]['id']
    assert va!=vb
    assert a.get(f'/api/vehicles/{vb}').status_code==404
    data=a.get(f'/api/vehicles/{va}').json()
    assert sum(o['miles'] for o in data['owners'])==460


def test_vehicle_details_edit_and_odometer_protection():
    c=client();vid=vehicle(c);outsider=client('Other')
    body={'name':'Family car','plate':'NEW 123','mpg':32,'odometer':10000,'fuel_price':4}
    assert outsider.patch(f'/api/vehicles/{vid}/details',json=body).status_code==404
    assert c.patch(f'/api/vehicles/{vid}/details',json=body).status_code==200
    assert c.get(f'/api/vehicles/{vid}').json()['vehicle']['name']=='Family car'
    tid=start(c,vid).json()['id']
    assert c.patch(f'/api/vehicles/{vid}/details',json={**body,'odometer':10001}).status_code==409
    c.post(f'/api/trips/{tid}/finish',json={'end_odometer':10020})
    assert c.patch(f'/api/vehicles/{vid}/details',json=body).status_code==400


def test_past_trip_charges_and_overlap_guards():
    from datetime import datetime,timedelta,timezone
    c=client();vid=vehicle(c)
    t=datetime.now(timezone.utc)-timedelta(days=2)
    body={'origin':'Home','destination':'Office','purpose':'Commute','start_odometer':10000,'end_odometer':10060,'started_at':t.isoformat(),'ended_at':(t+timedelta(hours=1)).isoformat(),'sharing':False}
    r=c.post(f'/api/vehicles/{vid}/trips/manual',json=body)
    assert r.status_code==200,r.text
    assert r.json()['cost_cents']==720
    data=c.get(f'/api/vehicles/{vid}').json()
    assert data['vehicle']['odometer']==10060
    assert data['owners'][0]['balance_cents']==720
    assert c.post(f'/api/vehicles/{vid}/trips/manual',json=body).status_code==409
    earlier={**body,'start_odometer':9980,'end_odometer':9990,'started_at':(t-timedelta(days=1)).isoformat(),'ended_at':(t-timedelta(days=1)+timedelta(hours=1)).isoformat()}
    assert c.post(f'/api/vehicles/{vid}/trips/manual',json=earlier).status_code==200
    assert c.get(f'/api/vehicles/{vid}').json()['vehicle']['odometer']==10060
    bad={**earlier,'start_odometer':10001,'end_odometer':10010,'started_at':(t-timedelta(hours=2)).isoformat(),'ended_at':(t-timedelta(hours=1)).isoformat()}
    assert c.post(f'/api/vehicles/{vid}/trips/manual',json=bad).status_code==400
    future={**body,'started_at':(t+timedelta(days=3)).isoformat(),'ended_at':(t+timedelta(days=4)).isoformat()}
    assert c.post(f'/api/vehicles/{vid}/trips/manual',json=future).status_code==400
    naive={**body,'started_at':'2020-01-01T10:00:00','ended_at':'2020-01-01T11:00:00'}
    assert c.post(f'/api/vehicles/{vid}/trips/manual',json=naive).status_code==400
