const fs=require('fs'),path=require('path');const dir='/home/user/nudist/public/js';
const lucide=new Set(fs.readdirSync('node_modules/lucide-static/icons').map(f=>f.replace('.svg','')));
const cur=fs.readFileSync(dir+'/icons.js','utf8');const have=Object.keys(JSON.parse(cur.slice(cur.indexOf('=')+1).replace(/;\s*$/,'')));
const names=new Set(have);const extra=process.argv.slice(2);extra.forEach(n=>names.add(n));
for(const f of fs.readdirSync(dir)){if(f==='icons.js'||f==='emoji-data.js')continue;const s=fs.readFileSync(path.join(dir,f),'utf8');
 for(const m of s.matchAll(/['"]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['"]/g))if(lucide.has(m[1]))names.add(m[1]);}
const out={};const miss=[];
for(const n of [...names].sort()){try{let s=fs.readFileSync('node_modules/lucide-static/icons/'+n+'.svg','utf8');s=s.replace(/<!--[\s\S]*?-->/g,'').replace(/<svg[^>]*>/,'').replace('</svg>','').replace(/\s*\n\s*/g,'').trim();out[n]=s;}catch(e){miss.push(n)}}
fs.writeFileSync(dir+'/icons.js','// Сгенерировано из lucide-static (ISC License, https://lucide.dev)\nexport const ICONS='+JSON.stringify(out)+';\n');
console.log('icons',Object.keys(out).length,'missing',miss,'size',JSON.stringify(out).length);
