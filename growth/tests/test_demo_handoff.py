"""Verify safe, direct demo destinations and correct page attribution. No network."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit, parse_qs
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import buyer_guide as buyer
import build_public as base

class HandoffTests(unittest.TestCase):
    def test_unconfigured_route_preserves_comparison(self):
        with patch.object(buyer,'configured_demo',return_value=None):
            target=urlsplit(buyer.demo_destination('alternatives/ruby/index.html'))
            self.assertEqual(target.path,'demo/index.html')
            self.assertEqual(parse_qs(target.query),{'source':['alternatives/ruby/index.html']})
    def test_connected_destination_is_direct_and_preserves_existing_query(self):
        with patch.object(buyer,'configured_demo',return_value='https://demo.example/sales-demo/?voice=nova&comparison_source=old'):
            href=base.url('compare/smith-ai-vs-ruby/index.html',buyer.demo_destination('compare/smith-ai-vs-ruby/index.html'))
            self.assertEqual(urlsplit(href).netloc,'demo.example')
            self.assertEqual(urlsplit(href).path,'/sales-demo/')
            self.assertEqual(parse_qs(urlsplit(href).query),{'voice':['nova'],'comparison_source':['compare/smith-ai-vs-ruby/index.html']})
    def test_connected_href_is_escaped_for_html(self):
        with patch.object(buyer,'configured_demo',return_value='https://demo.example/?voice=nova'):
            anchor=buyer.cta('alternatives/ruby/index.html',base.url)
            self.assertIn('voice=nova&amp;comparison_source=',anchor)
            self.assertNotIn('demo/index.html',anchor)
    def test_relative_url_keeps_query_and_fragment(self):
        self.assertEqual(base.url('alternatives/ruby/index.html','demo/index.html?source=a%2Fb#demo'),'../../demo/index.html?source=a%2Fb#demo')
    def test_missing_comparison_does_not_get_generic_answers(self):
        with self.assertRaises(ValueError):buyer.buying_questions('alternatives/unknown/index.html',base.url)
    def test_source_registry_is_complete_for_buying_answers(self):
        for vendor in buyer.DATA['vendors'].values():
            self.assertEqual(set(vendor['answers']),{key for key,_ in buyer.QUESTIONS})
            for answer,*refs in vendor['answers'].values():
                self.assertTrue(answer)
                for ref in refs:self.assertIn(ref,buyer.SOURCES)
    def test_live_url_accepts_only_explicit_secure_destination(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(buyer,'ROOT',Path(temp)):
            config=Path(temp)/'demo-handoff.json'
            for bad in ['',42,'http://demo.example/','file:///tmp/demo','javascript:alert(1)','https://u:p@demo.example/','https://demo.example/#x','https://demo.example/\nnext',' https://demo.example/']:
                config.write_text(json.dumps({'url':bad}),encoding='utf-8')
                with self.subTest(url=bad),self.assertRaises(ValueError):buyer.configured_demo()
            config.write_text(json.dumps({'url':None}),encoding='utf-8');self.assertIsNone(buyer.configured_demo())
            config.write_text(json.dumps({'url':'https://demo.example/sales-demo/'}),encoding='utf-8');self.assertEqual(buyer.configured_demo(),'https://demo.example/sales-demo/')

if __name__=='__main__':unittest.main(verbosity=2)
