import { BlockList, isIP } from 'node:net';
const blocked=new BlockList();
for(const [a,p] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked.addSubnet(a,p,'ipv4');
for(const [a,p] of [['::',128],['::1',128],['64:ff9b::',96],['100::',64],['2001:db8::',32],['fc00::',7],['fe80::',10],['ff00::',8]] as const)blocked.addSubnet(a,p,'ipv6');
export type OsintTarget={type:'domain'|'ip'|'sha256';value:string};
export function isPublicAddress(v:string):boolean{const f=isIP(v);if(!f)return false;if(f===4)return !blocked.check(v,'ipv4');const x=v.toLowerCase();if(x.startsWith('::ffff:')){const m=x.slice(7);if(isIP(m)===4)return !blocked.check(m,'ipv4');}return !blocked.check(v,'ipv6');}
export function classifyOsintTarget(input:string):OsintTarget|null{
 const v=input.trim();if(/^[a-f0-9]{64}$/i.test(v))return{type:'sha256',value:v.toLowerCase()};
 const f=isIP(v);if(f)return isPublicAddress(v)?{type:'ip',value:v}:null;
 const d=v.toLowerCase().replace(/\.$/,'');
 if(d.length>253||d.length<4||d.includes('://')||/[\/@:]/.test(d)||/\.(localhost|local|internal|test|invalid|example)$/.test(d))return null;
 const labels=d.split('.');if(labels.length<2||labels.some(x=>!x||x.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x)))return null;
 return{type:'domain',value:d};
}