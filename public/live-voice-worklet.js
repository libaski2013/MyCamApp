class VoiceCapture extends AudioWorkletProcessor{
 constructor(){super();this.buffer=new Float32Array(32000);this.index=0;this.phase=0;this.sum=0;this.count=0;this.energy=0}
 process(inputs){const input=inputs[0]?.[0];if(!input)return true;
  for(let i=0;i<input.length;i++){
   this.sum+=input[i];this.count++;this.phase+=16000;
   if(this.phase>=sampleRate){this.phase-=sampleRate;const value=this.sum/this.count;this.sum=0;this.count=0;this.buffer[this.index++]=value;this.energy+=value*value;
    if(this.index===this.buffer.length){const end=currentTime+(i+1)/sampleRate;this.port.postMessage({samples:this.buffer,start:end-2,end,rms:Math.sqrt(this.energy/32000)},[this.buffer.buffer]);this.buffer=new Float32Array(32000);this.index=0;this.energy=0}
   }
  }return true;
 }
}
registerProcessor('mycam-voice-capture',VoiceCapture);
