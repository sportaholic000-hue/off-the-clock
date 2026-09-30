import React,{useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CustomerQuote} from './quotedone.jsx';
import {WidgetBooking} from './widgetBooking.jsx';
import {createWidgetRequest,widgetBranding} from './widgetTransport.js';
import styles from './widget.css?inline';

class WidgetBoundary extends React.Component {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="widget-recovery" role="alert"><h2>The form could not be displayed.</h2><p>Close and reopen the page to try again. A submitted request can be retried without creating a duplicate.</p></div>:this.props.children;}
}
function App({publicKey,origin,onBranding}) {
  const [catalog,setCatalog]=useState(null);
  const request=useMemo(()=>createWidgetRequest(origin),[origin]);
  const branding=widgetBranding(catalog?.branding);
  const cachePrefix='otc-widget:'+origin+':'+publicKey+':';
  function received(value){setCatalog(value);onBranding?.(widgetBranding(value.branding));}
  const rgb=branding.accentColor.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  const luminance=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  return <div className="widget-content" style={{'--accent':branding.accentColor,'--accent-ink':luminance>.179?'#000':'#fff'}}>
    <WidgetBoundary><CustomerQuote publicKey={publicKey} request={request} progressive cachePrefix={cachePrefix} persistResult onCatalog={received}
      renderNextSteps={(result,props)=><WidgetBooking key={result.quoteId} {...props} branding={branding} cachePrefix={cachePrefix}/>}/>
    </WidgetBoundary>
  </div>;
}
export function mountWidget(container,options) {
  const style=document.createElement('style');style.textContent=styles;container.before(style);
  const root=createRoot(container);root.render(<App {...options}/>);
  return ()=>{root.unmount();style.remove();};
}
