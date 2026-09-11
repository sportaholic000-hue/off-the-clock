"""Editorial release checks for the existing 15-page review; no network or installs.
These assertions check specific requirements, not a persuasion score or ranking.
"""
from html.parser import HTMLParser
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public'

class Copy(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.skip = 0
        self.words = []
        self.links = []
        self.anchor = None
        self.feed(html)
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style'):
            self.skip += 1
        if tag == 'a':
            self.anchor = {'href': attrs.get('href', ''), 'text': ''}
    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip = max(0, self.skip - 1)
        if tag == 'a' and self.anchor is not None:
            self.links.append(self.anchor)
            self.anchor = None
    def handle_data(self, text):
        if not self.skip:
            self.words.append(text)
            if self.anchor is not None:
                self.anchor['text'] += text
    @property
    def text(self):
        return ' '.join(' '.join(self.words).split())


def main():
    manifest = json.loads((OUT / 'page-manifest.json').read_text())
    results = []
    def require(name, ok):
        results.append({'name': name, 'pass': bool(ok)})
        if not ok:
            raise AssertionError(name)
    rejected = ['Stay with the native HCP option', 'Jobber Receptionist is a sensible baseline',
                'Choose a narrower product', 'Choose the native agent when',
                'Put my job to the test', 'Publication is pending', 'Test a real job']
    try:
        require('Existing scope: exactly 15 pages and 12 guides', len(manifest['pages']) == 15 and len(manifest['guides']) == 12)
        for path in manifest['pages']:
            copy = Copy((OUT / path).read_text())
            require(path + ': no rejected recommendation or misleading action',
                    all(term.casefold() not in copy.text.casefold() for term in rejected))
            links = [a for a in copy.links if a['href'].endswith('growth-v2.html#challenge')]
            require(path + ': challenge actions say brief', bool(links) and all('brief' in a['text'].lower() for a in links))
        for guide in manifest['guides']:
            text = Copy((OUT / guide['path']).read_text()).text
            require(guide['path'] + ': Off The Clock named in opening recommendation',
                    'Off The Clock' in text[:1800])
            require(guide['path'] + ': complete QuoteDone price and allowance visible',
                    all(value in text for value in ['$279', '1,200', '$0.35']) and 'no setup fee' in text.lower())
        articles = []
        catalog = json.loads((ROOT / 'competitors/content.json').read_text())
        for group in ['alternatives', 'comparisons']:
            articles += [json.loads((ROOT / 'competitors' / p).read_text()) for p in catalog[group]]
        require('All ten structured articles have distinct developed sections',
                all(len(a.get('sections', [])) >= 2 for a in articles))
        require('All ten structured articles have unique card descriptions',
                len({a['card_description'] for a in articles}) == 10)
        require('No article body is replaced by a vendor-test checklist',
                all('scenario' not in a and 'questions' not in a for a in articles))
        require('Sameday package differences calculated independently',
                (449 - 279, 789 - 279, 1200 - 500, 1200 - 1000) == (170, 510, 700, 200))
        require('QuoteDone markup and intake implementation are not edited by editorial builder',
                '82c65a675d896339f47da2082a9d11dbaf79056c37dd917e296622c2c5dd3b79' in (ROOT / 'build_public.py').read_text())
    finally:
        report = {'checks': len(results), 'passed': sum(r['pass'] for r in results),
                  'failed': sum(not r['pass'] for r in results), 'results': results,
                  'limits': 'Checks specific copy, destinations and numbers. Not a conversion, ranking or universal product-accuracy claim.'}
        directory = ROOT / 'evidence/editorial-completion'
        directory.mkdir(parents=True, exist_ok=True)
        (directory / 'editorial-checks.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({k: report[k] for k in ['checks', 'passed', 'failed']}, indent=2))

if __name__ == '__main__':
    main()
