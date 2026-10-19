// Audits unchanged individual passing names and complete gate summaries.
// Nested TAP subtests restart their numbering; names and summary totals are
// authoritative. The one masked synthetic URL additionally checks adjacency.
export function auditHostedParserLogs(raw, required, additional, punctuation, retained, mapping) {
  const lines=raw.split("\n").map(s=>s.replace(/\uFEFF/g,"").replace(/^\d{4}-\d{2}-\d{2}T\S+\s/,"").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,"").replace(/\r$/,""));
  const problems=[];
  function segment(command) {
    const hits=lines.map((s,i)=>s===`##[group]Run ${command}`?i:-1).filter(i=>i>=0);
    if(hits.length!==1){problems.push({type:"command_occurrences",command,actual:hits.length});return [];}
    const a=hits[0],b=lines.findIndex((s,i)=>i>a&&s.startsWith("##[group]Run "));
    return lines.slice(a,b<0?undefined:b);
  }
  const commands={strict:"npm run test:quote",full:"npm test",browser:"node --test test/ownerAlertRepair20261006.browser.spec.mjs test/ownerAlertsDelivery20261006.browser.spec.mjs test/ownerDashboard20261007.browser.spec.mjs"};
  const gates={}, privateGates={};
  for(const [gate,command] of Object.entries(commands)) {
    const seg=segment(command),summary={},summaryOccurrences={},records=[];
    for (const s of seg) {
      let m=s.match(/^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\s+([0-9.]+)$/);
      if(m){summary[m[1]]=Number(m[2]);summaryOccurrences[m[1]]=(summaryOccurrences[m[1]]||0)+1;}
      m=s.match(/^\s*ok (\d+) - (.*)$/);
      if(m)records.push({number:Number(m[1]),name:m[2]});
    }
    const byName=new Map();
    records.forEach((r,i)=>{if(!byName.has(r.name))byName.set(r.name,[]);byName.get(r.name).push({number:r.number,index:i});});
    const errors=seg.filter(s=>/^\s*not ok \d+|^##\[error\]/.test(s));
    if(errors.length)problems.push({type:"gate_errors",gate,errors});
    for(const key of ["tests","suites","pass","fail","cancelled","skipped","todo","duration_ms"])
      if(summaryOccurrences[key]!==1)problems.push({type:"summary_occurrences",gate,key,actual:summaryOccurrences[key]||0});
    for(const key of ["fail","cancelled","skipped","todo"])
      if(summary[key]!==0)problems.push({type:"nonzero_gate_summary",gate,key,value:summary[key]});
    if(summary.tests!==records.length||summary.pass!==summary.tests)problems.push({type:"passing_total_mismatch",gate,summary,records:records.length});
    gates[gate]={summary,passing_records:records.length,errors,receipt:seg.filter(s=>s.startsWith("PASS: quote engine and price book gate"))};
    privateGates[gate]={records,byName};
  }
  const mappings=[];
  function occurrences(name,gate) {
    const {records,byName}=privateGates[gate];
    const literal=byName.get(name)||[];
    if(literal.length||name!==mapping.source_name)return {observed_name:name,numbers:literal.map(r=>r.number),literal:true};
    const masked=byName.get(mapping.hosted_name)||[];
    if(masked.length!==1)return {observed_name:name,numbers:[],literal:false,mapping_error:"masked record count "+masked.length};
    const r=masked[0],previous=records[r.index-1],next=records[r.index+1];
    if(previous?.name!==mapping.previous_name||next?.name!==mapping.next_name||previous.number+1!==r.number||r.number+1!==next.number)
      return {observed_name:mapping.hosted_name,numbers:[],literal:false,mapping_error:"adjacent source order not confirmed"};
    if(!mappings.some(m=>m.gate===gate))
      mappings.push({gate,source_name:name,observed_name:mapping.hosted_name,passing_records:[previous,records[r.index],next]});
    return {observed_name:mapping.hosted_name,numbers:[r.number],literal:false};
  }
  const groups={};
  function group(key,names,expectations) {
    if(new Set(names).size!==names.length)problems.push({type:"duplicate_expected_names",group:key});
    const rows=names.map(name=>{
      const observed={};
      for(const [gate,expected] of Object.entries(expectations)){
        const result=occurrences(name,gate);
        observed[gate]={expected,...result};
        if(result.numbers.length!==expected)problems.push({type:"name_occurrences",group:key,source_name:name,gate,expected,...result});
      }
      return {source_name:name,gates:observed};
    });
    groups[key]={required:names.length,expectations,rows,passed:rows.every(r=>Object.values(r.gates).every(g=>g.numbers.length===g.expected))};
  }
  for(const key of ["geometry_boundaries","geometry_delivery","geometry_historical","f16","a3_rendered","a2_editor","separate_line_controls"])
    group(key,required[key],{strict:1,full:1});
  if(required.pi00)group("pi00",required.pi00,{strict:1,full:1});
  group("f18",required.f18,{strict:0,full:1});
  group("parser_import_full",required.parser_import_full,{full:1});
  group("incoming_voice_full_only",required.incoming_voice_full_only,{strict:0,full:1});
  group("punctuation_116",punctuation,{strict:0,full:1});
  group("retained_parser_import_758",retained,{full:1});
  group("combined_f16",additional.combined_f16,{strict:1,full:1});
  group("compatibility",additional.compatibility,{full:1});
  group("zero_controls",additional.zero_controls,{strict:1,full:1});
  if(additional.activation_neighbors)group("activation_neighbors",additional.activation_neighbors,{full:1});
  const allErrors=lines.filter(s=>s.startsWith("##[error]"));
  if(allErrors.length)problems.push({type:"workflow_errors",errors:allErrors});
  const audit=segment("npm audit --omit=dev --audit-level=high").filter(s=>/^found \d+ vulnerabilities/.test(s));
  if(audit.length!==1||audit[0]!=="found 0 vulnerabilities")problems.push({type:"dependency_audit",lines:audit});
  const checker=lines.filter(s=>/^Known failures still failing:/.test(s));
  if(!checker.length||checker.some(s=>s!=="Known failures still failing: 0/0"))problems.push({type:"known_failure_checker",lines:checker});
  return {gates,groups,hosted_name_mappings:mappings,dependency_audit:audit,checker,problems,passed:problems.length===0};
}
