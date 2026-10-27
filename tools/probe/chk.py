import json
for f in ['g.json','t.json']:
    j=json.load(open(f)); r=j['reports']
    print(f, 'reports', len(r), 'hidden', len(j.get('hidden',[])), 'has reviewed field', all('reviewed' in x for x in r), 'reviewed true', sum(1 for x in r if x.get('reviewed')), 'reporter_says field', all('reporter_says' in x for x in r))
