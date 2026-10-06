import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
// Execute the actual presentation components. The private preview is exported
// only in this test bundle; its source and behavior are otherwise unchanged.
export const previewExport={name:'test-preview-export',setup(builder){builder.onLoad({filter:/client\/src\/pricebook\.jsx$/},async args=>({contents:await readFile(args.path,'utf8')+'\nexport {Preview as TestPreview};',loader:'jsx'}));}};
let render;
export async function renderDisplay(surface,data){
 if(!render){
  const result=await build({bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom/server'],plugins:[previewExport],define:{'import.meta.env':'{}'},stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {CustomerMeasurements} from './client/src/quoteDoneControls.jsx';
import {QuoteResult,QuoteRecordsList} from './client/src/quotedone.jsx';
import {TestPreview} from './client/src/pricebook.jsx';
export function render(surface,data){const components={products:CustomerMeasurements,customer:QuoteResult,records:QuoteRecordsList,preview:TestPreview};return renderToStaticMarkup(React.createElement(components[surface],data));}`}});
  const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);render=module.exports.render;
 }
 return render(surface,data);
}
