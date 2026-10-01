import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';

// Synthetic localhost-only certificate generated in memory for each test run.
// No saved private key, external account credential, or extra dependency.
export function syntheticLocalTls() {
  const pair=generateKeyPairSync('rsa',{modulusLength:2048});
  function der(tag,...parts) {
    const body=Buffer.concat(parts),size=body.length;let length;
    if(size<128)length=Buffer.from([size]);
    else {const hex=size.toString(16).padStart(Math.ceil(size.toString(16).length/2)*2,'0');
      const bytes=Buffer.from(hex,'hex');length=Buffer.concat([Buffer.from([0x80|bytes.length]),bytes]);}
    return Buffer.concat([Buffer.from([tag]),length,body]);
  }
  const seq=(...parts)=>der(0x30,...parts);
  const algorithm=seq(Buffer.from('06092a864886f70d01010b','hex'),der(0x05));
  const name=seq(der(0x31,seq(Buffer.from('0603550403','hex'),der(0x0c,Buffer.from('localhost')))));
  const validity=seq(der(0x17,Buffer.from('200101000000Z')),der(0x18,Buffer.from('20990101000000Z')));
  const san=seq(Buffer.from('0603551d11','hex'),der(0x04,
    seq(der(0x82,Buffer.from('localhost')),der(0x87,Buffer.from([127,0,0,1])))));
  const basic=seq(Buffer.from('0603551d13','hex'),der(0x01,Buffer.from([0xff])),
    der(0x04,seq(der(0x01,Buffer.from([0xff])))));
  const serialValue=randomBytes(16);serialValue[0]|=0x80;
  const serial=der(0x02,Buffer.concat([Buffer.from([0]),serialValue]));
  const tbs=seq(der(0xa0,der(0x02,Buffer.from([2]))),serial,algorithm,name,validity,name,
    pair.publicKey.export({type:'spki',format:'der'}),der(0xa3,seq(san,basic)));
  const certificate=seq(tbs,algorithm,der(0x03,Buffer.concat([Buffer.from([0]),sign('sha256',tbs,pair.privateKey)])));
  const cert='-----BEGIN CERTIFICATE-----\n'+certificate.toString('base64').match(/.{1,64}/g).join('\n')+'\n-----END CERTIFICATE-----\n';
  return {cert,key:pair.privateKey.export({type:'pkcs8',format:'pem'})};
}
