/* Independent intake demonstration. These are collection prompts, not pricing
 * contracts, activation checks, measurement verification or an engine adapter. */
(function(root){
  'use strict';
  const number = (id,label,unit,extra={}) => ({id,label,unit,kind:'number',...extra});
  const text = (id,label,help) => ({id,label,help,kind:'text',unit:'as described'});
  const option = (id,label,fields=[]) => ({id,label,fields});
  const service = (name,fields,extras=[],more={}) => ({name,fields,extras,...more});
  const other = trade => service(`Another ${trade.toLowerCase()} job`,
    [text('other_measurements','What have you measured?','Name the measurement and include its units. Do not use a floor or wall area as a substitute for another measurement.')]);
  const definitions = {
    Landscaping:[
      service('Lawn mowing',[number('lawn_area','Mowable lawn area','square feet')],[option('bagging','Bagging and clipping disposal'),option('edging','Lawn edging',[number('edging_length','Length to edge','linear feet')])]),
      service('Mulch installation',[],[option('bed_prep','Bed preparation',[number('prep_area','Area requiring preparation','square feet')]),option('bed_edging','Bed edging',[number('bed_edge_length','Bed edge length','linear feet')])],{methods:[['area','Bed area + depth'],['volume','Mulch volume']],methodFields:{area:[number('bed_area','Bed area receiving mulch','square feet'),number('mulch_depth','Mulch depth','inches')],volume:[number('mulch_volume','Mulch volume','cubic yards')]}}),
      other('Landscaping')
    ],
    Roofing:[
      service('Roof replacement',[number('roof_area','Measured roof surface area','square feet',{help:'Roof surface area—not the floor area of the home.'})],[option('tearoff','Existing roof removal',[number('roof_layers','Existing roof layers','layers',{integer:true})]),option('decking','Decking replacement',[number('decking_sheets','Decking sheets to replace','sheets',{integer:true})])]),
      service('Roof repair',[number('roof_affected_area','Affected roof area','square feet')],[option('leak','An active leak needs attention'),option('roof_materials','Replacement materials needed')]),
      other('Roofing')
    ],
    Painting:[
      service('Interior painting',[number('wall_area','Paintable wall area','square feet',{help:'Measured wall area—not floor area or room count.'}),number('wall_coats','Wall finish coats','coats',{integer:true})],[option('ceilings','Ceilings',[number('ceiling_area','Ceiling area','square feet'),number('ceiling_coats','Ceiling finish coats','coats',{integer:true})]),option('trim','Trim',[number('trim_length','Trim length','linear feet')])]),
      service('Exterior painting',[number('exterior_area','Paintable exterior wall area','square feet',{help:'Measured paintable area—not the home’s floor area.'}),number('exterior_coats','Finish coats','coats',{integer:true})],[option('exterior_prep','Surface preparation'),option('exterior_trim','Exterior trim',[number('exterior_trim_length','Trim length','linear feet')])]),
      other('Painting')
    ],
    Flooring:[
      service('Flooring installation',[number('floor_area','Flooring installation area','square feet')],[option('floor_removal','Existing floor removal',[number('floor_removal_area','Existing floor removal area','square feet')]),option('stairs','Stairs',[number('stair_count','Stair steps','steps',{integer:true})])]),
      service('Flooring replacement',[number('floor_area','New flooring area','square feet')],[option('floor_removal','Existing floor removal',[number('floor_removal_area','Existing floor removal area','square feet')]),option('subfloor','Subfloor repair',[number('subfloor_area','Subfloor repair area','square feet')])]),
      other('Flooring')
    ],
    Fencing:[
      service('Fence installation',[number('fence_length','Fence-line length, including any gate openings','linear feet'),number('fence_height','Fence height','feet')],[option('gates','Gates',[number('gate_count','Number of gates','gates',{integer:true}),number('gate_width','Combined gate-opening width','linear feet')]),option('old_fence','Existing fence removal',[number('old_fence_length','Length of existing fence to remove','linear feet')])]),
      service('Fence replacement',[number('fence_length','New fence-line length, including any gate openings','linear feet'),number('fence_height','New fence height','feet')],[option('old_fence','Existing fence removal',[number('old_fence_length','Length to remove','linear feet')]),option('gates','Gates',[number('gate_count','Number of gates','gates',{integer:true}),number('gate_width','Combined gate-opening width','linear feet')])]),
      other('Fencing')
    ],
    Concrete:['Driveway','Patio or slab'].map(name=>service(name,[number('slab_thickness','New slab thickness','inches')],[option('demolition','Existing slab demolition',[text('existing_slab','Existing slab details','Describe its measured area, thickness and reinforcement if known. New slab dimensions are not reused for demolition.')]),option('base_prep','Base preparation')],{methods:[['rectangle','A rectangle'],['other_shape','Another shape / unsure']],methodLabel:'Shape of the new slab',methodFields:{rectangle:[number('slab_length','New slab length','feet'),number('slab_width','New slab width','feet')],other_shape:[text('slab_outline','Describe the measured shape','Include any measured segments and units. No area or perimeter is inferred.')]}})).concat([other('Concrete')]),
    Siding:[
      service('Siding replacement',[number('siding_area','Wall area receiving new siding','square feet')],[option('siding_removal','Existing siding removal',[number('siding_removal_area','Removal area','square feet'),text('existing_siding_type','Existing siding type','State the identified material or mark it unknown.')]),option('siding_trim','Trim',[number('siding_trim_length','Trim length','linear feet')])]),
      service('Siding repair',[number('siding_affected_area','Affected siding area','square feet')],[option('siding_materials','Replacement siding materials'),option('siding_repair_trim','Trim repair',[number('siding_trim_length','Trim length','linear feet')])]),
      other('Siding')
    ]
  };
  function selected(trade,name){return (definitions[trade]||[]).find(s=>s.name===name)||null;}
  function fresh(source='Social profile'){return {step:0,service:'',scope:'',extras:{},method:'',measurements:{},source};}
  function fields(trade,state){
    const s=selected(trade,state.service); if(!s)return [];
    return [...s.fields,...(s.methodFields?.[state.method]||[]),...s.extras.filter(e=>state.extras[e.id]==='yes').flatMap(e=>e.fields)];
  }
  function snapshot(trade,state,business){
    const s=selected(trade,state.service); if(!s)throw new Error('Choose a service first.');
    const extras=s.extras.map(e=>({label:e.label,answer:({yes:'Include',no:'Not requested',unsure:'Unsure — needs checking'})[state.extras[e.id]]||'Not answered'}));
    const measurements=fields(trade,state).map(f=>{
      const a=state.measurements[f.id]||{};
      return {label:f.label,unit:f.unit,status:a.unknown?'unknown':a.value?.trim()?'supplied':'not_supplied',value:a.unknown?'':(a.value||'').trim()};
    });
    const method=s.methods?.find(([id])=>id===state.method)?.[1] || (s.methods?'Not answered':null);
    const openItems=extras.filter(e=>e.answer==='Not answered'||e.answer.startsWith('Unsure')).length+measurements.filter(m=>m.status!=='supplied').length+(s.methods&&!state.method?1:0);
    return {kind:'LOCAL_INTAKE_PREVIEW_NOT_SUBMITTED',business,trade,service:state.service,source:state.source,scope:state.scope,method,extras,measurements,openItems,
      boundary:'Supplied details are not independently verified. These collection prompts do not cover every fact required to price a real job. No quote or lead was created.'};
  }
  const api=Object.freeze({definitions,selected,fresh,fields,snapshot});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OTCIntake=api;
})(typeof globalThis!=='undefined'?globalThis:this);
