export function encodeWav(samples){
 const buffer=new ArrayBuffer(44+samples.length*2),v=new DataView(buffer);const text=(offset,s)=>{for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i))};
 text(0,'RIFF');v.setUint32(4,buffer.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),true);return buffer;
}
export function frameIndex(elapsed,duration,count){return Math.max(0,Math.min(count-1,Math.floor(Math.max(0,elapsed)/duration*count)))}
