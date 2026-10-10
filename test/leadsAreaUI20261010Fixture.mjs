import {build} from 'esbuild';

export async function buildScreens(){
  const result=await build({stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {KnowledgeStep} from './client/src/onboarding.jsx';
    import {BookingRequirements} from './client/src/calendar.jsx';
    import {LeadLinks} from './client/src/leadLinks.jsx';
    const root=createRoot(document.getElementById('root'));
    function MountedKnowledge({state,version}){React.useEffect(()=>{window.readyMountNumber=version;},[version]);return <KnowledgeStep state={state} refresh={async()=>{}} back={()=>{}} next={()=>{window.saved=true}}/>;}
    window.mountKnowledge=state=>{const version=++window.mountNumber;root.render(<MountedKnowledge key={version} version={version} state={state}/>);};
    window.mountRequirements=configuration=>root.render(<BookingRequirements configuration={configuration}/>);
    window.mountLinks=row=>root.render(<LeadLinks row={row}/>);
    window.mountNumber=0;window.saved=false;window.unmount=()=>root.unmount();
  `},outdir:'test-artifacts/leads-area-ui',bundle:true,write:false,format:'iife',platform:'browser',
    define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},logLevel:'silent'});
  return {script:result.outputFiles.find(f=>f.path.endsWith('.js')).text,styles:result.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n')};
}
export const EXPECTED_AREA={mode:'cities',cities:[{city:'Halifax',region:'NS',country:'CA'}]};
// Handwritten: three global missing requirements and one per-service duration;
// once ready, NONE of those four messages remains. The setup link goes to step 5.
export const missingConfiguration={services:[{serviceId:'SYNTHETIC',name:'Synthetic visit',blockers:[{code:'SERVICE_DURATION_INVALID',message:'Choose a valid service duration.'}]}],
  directBooking:{ready:false,globalBlockers:[{code:'BOOKING_SETTINGS_MISSING',message:'Save booking hours and scheduling rules.'},{code:'CALENDAR_NOT_CONNECTED',message:'Connect a destination calendar.'}],releaseBlockers:[{code:'SERVICE_AREA_MISSING',message:'Configure a structured service area before direct booking.'}]}};
