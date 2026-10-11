// Called under the same volume lock as backup publication and tenant erasure.
// Keep only the verified, redacted current object. Objects already hidden by a
// delete marker need no current recovery copy, but still need a full purge.
export async function eraseOldObjectVersions(store,key){
  const head=await store.head(key),keep=head?.VersionId;
  if(head&&(typeof keep!=='string'||!keep))throw Error('OFFSITE_VERSION_CURRENT_UNKNOWN');
  const versions=(await store.listVersions(key)).filter(v=>v.key===key);
  if(head&&!versions.some(v=>v.versionId===keep&&v.isLatest&&!v.deleteMarker))throw Error('OFFSITE_VERSION_CURRENT_CHANGED');
  // Remove data versions before markers, and the current marker last, so a
  // failed purge cannot uncover an old private object as the current object.
  const obsolete=versions.filter(v=>v.versionId!==keep||v.deleteMarker)
    .sort((a,b)=>Number(a.deleteMarker)-Number(b.deleteMarker)||Number(a.isLatest)-Number(b.isLatest));
  for(const version of obsolete)await store.removeVersion(key,version.versionId);
  const remaining=(await store.listVersions(key)).filter(v=>v.key===key);
  if(remaining.length!==(head?1:0)||remaining.some(v=>v.versionId!==keep||v.deleteMarker||!v.isLatest))throw Error('OFFSITE_VERSION_ERASURE_UNVERIFIED');
  const current=await store.head(key);
  if(head?current?.VersionId!==keep:current!==null)throw Error('OFFSITE_VERSION_CURRENT_CHANGED');
}
