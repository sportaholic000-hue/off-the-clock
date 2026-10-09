// Run in a separate process AFTER measurement, so parsing does not affect it.
import {readFileSync,writeFileSync} from 'node:fs';
const [beforePath,afterPath,output]=process.argv.slice(2);
if(!beforePath||!afterPath||!output)throw Error('Usage: node heap-growth.mjs <round-1.heapsnapshot> <round-5.heapsnapshot> <output.json>');
function inventory(path){
  const data=JSON.parse(readFileSync(path,'utf8')),fields=data.snapshot.meta.node_fields;
  const width=fields.length,typeAt=fields.indexOf('type'),nameAt=fields.indexOf('name'),sizeAt=fields.indexOf('self_size'),types=data.snapshot.meta.node_types[typeAt],groups=new Map();
  for(let i=0;i<data.nodes.length;i+=width){
    const type=types[data.nodes[i+typeAt]],name=data.strings[data.nodes[i+nameAt]],key=JSON.stringify([type,name]);
    const group=groups.get(key)||{type,name,count:0,selfBytes:0};group.count++;group.selfBytes+=data.nodes[i+sizeAt];groups.set(key,group);
  }
  return groups;
}
const before=inventory(beforePath),after=inventory(afterPath),growth=[];
for(const key of new Set([...before.keys(),...after.keys()])){
  const a=before.get(key)||{count:0,selfBytes:0},b=after.get(key)||{count:0,selfBytes:0},[type,name]=JSON.parse(key);
  growth.push({type,name,round1Count:a.count,round5Count:b.count,countGrowth:b.count-a.count,selfBytesGrowth:b.selfBytes-a.selfBytes});
}
const byCount=(a,b)=>b.countGrowth-a.countGrowth||b.selfBytesGrowth-a.selfBytesGrowth||a.name.localeCompare(b.name);
const result={before:beforePath,after:afterPath,method:'V8 node type object, grouped by constructor/name; count deltas, not retained-size attribution.',
  top5ObjectTypes: growth.filter(r=>r.type==='object'&&r.countGrowth>0).sort(byCount).slice(0,5),
  top5NodeGroups:growth.filter(r=>r.countGrowth>0).sort(byCount).slice(0,5),
  allObjectTypes:growth.filter(r=>r.type==='object'&&r.countGrowth!==0).sort(byCount)};
writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.top5ObjectTypes,null,2));
