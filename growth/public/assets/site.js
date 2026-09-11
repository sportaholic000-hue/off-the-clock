/* Local progressive enhancement only: no analytics, storage, API or engine. */
(function(){
  'use strict';
  const root=document.querySelector('[data-library]');
  if(!root)return;
  const search=root.querySelector('#guide-search'), cards=[...root.querySelectorAll('[data-guide]')];
  const controls=[...root.querySelectorAll('[data-filter]')], count=root.querySelector('#result-count');
  const empty=root.querySelector('#empty-results');let category='all';
  function update(){
    const query=search.value.normalize('NFKC').trim().toLocaleLowerCase();
    const terms=query.split(/\s+/).filter(Boolean);let found=0;
    for(const card of cards){
      const words=(card.dataset.search+' '+card.textContent).normalize('NFKC').toLocaleLowerCase();
      const match=(category==='all'||card.dataset.kind===category)&&terms.every(term=>words.includes(term));
      card.hidden=!match;if(match)found++;
    }
    count.textContent=found+' '+(found===1?'guide':'guides')+(query||category!=='all'?' matched':' available');
    empty.hidden=found!==0;
    for(const control of controls)control.setAttribute('aria-pressed',String(control.dataset.filter===category));
  }
  search.addEventListener('input',update);
  for(const control of controls)control.addEventListener('click',()=>{category=control.dataset.filter;update();});
  for(const button of root.querySelectorAll('[data-clear]'))button.addEventListener('click',()=>{category='all';search.value='';update();search.focus();});
  root.querySelector('[data-search-tools]').hidden=false;
  for(const el of root.querySelectorAll('[data-enhancement]'))el.hidden=false;
  update();
})();
