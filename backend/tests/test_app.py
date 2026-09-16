import os
import tempfile
from pathlib import Path

os.environ['DATABASE_PATH'] = str(Path(tempfile.mkdtemp()) / 'test.sqlite3')
os.environ['DEMO_MODE'] = 'false'
os.environ['DATABASE_URL'] = os.getenv('TEST_DATABASE_URL', '')
from backend import main
from fastapi.testclient import TestClient
import pytest

HEADERS = {'X-CoDrive':'1'}

@pytest.fixture(autouse=True)
def clean(tmp_path, monkeypatch):
    monkeypatch.setattr(main,'DB',str(tmp_path/'garage.sqlite3'))
    if main.DATABASE_URL:
        with main.db() as c:
            c.execute('TRUNCATE users, sessions, vehicles, members, trips, trip_participants, expenses, expense_shares, routines, payments, notifications, api_usage RESTART IDENTITY CASCADE')
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


def test_concurrent_starts_only_create_one_trip():
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    owner = client()
    vid = vehicle(owner)
    barrier = Barrier(2)

    def attempt():
        browser = TestClient(main.app, headers=HEADERS)
        browser.cookies.update(owner.cookies)
        barrier.wait(timeout=10)
        return start(browser, vid).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: attempt(), range(2)))
    assert sorted(results) == [200, 409]
    assert len(owner.get(f'/api/vehicles/{vid}').json()['trips']) == 1


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


def test_google_places_adapter_uses_google_results_and_requires_login(monkeypatch):
    import httpx
    monkeypatch.setenv('GOOGLE_PLACES_API_KEY','test-server-key')
    main.place_requests.clear()
    calls=[]
    def provider(request):
        calls.append(request)
        assert request.headers['X-Goog-Api-Key']=='test-server-key'
        if request.url.path.endswith(':autocomplete'):
            return httpx.Response(200,json={'suggestions':[{'placePrediction':{'placeId':'ChIJ_test123','text':{'text':'Union Station, Chicago'}}}]})
        assert request.headers['X-Goog-FieldMask']=='id,formattedAddress,location'
        return httpx.Response(200,json={'id':'ChIJ_test123','formattedAddress':'225 S Canal St, Chicago, IL','location':{'latitude':41.878,'longitude':-87.64}})
    original=httpx.AsyncClient
    monkeypatch.setattr(main.httpx,'AsyncClient',lambda **kwargs: original(transport=httpx.MockTransport(provider),**kwargs))
    c=client()
    token='test-session-token-123'
    r=c.post('/api/maps/search',json={'query':'Union Station','session_token':token})
    assert r.status_code==200
    assert r.json()['places'][0]['id']=='ChIJ_test123'
    r=c.post('/api/maps/place',json={'place_id':'ChIJ_test123','session_token':token})
    assert r.json()['label']=='225 S Canal St, Chicago, IL'
    assert calls[1].url.params['sessionToken']==token
    assert c.post('/api/maps/place',json={'place_id':'../../secrets','session_token':token}).status_code==422
    c.post('/api/auth/logout')
    assert c.post('/api/maps/search',json={'query':'Chicago','session_token':token}).status_code==401


def test_google_places_provider_failure_is_actionable(monkeypatch):
    import httpx
    monkeypatch.setenv('GOOGLE_PLACES_API_KEY','test-server-key')
    main.place_requests.clear()
    original=httpx.AsyncClient
    monkeypatch.setattr(main.httpx,'AsyncClient',lambda **kwargs: original(transport=httpx.MockTransport(lambda r:httpx.Response(403,json={'error':{'message':'private provider details'}})),**kwargs))
    c=client()
    r=c.post('/api/maps/search',json={'query':'Chicago','session_token':'test-session-123'})
    assert r.status_code==503
    assert 'Places API (New)' in r.json()['detail']
    assert 'private provider details' not in r.text


@pytest.mark.parametrize('failure,expected_status,message',[
    ('timeout',504,'took too long'),
    (429,503,'quota or rate limit'),
    (403,503,'rejected access'),
    (404,503,'model is unavailable'),
    (503,502,'temporarily unavailable'),
])
def test_photo_provider_errors_are_actionable(monkeypatch,failure,expected_status,message):
    import httpx,base64,io
    from PIL import Image
    monkeypatch.setenv('GEMINI_API_KEY','test-key')
    def provider(request):
        if failure=='timeout': raise httpx.ReadTimeout('private details',request=request)
        return httpx.Response(failure,json={'error':{'message':'private details'}})
    original=httpx.AsyncClient
    monkeypatch.setattr(main.httpx,'AsyncClient',lambda **kwargs: original(transport=httpx.MockTransport(provider),**kwargs))
    image=io.BytesIO();Image.new('RGB',(8,8)).save(image,format='PNG')
    c=client();result=c.post('/api/scan',json={'consent':True,'image':base64.b64encode(image.getvalue()).decode()})
    assert result.status_code==expected_status
    assert message in result.json()['detail']
    assert 'private details' not in result.text


def test_direct_payment_settles_both_owners_and_undoes_cleanly():
    owner=client();vid=vehicle(owner);sam=client('Sam');join(sam,owner,vid)
    uid=owner.get('/api/me').json()['user']['id'];sid=sam.get('/api/me').json()['user']['id']
    expense=owner.post(f'/api/vehicles/{vid}/expenses',json={'description':'Service','category':'Maintenance','amount':60}).json()['id']
    def balances():return {o['id']:o['balance_cents'] for o in owner.get(f'/api/vehicles/{vid}').json()['owners']}
    assert balances()=={uid:-3000,sid:3000}
    r=sam.post(f'/api/vehicles/{vid}/payments',json={'recipient_id':uid,'amount':'30.00','note':'Cash'})
    assert r.status_code==200,r.text
    pid=r.json()['id'];assert balances()=={uid:0,sid:0}
    d=owner.get(f'/api/vehicles/{vid}').json();assert len(d['expenses'])==1 and len(d['payments'])==1
    assert sam.patch(f'/api/records/payments/{pid}',json={'deleted':True}).status_code==200
    assert balances()=={uid:-3000,sid:3000}
    # Duplicate delete is harmless, restore applies exactly once.
    sam.patch(f'/api/records/payments/{pid}',json={'deleted':True})
    for _ in range(2):assert sam.patch(f'/api/records/payments/{pid}',json={'deleted':False}).status_code==200
    assert balances()=={uid:0,sid:0}
    assert sam.patch(f'/api/records/expenses/{expense}',json={'deleted':True}).status_code==403
    assert owner.patch(f'/api/records/expenses/{expense}',json={'deleted':True}).status_code==200
    assert balances()=={uid:3000,sid:-3000}
    owner.patch(f'/api/records/expenses/{expense}',json={'deleted':False})
    assert balances()=={uid:0,sid:0}


def test_payments_reject_self_outsiders_and_fractional_cents():
    c=client();vid=vehicle(c);uid=c.get('/api/me').json()['user']['id']
    outsider=client('Other');oid=outsider.get('/api/me').json()['user']['id']
    assert c.post(f'/api/vehicles/{vid}/payments',json={'recipient_id':uid,'amount':10}).status_code==400
    assert c.post(f'/api/vehicles/{vid}/payments',json={'recipient_id':oid,'amount':10}).status_code==404
    assert outsider.post(f'/api/vehicles/{vid}/payments',json={'recipient_id':uid,'amount':10}).status_code==404
    for amount in ['0','-1','0.001','NaN','100000.01']:
        assert c.post(f'/api/vehicles/{vid}/payments',json={'recipient_id':oid,'amount':amount}).status_code==422


def test_trip_removal_restore_and_odometer_correction():
    c=client();vid=vehicle(c);tid=start(c,vid).json()['id']
    assert c.patch(f'/api/records/trips/{tid}',json={'deleted':True}).status_code==409
    c.post(f'/api/trips/{tid}/finish',json={'end_odometer':10030})
    assert c.patch(f'/api/records/trips/{tid}',json={'deleted':True}).status_code==200
    d=c.get(f'/api/vehicles/{vid}').json()
    assert d['trips']==[] and d['owners'][0]['fuel_cents']==0 and d['vehicle']['odometer']==10030
    assert d['removed'][0]['id']==tid
    assert c.patch(f'/api/records/trips/{tid}',json={'deleted':False}).status_code==200
    assert c.get(f'/api/vehicles/{vid}').json()['owners'][0]['fuel_cents']==360
    c.patch(f'/api/records/trips/{tid}',json={'deleted':True})
    body={'name':'Our RAV4','plate':'TEST 123','mpg':30,'odometer':10000,'fuel_price':3.60}
    assert c.patch(f'/api/vehicles/{vid}/details',json=body).status_code==200
    # Restoring a record keeps the physical odometer at least as high as its ending reading.
    c.patch(f'/api/records/trips/{tid}',json={'deleted':False})
    assert c.get(f'/api/vehicles/{vid}').json()['vehicle']['odometer']==10030
    outsider=client('Other')
    assert outsider.patch(f'/api/records/trips/{tid}',json={'deleted':True}).status_code==404
    main.init_db() # migrations must be safe to repeat against populated data.
    assert c.get(f'/api/vehicles/{vid}').json()['trips'][0]['id']==tid


def test_places_budget_blocks_provider_and_survives_restart(monkeypatch):
    from datetime import datetime, timezone
    import httpx
    monkeypatch.setenv('GOOGLE_PLACES_API_KEY','test-key')
    main.place_requests.clear()
    c=client()
    calls=[]
    original=httpx.AsyncClient
    def provider(request):
        calls.append(request)
        return httpx.Response(500,json={})
    monkeypatch.setattr(main.httpx,'AsyncClient',lambda **kwargs: original(transport=httpx.MockTransport(provider),**kwargs))
    body={'query':'Chicago','session_token':'budget-test-session'}
    assert c.post('/api/maps/search',json=body).status_code==502
    period='day:'+datetime.now(timezone.utc).date().isoformat()
    with main.db() as connection:
        assert connection.execute('SELECT requests FROM api_usage WHERE period=?',(period,)).fetchone()[0]==1
        connection.execute('UPDATE api_usage SET requests=100 WHERE period=?',(period,))
    main.init_db()
    blocked=c.post('/api/maps/search',json=body)
    assert blocked.status_code==503 and 'usage allowance' in blocked.json()['detail']
    assert len(calls)==1


def test_trip_participants_split_exact_cents_and_restore():
    a=client(); vid=vehicle(a); b=client('Bea'); d=client('Dee')
    join(b,a,vid); join(d,a,vid)
    owners=a.get(f'/api/vehicles/{vid}').json()['owners']; ids=[o['id'] for o in owners]
    tid=start(a,vid,participant_ids=ids).json()['id']
    assert a.post(f'/api/trips/{tid}/finish',json={'end_odometer':10001}).status_code==200
    data=a.get(f'/api/vehicles/{vid}').json()
    assert sum(o['fuel_cents'] for o in data['owners'])==12
    assert [p['cost_cents'] for p in data['trips'][0]['participants']]==[4,4,4]
    tid2=start(a,vid,start_odometer=10001,participant_ids=ids[:2]).json()['id']
    a.post(f'/api/trips/{tid2}/finish',json={'end_odometer':10001.1})
    data=a.get(f'/api/vehicles/{vid}').json()
    assert [p['cost_cents'] for p in data['trips'][0]['participants']]==[1,0]
    assert sum(o['fuel_cents'] for o in data['owners'])==13
    assert a.patch(f'/api/records/trips/{tid}',json={'deleted':True}).status_code==200
    assert sum(o['fuel_cents'] for o in a.get(f'/api/vehicles/{vid}').json()['owners'])==1
    a.patch(f'/api/records/trips/{tid}',json={'deleted':False})
    assert sum(o['fuel_cents'] for o in a.get(f'/api/vehicles/{vid}').json()['owners'])==13


def test_participants_validate_members_and_preserve_driver_default():
    a=client(); vid=vehicle(a); b=client('Outside')
    uid=a.get('/api/me').json()['user']['id']; other=b.get('/api/me').json()['user']['id']
    for ids in ([],[other],[uid,other]):
        assert start(a,vid,participant_ids=ids).status_code==400
        assert not a.get(f'/api/vehicles/{vid}').json()['trips']
    tid=start(a,vid).json()['id']
    a.post(f'/api/trips/{tid}/finish',json={'end_odometer':10030})
    with main.db() as c:
        c.execute('DELETE FROM trip_participants WHERE trip_id=?',(tid,))
    data=a.get(f'/api/vehicles/{vid}').json()
    assert data['owners'][0]['fuel_cents']==360
    assert data['trips'][0]['participants'][0]['user_id']==uid


def test_past_trip_splits_selected_owners_only():
    from datetime import datetime,timedelta,timezone
    a=client();vid=vehicle(a); b=client('Bea');join(b,a,vid)
    ids=[o['id'] for o in a.get(f'/api/vehicles/{vid}').json()['owners']]
    end=datetime.now(timezone.utc)-timedelta(days=1)
    r=a.post(f'/api/vehicles/{vid}/trips/manual',json={
        'origin':'Home','destination':'Office','purpose':'Personal',
        'start_odometer':9970,'end_odometer':10000,'participant_ids':ids,
        'started_at':(end-timedelta(hours=1)).isoformat(),'ended_at':end.isoformat()})
    assert r.status_code==200,r.text
    data=b.get(f'/api/vehicles/{vid}').json()
    assert [o['fuel_cents'] for o in data['owners']]==[180,180]
    assert data['trips'][0]['origin']=='Private location'
    assert len(data['trips'][0]['participants'])==2


def test_trip_can_charge_only_other_riders():
    a=client(); vid=vehicle(a); b=client('Bea'); join(b,a,vid)
    uid=a.get('/api/me').json()['user']['id']; bid=b.get('/api/me').json()['user']['id']
    r=start(a,vid,participant_ids=[bid],sharing=True)
    assert r.status_code==200,r.text
    tid=r.json()['id']
    t=a.get(f'/api/vehicles/{vid}').json()['trips'][0]
    assert not t['sharing']
    assert a.patch(f'/api/trips/{tid}/privacy',json={'sharing':True}).status_code==400
    assert a.post(f'/api/trips/{tid}/finish',json={'end_odometer':10030}).status_code==200
    d=a.get(f'/api/vehicles/{vid}').json()
    assert {o['id']:o['fuel_cents'] for o in d['owners']}=={uid:0,bid:360}
    assert [p['user_id'] for p in d['trips'][0]['participants']]==[bid]


def test_expense_can_credit_another_owner_with_minimal_fields():
    owner=client();vid=vehicle(owner);sam=client('Sam');join(sam,owner,vid)
    sid=sam.get('/api/me').json()['user']['id']
    outsider=client('Outsider');oid=outsider.get('/api/me').json()['user']['id']
    assert owner.post(f'/api/vehicles/{vid}/expenses',json={'payer_id':sid,'amount':25}).status_code==200
    d=owner.get(f'/api/vehicles/{vid}').json()
    assert d['expenses'][0]['user_id']==sid
    assert next(o for o in d['owners'] if o['id']==sid)['paid_cents']==2500
    assert owner.post(f'/api/vehicles/{vid}/expenses',json={'payer_id':oid,'amount':25}).status_code==404


def test_record_payment_between_other_owners():
    a=client();vid=vehicle(a);b=client('Beth');c=client('Chris');join(b,a,vid);join(c,a,vid)
    bid=b.get('/api/me').json()['user']['id'];cid=c.get('/api/me').json()['user']['id']
    body={'payer_id':bid,'recipient_id':cid,'amount':'12.34'}
    assert a.post(f'/api/vehicles/{vid}/payments',json=body).status_code==200
    d=a.get(f'/api/vehicles/{vid}').json()
    assert d['payments'][0]['user_id']==bid
    assert next(o for o in d['owners'] if o['id']==bid)['sent_cents']==1234
    assert next(o for o in d['owners'] if o['id']==cid)['received_cents']==1234
    assert a.post(f'/api/vehicles/{vid}/payments',json={**body,'recipient_id':bid}).status_code==400
    outsider=client('Outside');oid=outsider.get('/api/me').json()['user']['id']
    assert a.post(f'/api/vehicles/{vid}/payments',json={**body,'payer_id':oid}).status_code==404
    assert outsider.post(f'/api/vehicles/{vid}/payments',json=body).status_code==404
