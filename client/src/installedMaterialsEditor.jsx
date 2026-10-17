import React from 'react';
import {installedPriceDefinitions,repairOrDeckInstalled,installedMaterialsShare} from '../../server/installedPriceConfiguration.js';
import {servicePricing,editServiceField} from './pricebookEditing.js';
import {Field} from './ui.jsx';
import {ExactNumericInput} from './pricebookInputs.jsx';
export function InstalledMaterialsEditor({service,onChange}) {
 const p=servicePricing(service),definitions=installedPriceDefinitions(service.serviceType,p);
 if(!Object.keys(definitions).length)return null;
 return <section className="editor-section"><h3>Labor and materials in installed prices</h3><p>Labor adjustments affect only the labor portion. Installed prices with no labor portion entered carry no peak surcharge; quoting continues. Enter a labor portion to apply the surcharge to that part of the installed price. Terrain, height and stories adjustments still require a labor portion when they apply. Materials-only tax affects only the material portion. These percentages stay private. Enter 0 for a portion that is absent; the total cannot exceed 100%.</p>
 {Object.entries(definitions).map(([path,label])=><div key={path}><h4>{label}</h4>{repairOrDeckInstalled(service.serviceType,path,p)&&<p>Enter the labor portion for this installed price. The remaining percentage is material.</p>}{[['installedLaborPercent','Labor portion'],['installedMaterialsPercent','Materials share']].map(([field,title])=>field==='installedMaterialsPercent'&&repairOrDeckInstalled(service.serviceType,path,p)?<p key={field}>Materials share: {p.installedLaborPercent?.[path]===undefined?'calculated after the labor portion is entered':installedMaterialsShare(service.serviceType,p,path)+'%'}</p>:<Field key={field} label={title+' (%)'}><ExactNumericInput aria-label={title+' (%) for '+label} value={p[field]?.[path]} onChange={value=>{const next={...p[field]};if(value===undefined)delete next[path];else next[path]=value;let updated=editServiceField(service,field,next);if(field==='installedLaborPercent'&&repairOrDeckInstalled(service.serviceType,path,p)){const materials={...p.installedMaterialsPercent};delete materials[path];updated=editServiceField(updated,'installedMaterialsPercent',Object.keys(materials).length?materials:undefined);}onChange(updated);}}/></Field>)}</div>)}
 </section>;
}
