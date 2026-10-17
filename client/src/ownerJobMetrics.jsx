import React from 'react';
import {Button} from './ui.jsx';
import {go} from './api.js';
const shown=(metric,suffix='',signed=false)=>metric.value===null?'Not available':(signed&&Number(metric.value)>0?'+':'')+(suffix==='%'?'':'$')+metric.value+suffix;
const coverage=(metric,jobs)=>metric.count+' of '+jobs+' jobs';
export function OwnerJobMetrics({groups}) {
 if(!Array.isArray(groups))return null;
 return <section aria-label="Quote accuracy and job costs"><h3>Quote accuracy and job costs</h3>
  <p>Owner only. Active quotes created in the selected period, including later invoices and costs. Original-scope invoice = final invoice minus approved change orders. Accuracy compares that amount with the saved customer range and middle for the accepted option. Percent gaps are the mean of each job’s gap divided by its own quote middle. A positive signed gap means the invoice was higher.</p>
  <p>Each figure includes only jobs with its required numbers; blank values are never zero. Currencies, price units and tax treatment stay separate. Cost comparisons use original quoted owner-cost lines against full actual costs, including changes. Selling prices are excluded from estimated costs. Realized margin = (full final invoice − actual labor cost − actual material cost) / full final invoice; it is the mean of eligible job margins, before other expenses.</p>
  {!groups.length&&<p>No jobs in this period.</p>}
  {groups.map((group,index)=><section key={index}><h4>{group.service} · {group.currency||'Currency not recorded'} · {group.priceUnit}</h4><p>{group.taxTreatment} · {group.jobs} jobs</p>
    <div style={{overflowX:'auto'}}><table><caption>Accuracy and realized margin</caption><thead><tr><th>Figure</th><th>Value</th><th>Jobs covered</th></tr></thead><tbody>
      <tr><th>Invoices inside quoted range</th><td>{group.insideRange.percent===null?'Not available':group.insideRange.inside+' / '+group.insideRange.count+' ('+group.insideRange.percent+'%)'}</td><td>{coverage(group.insideRange,group.jobs)}</td></tr>
      {[['signedGap','Average signed gap','$',true],['signedGapPercent','Average signed gap (%)','%',true],['absoluteGap','Average absolute gap','$'],['absoluteGapPercent','Average absolute gap (%)','%'],['realizedMargin','Average realized margin','%']].map(([key,label,suffix,signed])=><tr key={key}><th>{label}</th><td>{shown(group[key],suffix==='%'?'%':'',signed)}</td><td>{coverage(group[key],group.jobs)}</td></tr>)}
    </tbody></table></div>
    <div style={{overflowX:'auto'}}><table><caption>Estimated and actual costs</caption><thead><tr><th>Cost</th><th>Original estimate</th><th>Actual, including changes</th><th>Actual minus estimate</th><th>Jobs covered</th></tr></thead><tbody>{[['labor','Labor'],['material','Materials']].map(([key,label])=><tr key={key}><th>{label}</th>{['estimated','actual','gap'].map(field=><td key={field}>{group[key][field]===null?'Not available':'$'+group[key][field]}</td>)}<td>{coverage(group[key],group.jobs)}</td></tr>)}</tbody></table></div>
    <p>Average actual labor hours: {group.actualLaborHours.value??'Not available'} · {coverage(group.actualLaborHours,group.jobs)}</p>
    <details><summary>Original-scope invoices by job</summary>{group.records.map(record=><p key={record.id}><Button variant="quiet" onClick={()=>go('/quotes?record='+encodeURIComponent(record.id))}>Open job</Button> Original-scope invoice: {record.originalScopeInvoice===null?'Not available':'$'+record.originalScopeInvoice} · Approved changes: {record.approvedChanges===null?'Not available':'$'+record.approvedChanges} · Inside range: {record.inRange===null?'Not available':record.inRange?'Yes':'No'}</p>)}</details>
  </section>)}
 </section>;
}
