const fs = require('node:fs')

const files = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : [
      'vendor/qianshan-runtime/renderer/dist/assets/index-BponW6ps.js',
      'legacy-renderer/assets/index-BponW6ps.js',
    ]

const patches = [
  {
    name: 'topic radar state cache',
    marker: 'yx.cache.topic',
    old: 'function Zwe(){const e=mi(),t=nr(H=>H.setTopic),[n,r]=c.useState("weibo"),[o,a]=c.useState([]),[i,l]=c.useState(0),[s,u]=c.useState(1),d=20,[f,m]=c.useState([]),[p,v]=c.useState([]),[y,g]=c.useState(!1),[h,b]=c.useState(!1),[S,w]=c.useState(!1),[C,$]=c.useState(!1),[E,P]=c.useState(null),[O,j]=c.useState(null),[I,T]=c.useState(!1),[N,M]=c.useState(),[R,_]=c.useState(),[k,A]=c.useState("heat"),[D,z]=c.useState(!1),B=c.useRef(0);c.useEffect(()=>{L()},[]);',
    next: 'function Zwe(){const e=mi(),t=nr(H=>H.setTopic),Yx=(()=>{try{return JSON.parse(localStorage.getItem("yx.cache.topic")||"{}")||{}}catch{return{}}})(),[n,r]=c.useState(Yx.platform||"weibo"),[o,a]=c.useState([]),[i,l]=c.useState(0),[s,u]=c.useState(1),d=20,[f,m]=c.useState([]),[p,v]=c.useState([]),[y,g]=c.useState(!1),[h,b]=c.useState(!1),[S,w]=c.useState(!1),[C,$]=c.useState(!1),[E,P]=c.useState(null),[O,j]=c.useState(null),[I,T]=c.useState(!1),[N,M]=c.useState(Yx.trend),[R,_]=c.useState(Yx.source),[k,A]=c.useState(Yx.sort||"heat"),[D,z]=c.useState(!!Yx.pinnedOnly),B=c.useRef(0);c.useEffect(()=>{try{localStorage.setItem("yx.cache.topic",JSON.stringify({platform:n,trend:N,source:R,sort:k,pinnedOnly:D,updatedAt:Date.now()}))}catch{}},[n,N,R,k,D]);c.useEffect(()=>{L()},[]);',
  },
  {
    name: 'copywriting generate cache boot',
    marker: 'yx.cache.copywriting.gen',
    old: 'function a$e({onDone:e}){const t=mi(),n=nr(C=>C.topic),r=nr(C=>C.consumeTopic),o=nr(C=>C.setCopywriting),[a]=mt.useForm(),[i,l]=c.useState(!1),[s,u]=c.useState(""),[d,f]=c.useState(0),[m,p]=c.useState(""),[v,y]=c.useState(null),[g,h]=c.useState([]),[b,S]=c.useState(null);c.useEffect(()=>{Je.get("/style/presets",{params:{module:"copywriting"}}).then(C=>{var $;h((($=C.data)==null?void 0:$.data)||[])}),n&&(S(n),a.setFieldsValue({topic:n.keyword,platform:n.platform}),r())},[]);',
    next: 'function a$e({onDone:e}){const t=mi(),n=nr(C=>C.topic),r=nr(C=>C.consumeTopic),o=nr(C=>C.setCopywriting),[a]=mt.useForm(),Yx=(()=>{try{return JSON.parse(localStorage.getItem("yx.cache.copywriting.gen")||"{}")||{}}catch{return{}}})(),[i,l]=c.useState(!1),[s,u]=c.useState(""),[d,f]=c.useState(0),[m,p]=c.useState(""),[v,y]=c.useState(null),[g,h]=c.useState([]),[b,S]=c.useState(null);c.useEffect(()=>{Je.get("/style/presets",{params:{module:"copywriting"}}).then(C=>{var $;h((($=C.data)==null?void 0:$.data)||[])}),Yx.fields&&a.setFieldsValue(Yx.fields),n&&(S(n),a.setFieldsValue({topic:n.keyword,platform:n.platform}),r())},[]);',
  },
  {
    name: 'copywriting generate cache change',
    marker: 'onValuesChange:()=>{try{localStorage.setItem("yx.cache.copywriting.gen"',
    old: 'x.jsxs(mt,{form:a,layout:"vertical",initialValues:{platform:"douyin"},disabled:i,children:',
    next: 'x.jsxs(mt,{form:a,layout:"vertical",initialValues:{platform:"douyin"},disabled:i,onValuesChange:()=>{try{localStorage.setItem("yx.cache.copywriting.gen",JSON.stringify({fields:a.getFieldsValue(),updatedAt:Date.now()}))}catch{}},children:',
  },
  {
    name: 'copywriting rewrite cache boot',
    marker: 'yx.cache.copywriting.rewrite',
    old: 'function i$e({onDone:e}){const t=mi(),n=nr(C=>C.textSource),r=nr(C=>C.consumeTextSource),o=nr(C=>C.setCopywriting),[a]=mt.useForm(),[i,l]=c.useState(!1),[s,u]=c.useState(""),[d,f]=c.useState(0),[m,p]=c.useState(""),[v,y]=c.useState(null),[g,h]=c.useState([]),[b,S]=c.useState(null);c.useEffect(()=>{if(Je.get("/style/presets",{params:{module:"copywriting"}}).then(C=>{var $;h((($=C.data)==null?void 0:$.data)||[])}),n){const C=n;S({sourceCopywritingId:C.sourceCopywritingId,sourceTitle:C.sourceTitle}),a.setFieldsValue({sourceText:C.sourceText,platform:C.platform||"douyin",mode:"rewrite"}),r()}},[]);',
    next: 'function i$e({onDone:e}){const t=mi(),n=nr(C=>C.textSource),r=nr(C=>C.consumeTextSource),o=nr(C=>C.setCopywriting),[a]=mt.useForm(),Yx=(()=>{try{return JSON.parse(localStorage.getItem("yx.cache.copywriting.rewrite")||"{}")||{}}catch{return{}}})(),[i,l]=c.useState(!1),[s,u]=c.useState(""),[d,f]=c.useState(0),[m,p]=c.useState(""),[v,y]=c.useState(null),[g,h]=c.useState([]),[b,S]=c.useState(null);c.useEffect(()=>{if(Je.get("/style/presets",{params:{module:"copywriting"}}).then(C=>{var $;h((($=C.data)==null?void 0:$.data)||[])}),Yx.fields&&a.setFieldsValue(Yx.fields),n){const C=n;S({sourceCopywritingId:C.sourceCopywritingId,sourceTitle:C.sourceTitle}),a.setFieldsValue({sourceText:C.sourceText,platform:C.platform||"douyin",mode:"rewrite"}),r()}},[]);',
  },
  {
    name: 'copywriting rewrite cache change',
    marker: 'onValuesChange:()=>{try{localStorage.setItem("yx.cache.copywriting.rewrite"',
    old: 'x.jsxs(mt,{form:a,layout:"vertical",initialValues:{platform:"douyin",mode:"polish"},disabled:i,children:',
    next: 'x.jsxs(mt,{form:a,layout:"vertical",initialValues:{platform:"douyin",mode:"polish"},disabled:i,onValuesChange:()=>{try{localStorage.setItem("yx.cache.copywriting.rewrite",JSON.stringify({fields:a.getFieldsValue(),updatedAt:Date.now()}))}catch{}},children:',
  },
]

for (const file of files) {
  let source = fs.readFileSync(file, 'utf8')
  for (const patch of patches) {
    if (source.includes(patch.marker)) {
      console.log(`already patched ${patch.name} in ${file}`)
      continue
    }
    if (!source.includes(patch.old)) {
      throw new Error(`${patch.name} snippet not found in ${file}`)
    }
    source = source.replace(patch.old, patch.next)
    console.log(`patched ${patch.name} in ${file}`)
  }
  fs.writeFileSync(file, source)
}
