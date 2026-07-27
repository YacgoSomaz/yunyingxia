import { app, BrowserWindow, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { AccountHttpError, hasActiveAccess, type AccountService } from './account-service'

let activeWindow: BrowserWindow | null = null
let handlerRegistered = false
let activeService: AccountService | null = null
let activeWindowAuthenticated = false

const HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src file:">
<title>登录运营虾</title>
<style>
:root{color-scheme:dark;--ink:#eaf6ff;--muted:#aec6dc;--line:rgba(126,201,244,.3);--panel:rgba(5,18,47,.84);--field:rgba(14,36,78,.82);--teal:#1fc5bd;--teal-hover:#37d6cd;--danger:#ffd0d0;--ok:#c9ffeb}*{box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden}body{margin:0;background:#06132c;color:var(--ink);font:14px/1.5 "Segoe UI","Microsoft YaHei",sans-serif}.activation-shell{position:relative;display:grid;place-items:center;width:100%;height:100%;padding:28px;overflow:hidden;background:#06132c}.activation-background{position:absolute;z-index:0;inset:0;width:100%;height:100%;object-fit:cover;opacity:.76}.activation-scrim{position:absolute;z-index:1;inset:0;background:rgba(3,12,36,.42)}.account-card{position:relative;z-index:2;width:min(100%,460px);padding:32px 34px;border:1px solid var(--line);border-radius:14px;background:var(--panel);box-shadow:0 26px 72px rgba(0,0,0,.44);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}.account-card h1{margin:0;color:#7ee8f5;font-size:31px;line-height:1.2;letter-spacing:3px}.subtitle{margin:9px 0 23px;color:var(--muted);font-size:14px;line-height:1.65}.account-status{display:inline-flex;align-items:center;min-height:26px;margin:0 0 14px;padding:3px 9px;border:1px solid rgba(174,198,220,.3);border-radius:6px;background:rgba(7,24,56,.48);color:#d7e9f8;font-size:12px}.login-form{display:grid;gap:14px}.field{display:grid;gap:7px;color:#d6e9fb;font-size:13px;font-weight:650}.field input{width:100%;height:42px;padding:0 12px;border:1px solid rgba(100,181,246,.4);border-radius:8px;background:var(--field);color:#fff;font:14px "Segoe UI","Microsoft YaHei",sans-serif;outline:none}.field input::placeholder{color:#8198b5}.field input:focus{border-color:#35d9e5;box-shadow:0 0 0 3px rgba(53,217,229,.16)}.phone-row{display:grid;grid-template-columns:minmax(0,1fr) 112px;gap:10px;align-items:end}.phone-row button{height:42px}.account-card button{border:0;border-radius:8px;color:#062039;background:var(--teal);font:700 14px "Segoe UI","Microsoft YaHei",sans-serif;white-space:nowrap;cursor:pointer;transition:background .16s ease,transform .16s ease}.account-card button:hover:not(:disabled){background:var(--teal-hover)}.account-card button:active:not(:disabled){transform:translateY(1px)}.account-card button:disabled{opacity:.55;cursor:not-allowed}.account-card button.primary{width:100%;height:44px;margin-top:6px}.account-card button.secondary{height:42px;margin-top:10px;border:1px solid rgba(174,198,220,.35);background:rgba(112,135,174,.24);color:#e4f1fc}.account-card button.secondary:hover:not(:disabled){background:rgba(132,158,200,.36)}.form-status{min-height:22px;margin:13px 0 0;color:var(--danger);font-size:13px}.form-status.is-ok{color:var(--ok)}.account-info{margin-top:16px;padding:14px;border:1px solid rgba(174,198,220,.24);border-radius:10px;background:rgba(6,20,48,.7);color:#d9ebfb;font-size:13px;line-height:1.7}.account-info p{margin:0}.plans{display:grid;gap:8px;margin-top:12px}.plan{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 11px;border:1px solid rgba(174,198,220,.24);border-radius:8px;background:rgba(18,40,79,.55)}.plan strong{display:block;font-size:13px}.plan .muted{color:var(--muted);font-size:12px}.price{color:#8af1ed;font-weight:750}@media(max-width:540px){.activation-shell{padding:16px}.account-card{padding:27px 22px}.phone-row{grid-template-columns:minmax(0,1fr) 104px}.account-card h1{font-size:28px}}
</style>
</head>
<body>
<main class="activation-shell" aria-label="运营虾账号登录">
  <img class="activation-background" src="__BACKGROUND_IMAGE_URL__" alt="">
  <div class="activation-scrim"></div>
  <section class="account-card">
    <h1>运营虾</h1>
    <p class="subtitle">手机号登录后进入工作台。运营虾会员可解锁创作、发布与自动化功能。</p>
    <div class="account-status" id="accountState">未登录</div>
    <div id="login" class="login-form">
      <div class="phone-row"><label class="field"><span>手机号</span><input id="phone" autocomplete="tel" inputmode="numeric" placeholder="请输入 11 位手机号"></label><button id="send" type="button">发送验证码</button></div>
      <label class="field"><span>短信验证码</span><input id="code" autocomplete="one-time-code" inputmode="numeric" placeholder="请输入验证码"></label>
      <button id="loginBtn" class="primary" type="button">登录</button>
    </div>
    <div id="member" class="account-info" style="display:none"><p id="memberText"></p><button id="recharge" class="primary" type="button">去官网充值续费</button><button id="refresh" class="secondary" type="button">我已支付，刷新权益</button><button id="logout" class="secondary" type="button">退出当前账号</button><div class="plans" id="plans"></div></div>
    <div class="form-status" id="status" role="status"></div>
  </section>
</main>
<script>
const $=id=>document.getElementById(id);
function money(cents){return '¥'+(Number(cents||0)/100).toFixed(2)}
function setStatus(text,ok=false){$('status').className=ok?'form-status is-ok':'form-status';$('status').textContent=text||''}
function operationProduct(state){return (state&&Array.isArray(state.products)?state.products:[]).find(item=>item.product_id==='operation_shrimp')||null}
function active(state){const product=operationProduct(state);const signedUntil=Number(state&&state.signedUntil);if(!product||!Number.isSafeInteger(signedUntil)||signedUntil<=Math.floor(Date.now()/1000))return false;const exp=Date.parse(product.expires_at||'');return product.status==='active'&&Number.isFinite(exp)&&exp>Date.now()&&Array.isArray(product.entitlements)&&product.entitlements.includes('operation_course')}
function levelName(level){return ({free:'普通用户',monthly:'月度会员',quarterly:'季度会员',yearly:'年度会员',paid:'付费会员'}[level]||level||'普通用户')}
function featureText(features){return Array.isArray(features)&&features.length?features.join('、'):'暂无'}
function addText(parent,tag,className,text){const el=document.createElement(tag);if(className)el.className=className;el.textContent=text;parent.appendChild(el);return el}
function showPlans(plans){$('plans').textContent='';for(const plan of plans||[]){const el=document.createElement('div');el.className='plan';const left=document.createElement('div');addText(left,'strong','',String(plan.name||plan.id));addText(left,'span','muted',String(plan.durationDays||0)+' 天');const right=document.createElement('div');addText(right,'div','price',money(plan.amountCents));el.appendChild(left);el.appendChild(right);$('plans').appendChild(el)}}
function closeWhenEntitled(){setTimeout(()=>window.close(),250)}
function showMember(state,plans,entitled=false){$('login').style.display='none';$('member').style.display='block';const user=state&&state.user;const product=operationProduct(state);const productText=product?('运营虾：'+product.status+'；到期：'+(product.expires_at||'未开通')):'运营虾尚未开通';$('accountState').textContent=entitled?'运营虾会员有效':(product&&product.status==='active'?'运营虾会员待刷新':(user?levelName(user.member_level):'未登录'));$('memberText').textContent=user?('当前账号：'+user.phone+'；'+productText+'；权益：'+featureText(product&&product.entitlements)):'请先登录。';showPlans(plans);if(user&&entitled){setStatus('会员状态有效，正在进入工作台…',true);closeWhenEntitled();return}setStatus(user?'当前账号未开通运营虾或权益签名已过期，请刷新权益。':'请先登录。')}
async function refresh(){const res=await window.electronAPI.account.me();const plans=await window.electronAPI.account.plans();if(res.state){showMember(res.state,plans.plans,res.entitled===true);if(res.entitled===true)return true}return false}
async function boot(){try{await refresh()}catch{}}
$('send').onclick=async()=>{setStatus('正在发送验证码…');$('send').disabled=true;try{const r=await window.electronAPI.account.sendCode($('phone').value);if(!r.ok)throw new Error(r.error||'发送失败');setStatus(r.message||'验证码已发送',true)}catch(e){setStatus(e.message||'发送失败')}finally{setTimeout(()=>$('send').disabled=false,5000)}};
$('loginBtn').onclick=async()=>{setStatus('正在登录…');try{const r=await window.electronAPI.account.login($('phone').value,$('code').value);if(!r.ok)throw new Error(r.error||'登录失败');if(r.entitled){setStatus('会员状态有效，正在进入工作台…',true);closeWhenEntitled();return}showMember(r.state,r.plans,false);setStatus('登录成功，请到网页充值续费运营虾后刷新状态。')}catch(e){setStatus(e.message||'登录失败')}};
$('logout').onclick=async()=>{await window.electronAPI.account.logout();location.reload()};
$('recharge').onclick=async()=>{const r=await window.electronAPI.account.openRechargePortal();if(!r.ok)setStatus(r.error||'打开充值网页失败');else setStatus('已打开充值网页，完成续费后请刷新状态。',true)};
$('refresh').onclick=async()=>{setStatus('正在刷新账号状态…');try{if(await refresh())return;setStatus('暂未检测到有效会员，请确认支付已完成。')}catch(e){setStatus(e.message||'刷新失败')}};
boot();
</script>
</body>
</html>`

function appIconPath(): string | undefined {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const candidates = [
    path.join(__dirname, '..', '..', 'resources', iconName),
    path.join(__dirname, '..', '..', 'resources', 'icon.png'),
    path.join(process.resourcesPath || '', iconName),
    path.join(process.resourcesPath || '', 'icon.png'),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate))
}

function loginBackgroundUrl(): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'resources', 'operation-login-bg.png'),
    path.join(process.resourcesPath || '', 'operation-login-bg.png'),
  ]
  const background = candidates.find((candidate) => fs.existsSync(candidate))
  return background ? pathToFileURL(background).toString() : ''
}

function loginPagePath(): string {
  const runtimeDir = path.join(app.getPath('userData'), 'runtime')
  fs.mkdirSync(runtimeDir, { recursive: true })
  return path.join(runtimeDir, 'operation-account-login.html')
}

function registerAccountHandlers(): void {
  if (handlerRegistered) return
  ipcMain.handle('account:me', async () => {
    try {
      const state = await activeService?.ensureSession() ?? null
      const entitled = hasActiveAccess(state)
      if (entitled) activeWindowAuthenticated = true
      return { ok: true, state: activeService?.publicView(state) ?? null, entitled }
    } catch (error) {
      if (error instanceof AccountHttpError && error.authoritative) {
        return { ok: false, error: error.message || '账号状态已失效' }
      }
      const state = activeService?.currentState() ?? null
      if (state) return { ok: true, state: activeService?.publicView(state) ?? null, entitled: hasActiveAccess(state), stale: true }
      return { ok: false, error: error instanceof Error ? error.message : '账号状态读取失败' }
    }
  })
  ipcMain.handle('account:plans', async () => {
    try {
      return { ok: true, plans: await activeService?.plans() ?? [] }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '套餐读取失败', plans: [] }
    }
  })
  ipcMain.handle('account:sendCode', async (_event, phone: unknown) => {
    try {
      return await activeService?.sendCode(phone) ?? { ok: false, error: '账号服务未初始化' }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '验证码发送失败' }
    }
  })
  ipcMain.handle('account:login', async (_event, phone: unknown, code: unknown) => {
    try {
      const state = await activeService?.login(phone, code) ?? null
      if (state) {
        activeWindowAuthenticated = true
        activeWindow?.close()
      }
      return { ok: true, state: activeService?.publicView(state), entitled: hasActiveAccess(state), plans: await activeService?.plans() ?? [] }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '登录失败' }
    }
  })
  ipcMain.handle('account:logout', async (event) => {
    await activeService?.logout()
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    if (senderWindow && senderWindow !== activeWindow) {
      app.relaunch()
      app.exit(0)
    }
    return { ok: true }
  })
  ipcMain.handle('account:openRechargePortal', async () => {
    try {
      const url = await activeService?.createWebHandoff()
      if (!url) throw new Error('账号服务未初始化')
      await shell.openExternal(url)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '打开充值网页失败' }
    }
  })
  handlerRegistered = true
}

export function registerAccountService(service: AccountService): void {
  activeService = service
  registerAccountHandlers()
}

export function showAccountWindow(preloadPath: string, service: AccountService): Promise<boolean> {
  registerAccountService(service)
  activeWindowAuthenticated = false
  return new Promise((resolve) => {
    let finished = false
    const finish = (result: boolean) => {
      if (finished) return
      finished = true
      activeWindow = null
      resolve(result)
    }

    activeWindow = new BrowserWindow({
    width: 900,
    height: 650,
      resizable: false,
      autoHideMenuBar: true,
      title: '登录运营虾',
      icon: appIconPath(),
      webPreferences: { preload: path.resolve(preloadPath), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: false },
  })
  activeWindow.on('closed', () => finish(activeWindowAuthenticated))
  const loginHtml = HTML.replace('__BACKGROUND_IMAGE_URL__', loginBackgroundUrl())
  const pagePath = loginPagePath()
  fs.writeFileSync(pagePath, loginHtml, 'utf8')
  void activeWindow.loadFile(pagePath)
  })
}
