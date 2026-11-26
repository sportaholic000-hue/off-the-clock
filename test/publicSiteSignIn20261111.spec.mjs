import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readdirSync,readFileSync,statSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {extname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Every public page (site/www) has a "Sign in" link to the app's sign-in page
// in its header, beside "Start free". It is a plain link, quieter than the
// green "Start free" button, which stays the only green button in the header.
// On a phone it is visible in the header without opening the menu or scrolling.
const WWW=fileURLToPath(new URL('../site/www/',import.meta.url));
const LOGIN='https://app.offtheclockai.com/login';
const SIGNUP='https://app.offtheclockai.com/signup';

function pages(dir=WWW){
  return readdirSync(dir).flatMap(name=>{
    const path=join(dir,name);
    if(statSync(path).isDirectory())return name==='vendor'||name==='assets'?[]:pages(path);
    return name==='index.html'?[path]:[];
  });
}
const route=file=>'/'+relative(WWW,file).replace(/index\.html$/,'');
// The page header: the generated <header class="site-header">, the hand-written
// <header> on privacy and terms, or the homepage's top <nav>.
function headerOf(html){
  const match=html.match(/<header[\s\S]*?<\/header>/)||html.match(/<nav[^>]*position:sticky[\s\S]*?<\/nav>/)||html.match(/<body[^>]*>\s*<nav[\s\S]*?<\/nav>/);
  return match?.[0]??'';
}
const anchors=fragment=>[...fragment.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([,attributes,text])=>({attributes,text:text.replace(/<[^>]+>/g,'').trim(),href:attributes.match(/href="([^"]*)"/)?.[1]}));

test('every public page carries the header sign-in link',()=>{
  const all=pages();
  assert.equal(all.length,63,'60 generated pages, the homepage, privacy and terms');
  const missing=[];
  for(const file of all){
    const html=readFileSync(file,'utf8'),header=headerOf(html);
    assert.ok(header,route(file)+': header found');
    const signIn=anchors(header).filter(a=>a.href===LOGIN);
    if(!signIn.length){missing.push(route(file));continue;}
    for(const link of signIn){
      assert.equal(link.text,'Sign in',route(file));
      assert.doesNotMatch(link.attributes,/class="[^"]*\bbtn\b/,route(file)+': not a button');
      assert.doesNotMatch(link.attributes,/background/,route(file)+': no fill');
    }
    // Beside Start free: where the header has a Start free button, Sign in sits right before it.
    const list=anchors(header);
    const button=list.findIndex(a=>a.href===SIGNUP&&/^Start free/.test(a.text));
    if(button>=0)assert.equal(list[button-1]?.href,LOGIN,route(file)+': Sign in sits beside Start free');
  }
  assert.deepEqual(missing,[],'pages without a header Sign in link');
});

test('the generator and the shared style sheet keep the sign-in link',()=>{
  const layout=readFileSync(fileURLToPath(new URL('../site/build/layout.mjs',import.meta.url)),'utf8');
  assert.match(layout,/export const LOGIN = 'https:\/\/app\.offtheclockai\.com\/login';/);
  assert.equal(layout.split('<a class="signin" href="${LOGIN}">Sign in</a>').length-1,2,'desktop nav and phone header');
  const css=readFileSync(join(WWW,'assets/site.css'),'utf8');
  assert.match(css,/\.site-header a\.signin\{color:var\(--text\)/);
  assert.doesNotMatch(css,/gradient/i);
});

// Real browser at phone and desktop width.
let browser,server,origin;
const TYPES={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain','.xml':'application/xml'};
before(async()=>{
  server=createServer((req,res)=>{
    let path=decodeURIComponent(new URL(req.url,'http://x').pathname);
    let file=resolve(WWW,'.'+path);
    if(!file.startsWith(WWW.replace(/\/$/,'')))return res.writeHead(403).end();
    if(existsSync(file)&&statSync(file).isDirectory())file=join(file,'index.html');
    if(!existsSync(file))return res.writeHead(404).end();
    res.writeHead(200,{'content-type':TYPES[extname(file)]||'application/octet-stream'}).end(readFileSync(file));
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  origin='http://127.0.0.1:'+server.address().port;
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
});
after(async()=>{await browser?.close();await new Promise(done=>server?.close(done)??done());});

const SAMPLE=['/','/pricing/','/compare/smith-ai/','/industries/roofing/','/docs/getting-started/','/missed-call-calculator/','/privacy/','/terms/'];
const VIEWPORTS=[['phone',{width:375,height:740}],['desktop',{width:1280,height:800}]];

for(const [label,viewport] of VIEWPORTS)test(`sign-in link at ${label} width: visible at the top, quieter than Start free`,async()=>{
  const context=await browser.newContext({viewport});
  // Nothing leaves the machine: only the local site is served.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,routed=>routed.abort());
  try{
    for(const path of SAMPLE){
      const page=await context.newPage();
      await page.goto(origin+path,{waitUntil:'load'});
      const link=page.locator(`a[href="${LOGIN}"]:visible`).first();
      await link.waitFor({state:'visible',timeout:10000});
      const facts=await link.evaluate((node,signup)=>{
        const box=node.getBoundingClientRect(),style=getComputedStyle(node);
        const header=node.closest('header,nav[style*="sticky"],nav')||document.body;
        const green=[...header.querySelectorAll('a')].filter(a=>{const s=getComputedStyle(a);return a.getClientRects().length&&s.backgroundColor==='rgb(0, 230, 118)';});
        return {top:box.top,bottom:box.bottom,left:box.left,right:box.right,height:box.height,text:node.textContent.trim(),
          background:style.backgroundColor,border:style.borderTopStyle,fontSize:style.fontSize,color:style.color,
          greenButtons:green.map(a=>({href:a.getAttribute('href'),text:a.textContent.trim()})),
          scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth,scrollY:window.scrollY};
      },SIGNUP);
      assert.equal(facts.text,'Sign in',path);
      assert.equal(facts.scrollY,0,path);
      assert.ok(facts.top>=0&&facts.bottom<=80,`${path}: in the top bar (${facts.top}-${facts.bottom})`);
      assert.ok(facts.left>=0&&facts.right<=viewport.width,`${path}: inside the screen`);
      assert.ok(facts.scrollWidth<=facts.innerWidth,`${path}: no sideways scroll (${facts.scrollWidth})`);
      assert.equal(facts.background,'rgba(0, 0, 0, 0)',path+': no fill');
      assert.equal(facts.border,'none',path+': no outline');
      assert.equal(facts.color,'rgb(242, 245, 242)',path+': site text color');
      // Start free stays the only green button in the header (on phone, the generated pages keep it in the menu).
      assert.ok(facts.greenButtons.every(button=>button.href===SIGNUP&&/^Start free/.test(button.text)),path+' '+JSON.stringify(facts.greenButtons));
      if(path==='/'||label==='desktop'&&!['/privacy/','/terms/'].includes(path))assert.equal(facts.greenButtons.length,1,path);
      if(label==='phone')assert.ok(facts.height>=30,`${path}: tappable height ${facts.height}`);
      await page.close();
    }
  }finally{await context.close();}
});
