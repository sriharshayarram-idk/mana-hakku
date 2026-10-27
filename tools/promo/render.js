// Renders promo.html frame by frame (deterministic) and pipes JPEG frames into ffmpeg.
const {chromium}=require('playwright');const {spawn}=require('child_process');const path=require('path');
const [,,dir,out,fpsArg,onlyStills]=process.argv;const FPS=+fpsArg||30;
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1080,height:1920}});
 await pg.goto('file://'+path.resolve(dir,'promo.html'));await pg.evaluate(()=>window.ready);
 const T=await pg.evaluate(()=>window.TOTAL);
 if(onlyStills){for(const t of onlyStills.split(',').map(Number)){await pg.evaluate(x=>setT(x),t);await pg.screenshot({path:`${out}-${t}.png`})}await b.close();return}
 const ff=spawn('ffmpeg',['-y','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-r',String(FPS),out],{stdio:['pipe','inherit','inherit']});
 const N=Math.round(T*FPS);for(let i=0;i<N;i++){await pg.evaluate(x=>setT(x),i/FPS);const buf=await pg.screenshot({type:'jpeg',quality:90});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));if(i%150===0)console.log('frame',i,'/',N)}
 ff.stdin.end();await new Promise(r=>ff.on('close',r));await b.close();console.log('video ok')})();
