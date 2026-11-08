import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
await mkdir('public',{recursive:true});const html=await readFile('src/index.html','utf8');const body=html.split('<body>')[1].split('</body>')[0].replace('<script type="module" src="app.js"></script>','');await writeFile('app/page-markup.ts','export const markup = '+JSON.stringify(body)+';\n');for(const f of ['app.js','core.js','style.css'])await copyFile('src/'+f,'public/'+f);await copyFile('lib/review.js','public/review.js');let review=await readFile('public/review.js','utf8');await writeFile('public/review.js',review.replace('../src/core.js','./core.js'));

for(const file of ['archive.js','working-version.js'])await copyFile('lib/'+file,'public/'+file);

const marketing=await readFile('src/marketing.html','utf8');await writeFile('app/marketing-markup.ts','export const marketingMarkup = '+JSON.stringify(marketing)+';\n');
