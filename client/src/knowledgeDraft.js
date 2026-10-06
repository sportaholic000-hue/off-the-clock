// Drafts stay in editor state. Preserve owner edits and existing saved prices;
// only the normal Review and save action writes the resulting form.
export function applyKnowledgeDraft(form,draft){
  if(draft.websiteImport){
    const existing=String(form.prices||'').trim();
    const additions=draft.websiteImport.entries.map(entry=>entry.excerpt).filter(excerpt=>!existing.split('\n\n').includes(excerpt));
    const prices=[existing,...additions].filter(Boolean).join('\n\n');
    if(prices.length>20000)throw new Error('These website prices do not fit beside the current prices. Shorten Your prices, then request the draft again.');
    return {...form,prices};
  }
  return {...form,...draft,neverSay:(draft.neverSay||[]).join('\n')};
}
