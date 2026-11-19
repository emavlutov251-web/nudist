const fs=require('fs');
const d=require('emojibase-data/ru/compact.json');
const groups={};
for(const e of d){ if(e.group===undefined||e.group===2) continue; (groups[e.group]=groups[e.group]||[]).push([e.unicode,e.label,(e.tags||[]).join(' ')].join('|')); }
const order=[0,1,3,4,5,6,7,8,9];
fs.writeFileSync(require('path').join(__dirname, '..', 'public', 'js', 'emoji-data.js'),'// Сгенерировано из emojibase-data (MIT License)\nexport const EMOJI='+JSON.stringify(order.map(g=>groups[g]))+';\n');
console.log(fs.statSync(require('path').join(__dirname, '..', 'public', 'js', 'emoji-data.js')).size);
