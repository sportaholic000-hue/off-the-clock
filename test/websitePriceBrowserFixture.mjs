import {build} from 'esbuild';

export async function buildKnowledgeScreen(){
  const result=await build({
    stdin:{loader:'jsx',resolveDir:process.cwd(),contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {KnowledgeStep} from './client/src/onboarding.jsx';const root=createRoot(document.getElementById('root'));window.mount=state=>root.render(<KnowledgeStep state={state} refresh={async()=>{window.refreshes++}} back={()=>{}} next={()=>{window.saved=true}}/>);window.refreshes=0;"},
    outdir:'test-artifacts/website-browser',bundle:true,write:false,format:'iife',platform:'browser',
    define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},logLevel:'silent'
  });
  return {script:result.outputFiles.find(file=>file.path.endsWith('.js')).text,
    styles:result.outputFiles.filter(file=>file.path.endsWith('.css')).map(file=>file.text).join('\n')};
}
