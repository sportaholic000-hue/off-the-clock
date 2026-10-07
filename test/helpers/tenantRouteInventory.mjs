import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Review source declarations too: a new feature flag must not hide an
// untested route simply because the current fixture did not enable that flag.
const declaresRoute=/\b(?:app|router|httpServer)\s*(?:\.\s*(?:get|post|put|patch|delete|options|head|all|use|on)\s*\(|\[\s*method\s*\])|\.\s*(?:get|post|put|patch|delete|options|head|all|use)\s*\(\s*['"`]\//;
export function routeSourceInventory(root) {
  const result=[];
  function visit(directory) {
    for(const entry of readdirSync(directory,{withFileTypes:true})) {
      if(['node_modules','dist','data'].includes(entry.name))continue;
      const file=path.join(directory,entry.name);
      if(entry.isDirectory())visit(file);
      else if(/\.[cm]?js$/.test(entry.name)) {
        const source=readFileSync(file,'utf8');
        if(declaresRoute.test(source))result.push({file:path.relative(root,file).split(path.sep).join('/'),sha256:createHash('sha256').update(source).digest('hex')});
      }
    }
  }
  visit(root);return result.sort((a,b)=>a.file.localeCompare(b.file));
}
