const escape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function installQuoteEmailRoutes(app,{service}){
  const budgets=new Map();
  function limit(req,res,next){
    const now=Date.now();for(const [key,b] of budgets)if(b.until<=now)budgets.delete(key);
    const key=req.ip,prior=budgets.get(key);
    if(!prior&&budgets.size>=10000||prior&&prior.count>=60)return res.status(429).set('Retry-After','60').send('Please try again later.');
    if(prior)prior.count++;else budgets.set(key,{until:now+60000,count:1});return next();
  }
  app.get('/quote-copy/:ownerId/:token',limit, (req,res)=>{
    res.set({'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow',
      'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});
    let quote;try{quote=service.publicQuote(req.params.ownerId,req.params.token);}catch{return res.status(404).type('text/plain').send('This quote link is unavailable or has expired.');}
    return res.type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your saved quote</title><body style="max-width:52rem;margin:3rem auto;padding:0 1rem;font-family:system-ui;line-height:1.6"><h1>'+escape(quote.businessName)+'</h1><h2>Your saved quote</h2><div style="white-space:pre-wrap;overflow-wrap:anywhere">'+escape(quote.narration)+'</div></body></html>');
  });
}
