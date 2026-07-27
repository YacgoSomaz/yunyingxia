const fs = require('node:fs')

const files = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : [
      'vendor/qianshan-runtime/renderer/dist/assets/index-BponW6ps.js',
      'legacy-renderer/assets/index-BponW6ps.js',
    ]

const oldSnippet = 'h=async E=>{if(i===E.id){s.pause(),l(null);return}const P=E.isOssCatalog?E.filePath:`${Ca}/video/bgm/${E.id}/play`;s.src=P;try{await s.play(),l(E.id)}catch(O){Ne.error("播放失败："+((O==null?void 0:O.message)||O))}}'

const newSnippet = 'h=async E=>{if(i===E.id){s.pause(),s.removeAttribute("src"),s.load(),l(null);return}const P=E.isOssCatalog?E.filePath:`${Ca}/video/bgm/${E.id}/play`,O=Symbol("bgm-play");s.__yxBgmPlayToken=O,s.pause(),s.currentTime=0,s.src=P,s.load();try{await new Promise((j,I)=>{const T=()=>{s.removeEventListener("canplay",T),s.removeEventListener("error",N),j()},N=()=>{s.removeEventListener("canplay",T),s.removeEventListener("error",N),I(new Error("音频加载失败"))};s.addEventListener("canplay",T,{once:!0}),s.addEventListener("error",N,{once:!0})}),s.__yxBgmPlayToken===O&&(await s.play(),l(E.id))}catch(j){if(s.__yxBgmPlayToken!==O)return;const I=(j==null?void 0:j.message)||String(j);/interrupted by a new load request|play\\(\\) request was interrupted/i.test(I)||Ne.error("播放失败："+I)}}'

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  if (source.includes('__yxBgmPlayToken')) {
    console.log(`already patched ${file}`)
    continue
  }
  if (!source.includes(oldSnippet)) {
    throw new Error(`BGM playback snippet not found in ${file}`)
  }
  fs.writeFileSync(file, source.replace(oldSnippet, newSnippet))
  console.log(`patched ${file}`)
}
