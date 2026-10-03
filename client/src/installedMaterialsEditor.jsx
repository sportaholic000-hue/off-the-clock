import React from 'react';
import {installedPriceDefinitions} from '../../server/installedPriceConfiguration.js';
import {servicePricing,editServiceField} from './pricebookEditing.js';
import {Field} from './ui.jsx';
import {ExactNumericInput} from './pricebookInputs.jsx';
export function InstalledMaterialsEditor({service,onChange}) {
 const p=servicePricing(service),definitions=installedPriceDefinitions(service.serviceType,p);
 if(!Object.keys(definitions).length)return null;
 return <section className="editor-section"><h3>Labor and materials in installed prices</h3><p>Labor adjustments affect only the labor portion. Installed prices with no labor portion entered carry no peak surcharge; quoting continues. Enter a labor portion to apply the surcharge to that part of the installed price. Terrain, height and stories adjustments still require a labor portion when they apply. Materials-only tax affects only the material portion. These percentages stay private. Enter 0 for a portion that is absent; the total cannot exceed 100%.</p>
 {Object.entries(definitions).map(([path,label])=><div key={path}><h4>{label}</h4>{[['installedLaborPercent','Labor portion'],['installedMaterialsPercent','Materials share']].map(([field,title])=><Field key={field} label={title+' (%)'}><ExactNumericInput aria-label={title+' (%) for '+label} value={p[field]?.[path]} onChange={value=>{const next={...p[field]};if(value===undefined)delete next[path];else next[path]=value;onChange(editServiceField(service,field,next));}}/></Field>)}</div>)}
 </section>;
}
