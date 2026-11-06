"""Verify probe receipts and emit a compact summary (no game launch)."""
from pathlib import Path
import json, statistics, collections, argparse
parser = argparse.ArgumentParser()
parser.add_argument('--improved', type=Path, help='Optional receipt for the adaptive multi-page scheduler')
args = parser.parse_args()
base = Path('logs/registry-timeline')
a = json.loads((base/'baseline.json').read_text(encoding='utf-8'))
b = json.loads((base/'reopen-and-demand.json').read_text(encoding='utf-8'))
checks = []
def check(ok, text):
    assert ok, text
    checks.append(text)
for label,d in [('baseline',a),('repeat',b)]:
    check(d['status']=='PASSED' and d['page_errors']==0, label+': successful execution, zero page errors')
    p=[e for e in d['events'] if e['type']=='push']
    check(max(collections.Counter(e['tick'] for e in p).values())==1,label+': at most one pushed page per tick')
check(b['warmup']['generation']==b['final_performance']['generation'], 'repeat: warmup generation reused')
check(sum(s['rows'] for s in b['sources'])==5209,'all 16 sources: 5209 rows')
check(len(b['sources'])==16 and all(s['cpu_ms']>0 for s in b['sources']),'all sources timed including hasNext')
def segment(d,lo,hi,page):
    p=[e for e in d['events'] if e['type']=='push' and lo<e['t_ms']<hi]
    check([e['key'] for e in p]==[e['key'] for e in page['pages']], 'page receipt keys match host FIFO')
    times=[e['ms'] for e in page['pages']]
    return dict(pages=len(p),utf8_bytes=sum(e['bytes'] for e in p),host_span_ms=p[-1]['t_ms']-p[0]['t_ms'],page_span_ms=page['pages'][-1]['t']-page['pages'][0]['t'],ingest_sum_ms=sum(times),ingest_p50_ms=statistics.median(times),ingest_p95_ms=sorted(times)[int(.95*(len(times)-1))],ingest_max_ms=max(times),fire=page['fire'],drawTabBody=len(page['draws']))
summary={'baseline':segment(a,0,1e9,a['boot']), 'cold_repeat':segment(b,0,60000,b['boot']), 'reopen':segment(b,65000,1e9,b['reopen']), 'warmup':b['warmup'], 'sources':b['sources'],'dequeues':sum(e['type']=='dequeue' for e in a['events']+b['events']),'checks':checks}
(base/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS timeline receipt review: '+str(len(checks))+' consistency checks; logs/registry-timeline/summary.json')

if args.improved:
    d = json.loads(args.improved.read_text(encoding='utf-8'))
    check(d['status']=='PASSED' and d['page_errors']==0 and d['first_page_errors']==0, 'improved: zero page errors')
    events = d['events']
    pushes = [e for e in events if e['type']=='push']
    check(all(e['chars']<=24000 for e in pushes), 'improved: all envelopes within 24000 UTF-16 chars')
    per_tick = collections.Counter(e['tick'] for e in pushes)
    check(2<=max(per_tick.values())<=8, 'improved: multiple pages per tick, hard cap 8')
    tick_starts = collections.defaultdict(list)
    for e in pushes: tick_starts[e['tick']].append(e['t_ms'])
    max_start_span = max(max(times)-min(times) for times in tick_starts.values())
    check(max_start_span<=2.0, 'improved: no later page begins beyond the 2ms window')
    check(len(d['sources'])==16 and sum(s['rows'] for s in d['sources'])==5209, 'improved: all 16 sources / 5209 rows captured')
    check(d['warmup']['generation']==d['final_performance']['generation'], 'improved: reopen reuses generation')
    cursors = {}
    for e in pushes:
        if 'rows' not in e: continue
        key = (e['key'], e['generation'], e.get('id'), e.get('field'))
        if e['offset']==0: cursors[key] = 0
        check(e['offset']==cursors.get(key), 'improved: contiguous offsets '+str(key))
        cursors[key] += e['rows']
        if e['done']: check(cursors[key]==e['total'], 'improved: complete total '+str(key))
    def event_time(kind): return next(e['t_ms'] for e in events if e['type']==kind)
    cold_end, reopen_start = event_time('interaction_world'), event_time('reopen')
    cold = segment(d, 0, cold_end, d['boot'])
    reopened = segment(d, reopen_start, 1e9, d['reopen'])
    cold['open_to_last_ms'] = max(e['t_ms'] for e in pushes if e['t_ms']<cold_end)-event_time('open')
    reopened['open_to_last_ms'] = pushes[-1]['t_ms']-reopen_start
    latencies = []
    for req in [e for e in events if e['type']=='request']:
        value = json.loads(req['value'])
        matching = [e for e in pushes if e['t_ms']>=req['t_ms'] and e['key']=='registry.'+value['name'] and e['t_ms']<(reopen_start if req['t_ms']<reopen_start else 1e9) and ('id' not in value or e.get('id')==value['id'])]
        if matching:
            latencies.append(dict(name=value['name'], id=value.get('id'), request_ms=req['t_ms'], first_ms=matching[0]['t_ms']-req['t_ms'], complete_ms=next((e['t_ms']-req['t_ms'] for e in matching if e.get('done')),None)))
    enum_responses = [e for e in pushes if e['t_ms']<cold_end and e['key'].startswith('registry.enum:')]
    bulk_end = max(e['t_ms'] for e in pushes if e['t_ms']<cold_end and e['key'] in ('registry.items','registry.sounds','registry.blocks'))
    check(len(enum_responses)==7 and all(e['t_ms']<bulk_end for e in enum_responses), 'improved: seven enums preempt initial bulk pages')
    result = dict(cold=cold, reopen=reopened, demand_latencies=latencies, final_performance=d['final_performance'], max_pages_per_tick=max(per_tick.values()), max_page_start_span_ms=max_start_span, max_chars=max(e['chars'] for e in pushes), checks=len(checks))
    dest = args.improved.parent/'summary.json'
    dest.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('PASS improved timeline receipt review; '+str(dest))
