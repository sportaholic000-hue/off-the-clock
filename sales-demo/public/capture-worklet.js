// PCM conversion is capture only. No audio file/recording is created.
// Integrating source samples over each output interval handles 44.1/48 kHz
// input without relabeling its rate or losing phase across render blocks.
// Integer interval units prevent 44.1 kHz fractional-phase rounding drift.
class CapturePCM extends AudioWorkletProcessor {
  constructor(){super();this.span=sampleRate;this.remaining=this.span;this.sum=0;this.buffer=new Int16Array(1600);this.used=0;}
  process(inputs,outputs){
    for(const channel of outputs[0]||[])channel.fill(0); // No microphone monitoring/feedback.
    const input=inputs[0]?.[0];if(!input)return true;
    for(const raw of input){
      let left=16000;const value=Math.max(-1,Math.min(1,Number.isFinite(raw)?raw:0));
      while(left>0){const take=Math.min(left,this.remaining);this.sum+=value*take;this.remaining-=take;left-=take;
        if(this.remaining===0){const x=Math.max(-1,Math.min(1,this.sum/this.span));this.buffer[this.used++]=Math.round(x*(x<0?32768:32767));this.sum=0;this.remaining=this.span;
          if(this.used===this.buffer.length){const bytes=new ArrayBuffer(this.buffer.length*2),view=new DataView(bytes);for(let i=0;i<this.buffer.length;i++)view.setInt16(i*2,this.buffer[i],true);this.port.postMessage(bytes,[bytes]);this.used=0;}
        }
      }
    }
    return true;
  }
}
registerProcessor('otc-capture',CapturePCM);
