import json, glob
out=['# Index of every capture (see REVIEW-KIT.md)','','Paths are relative to this folder. `full` is the whole scrolled page. A `MISS` line is a tap that found nothing for this role (the control is not there for her).','']
for d in sorted(glob.glob('shots/*/')):
    try: m=json.load(open(d+'manifest.json'))
    except Exception: continue
    out.append(f"## {d.rstrip('/')}  (persona `{m['persona']}`, tour `{m['tour']}`, scenario `{m['scen']}`)"); out.append('')
    out.append('| id | step | note | address | toast | sheet | png | full | json |'); out.append('|---|---|---|---|---|---|---|---|---|')
    for s in m['steps']:
        if 'miss' in s: out.append(f"| | MISS | `{s['miss']}` {s.get('what','')} | | | | | | |"); continue
        out.append(f"| {s['id']} | {s['step']} | {s['note']} | `{s['hash']}` | {s.get('toast','').replace('|','/')} | {'yes' if s.get('sheet') else ''} | `{d}{s['png']}` | {('`'+d+s['full']+'`') if s.get('full') else ''} | `{d}{s['json']}` |")
    out.append('')
open('INDEX.md','w').write('\n'.join(out))
print('index', len(out), 'lines')
