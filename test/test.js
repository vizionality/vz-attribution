// Run: npm i playwright && node test/test.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LIB = fs.readFileSync(path.join(__dirname, '..', 'dist', 'vz-attribution.min.js'), 'utf8');
let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? ' -> ' + JSON.stringify(detail) : '')); }
}

const PAGE = (extraHead = '', body = '') => `<!doctype html><html><head>${extraHead}</head><body>
<form id="plain">
  <input type="hidden" name="utm_source"><input type="hidden" name="utm_medium">
  <input type="hidden" name="utm_campaign"><input type="hidden" name="utm_source_1st">
  <input type="hidden" name="gclid"><input type="hidden" name="vz_anonymous_id">
  <input type="text" name="email" value="">
</form>
<form id="gf">
  <div class="gfield gfield_visibility_hidden vz-utm_source"><input type="text" name="input_3"></div>
  <div class="gfield" data-vz="utm_campaign_1st"><input type="text" name="input_4"></div>
</form>
${body}
<script>${LIB}</script>
</body></html>`;

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined })
    .catch(() => chromium.launch());

  async function newCtx(html) {
    const ctx = await browser.newContext();
    await ctx.route('**/*', r => {
      const u = new URL(r.request().url());
      if (u.hostname.endsWith('client.test')) return r.fulfill({ contentType: 'text/html', body: html(u) });
      return r.fulfill({ contentType: 'text/html', body: '<a id=go href="https://www.client.test/landing">go</a>' });
    });
    return ctx;
  }
  const val = (p, sel) => p.$eval(sel, e => e.value);
  const grab = p => p.evaluate(() => VizAttribution.grab());

  // 1. UTM landing + form fill
  console.log('UTM landing & fill');
  let ctx = await newCtx(() => PAGE());
  let p = await ctx.newPage();
  await p.goto('https://www.client.test/?utm_source=google&utm_medium=cpc&utm_campaign=brand');
  await p.evaluate(() => VizAttribution.init({ adapters: { hubspot: false } }));
  let g = await grab(p);
  check('first touch = google/cpc', g.first.utm.source === 'google' && g.first.utm.medium === 'cpc', g.first);
  check('last touch = google/cpc/brand', g.last.utm.campaign === 'brand', g.last);
  check('fill by name', await val(p, '#plain [name=utm_source]') === 'google');
  check('fill _1st', await val(p, '#plain [name=utm_source_1st]') === 'google');
  check('fill anon id', /^VZ\.1\./.test(await val(p, '#plain [name=vz_anonymous_id]')));
  check('fill by class (Gravity Forms)', await val(p, '[name=input_3]') === 'google');
  check('fill by data attribute', await val(p, '[name=input_4]') === 'brand');
  check('does not touch unrelated visible field', await val(p, '[name=email]') === '');
  const cookies = await ctx.cookies();
  const c = cookies.find(x => x.name === 'vz_attr');
  check('cookie on parent domain', c && c.domain === '.client.test', c && c.domain);
  const dlEvents = await p.evaluate(() => dataLayer.map(e => e.event));
  check('dataLayer ready event', dlEvents.includes('vz_attribution.ready'), dlEvents);

  // 2. Same session, internal navigation keeps last touch
  console.log('Same session');
  await p.goto('https://www.client.test/pricing', { referer: 'https://www.client.test/' });
  await p.evaluate(() => VizAttribution.init());
  g = await grab(p);
  check('last touch kept within session', g.last.utm.campaign === 'brand', g.last);

  // 3. New touch via organic referrer overwrites last, keeps first
  console.log('Organic referrer');
  await p.goto('https://www.client.test/blog', { referer: 'https://www.google.com/' });
  await p.evaluate(() => VizAttribution.init());
  g = await grab(p);
  check('last = google/organic', g.last.utm.source === 'google' && g.last.utm.medium === 'organic', g.last.utm);
  check('first unchanged', g.first.utm.campaign === 'brand', g.first.utm);

  // 4. AI + social + referral classification
  console.log('Referrer classification');
  for (const [ref, src, med] of [
    ['https://chatgpt.com/', 'chatgpt', 'ai'],
    ['https://www.perplexity.ai/', 'perplexity', 'ai'],
    ['https://l.facebook.com/', 'facebook', 'social'],
    ['https://t.co/abc', 'x', 'social'],
    ['https://news.example.org/post', 'news.example.org', 'referral'],
  ]) {
    await p.goto('https://www.client.test/', { referer: ref });
    await p.evaluate(() => VizAttribution.init());
    g = await grab(p);
    check(`${ref} -> ${src}/${med}`, g.last.utm.source === src && g.last.utm.medium === med, g.last.utm);
  }

  // 5. Ignored referrer (PayPal return) keeps last touch
  console.log('Ignored referrer');
  await p.goto('https://www.client.test/thanks', { referer: 'https://www.paypal.com/checkout' });
  await p.evaluate(() => VizAttribution.init());
  g = await grab(p);
  check('paypal referrer ignored', g.last.utm.source === 'news.example.org', g.last.utm);

  // 6. Session expiry -> direct
  console.log('Session expiry');
  await p.evaluate(() => {
    const raw = document.cookie.match(/vz_attr=([^;]+)/)[1];
    const s = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(raw)))));
    s.last._exp = 1;
    document.cookie = 'vz_attr=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(s))))) + '; path=/; domain=.client.test; max-age=9999';
  });
  await p.goto('https://www.client.test/again');
  await p.evaluate(() => VizAttribution.init());
  g = await grab(p);
  check('expired session + direct -> (direct)/(none)', g.last.utm.source === '(direct)', g.last.utm);
  check('first still google/cpc', g.first.utm.source === 'google' && g.first.utm.medium === 'cpc', g.first.utm);
  await ctx.close();

  // 7. lastNonDirect keeps previous campaign after expiry
  console.log('lastNonDirect');
  ctx = await newCtx(() => PAGE());
  p = await ctx.newPage();
  await p.goto('https://www.client.test/?utm_source=meta&utm_medium=paid_social');
  await p.evaluate(() => VizAttribution.init({ lastNonDirect: true, adapters: { hubspot: false } }));
  await p.evaluate(() => {
    const raw = document.cookie.match(/vz_attr=([^;]+)/)[1];
    const s = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(raw)))));
    s.last._exp = 1;
    document.cookie = 'vz_attr=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(s))))) + '; path=/; domain=.client.test; max-age=9999';
  });
  await p.goto('https://www.client.test/later');
  await p.evaluate(() => VizAttribution.init({ lastNonDirect: true }));
  g = await grab(p);
  check('previous campaign kept', g.last.utm.source === 'meta', g.last.utm);
  await ctx.close();

  // 8. gclid-only click, no UTMs; cookie vs URL fallback
  console.log('Click IDs');
  ctx = await newCtx(() => PAGE());
  p = await ctx.newPage();
  await p.goto('https://www.client.test/?gclid=URLGCLID123&fbclid=FBCLID9');
  await p.evaluate(() => VizAttribution.init({ adapters: { hubspot: false } }));
  g = await grab(p);
  check('gclid infers google/cpc', g.last.utm.source === 'google' && g.last.utm.medium === 'cpc', g.last.utm);
  check('gclid filled from URL', await val(p, '#plain [name=gclid]') === 'URLGCLID123');
  let v = await p.evaluate(() => VizAttribution.values());
  check('_fbc built from fbclid', /^fb\.1\.\d+\.FBCLID9$/.test(v._fbc), v._fbc);
  await ctx.addCookies([{ name: '_gcl_aw', value: 'GCL.1790000000.COOKIEGCLID', domain: '.client.test', path: '/' },
                        { name: '_ga', value: 'GA1.1.111.222', domain: '.client.test', path: '/' },
                        { name: '_ga_ABC123', value: 'GS2.1.s1790642397$o1$g1$t1790643280$j4$l0$h0', domain: '.client.test', path: '/' }]);
  v = await p.evaluate(() => VizAttribution.values());
  check('gclid prefers _gcl_aw cookie', v.gclid === 'COOKIEGCLID', v.gclid);
  check('ga_client_id parsed', v.ga_client_id === '111.222', v.ga_client_id);
  check('ga_session_id parsed (auto-detect)', v.ga_session_id === '1790642397', v.ga_session_id);
  await ctx.close();

  // 9. Dynamic forms + Gravity Forms re-render + renames
  console.log('Dynamic forms');
  ctx = await newCtx(() => PAGE());
  p = await ctx.newPage();
  await p.goto('https://www.client.test/?utm_source=linkedin&utm_medium=paid_social');
  await p.evaluate(() => VizAttribution.init({ fieldNames: { utm_medium: 'lead_medium' }, adapters: { hubspot: false } }));
  await p.evaluate(() => {
    const f = document.createElement('form');
    f.innerHTML = '<input type="hidden" name="utm_source" id="dyn"><input type="hidden" name="lead_medium" id="dyn2">';
    document.body.appendChild(f);
  });
  await p.waitForTimeout(400);
  check('observer fills injected form', await val(p, '#dyn') === 'linkedin');
  check('field rename applied', await val(p, '#dyn2') === 'paid_social');
  await p.evaluate(() => { document.querySelector('[name=input_3]').value = ''; document.dispatchEvent(new CustomEvent('gform/post_render')); });
  await p.waitForTimeout(400);
  check('gform/post_render re-fills', await val(p, '[name=input_3]') === 'linkedin');
  await ctx.close();

  // 10. HubSpot v4 adapter (mock)
  console.log('HubSpot v4');
  const hsMock = `<script>
    window.__hsSet = {};
    window.HubSpotFormsV4 = { getForms: () => [{ setFieldValue: (k, v) => { window.__hsSet[k] = v; } }],
                              getFormFromEvent: () => null };
  </script>`;
  ctx = await newCtx(() => PAGE(hsMock));
  p = await ctx.newPage();
  await p.goto('https://www.client.test/?utm_source=bing&utm_medium=cpc&msclkid=MS1');
  await p.evaluate(() => VizAttribution.init());
  await p.waitForTimeout(700);
  const hs = await p.evaluate(() => window.__hsSet);
  check('HubSpot 0-1/utm_source set', hs['0-1/utm_source'] === 'bing', hs);
  check('HubSpot 0-1/msclkid set', hs['0-1/msclkid'] === 'MS1', hs);
  await ctx.close();

  // 11. Auto-init via config global + consent off
  console.log('Auto-init & consent');
  ctx = await newCtx(() => PAGE('<script>window.vzAttributionConfig={storage:false, adapters:{hubspot:false}}</script>'));
  p = await ctx.newPage();
  await p.goto('https://www.client.test/?utm_source=x&utm_medium=y');
  g = await grab(p);
  check('auto-init from vzAttributionConfig', g && g.last.utm.source === 'x');
  check('storage:false writes no cookie', !(await ctx.cookies()).some(c => c.name === 'vz_attr'));
  await p.evaluate(() => VizAttribution.setConsent(true));
  check('setConsent(true) writes cookie', (await ctx.cookies()).some(c => c.name === 'vz_attr'));
  await p.evaluate(() => VizAttribution.setConsent(false));
  check('setConsent(false) deletes cookie', !(await ctx.cookies()).some(c => c.name === 'vz_attr'));
  await ctx.close();

  // 12. Campaign Collector compatibility shim
  console.log('Compat');
  ctx = await newCtx(() => PAGE());
  p = await ctx.newPage();
  await p.goto('https://www.client.test/?utm_source=a&utm_medium=b');
  await p.evaluate(() => VizAttribution.init({ compatCampaignCollector: true, adapters: { hubspot: false } }));
  const cc = await p.evaluate(() => window._campaignCollector.alpha.grab().last.utm.source);
  check('_campaignCollector.alpha.grab() works', cc === 'a', cc);
  await ctx.close();


  // 13. Collector: standalone mode sends nothing; platform mode sends pageview with DNI number
  console.log('Collector');
  async function collectorCtx(html) {
    const sent = [];
    const ctx = await browser.newContext();
    await ctx.route('**/*', r => {
      const req = r.request(), u = new URL(req.url());
      if (u.hostname === 'collect.platform.test') {
        try { sent.push(JSON.parse(req.postData() || '{}')); } catch (e) { sent.push({ bad: req.postData() }); }
        return r.fulfill({ status: 204, body: '' });
      }
      if (u.hostname.endsWith('client.test')) return r.fulfill({ contentType: 'text/html', body: html(u) });
      return r.fulfill({ contentType: 'text/html', body: '<a id=go href="https://www.client.test/landing">go</a>' });
    });
    return { ctx, sent };
  }
  const EP = 'https://collect.platform.test/v1/collect';
  // Phone link starts with the business number; a fake DNI script swaps it after 50ms
  const DNI = `<a id="tel" href="tel:+1 (612) 555-0100">(612) 555-0100</a>
    <script>setTimeout(() => { const a = document.getElementById('tel'); a.href = 'tel:+16125550199'; a.textContent = '(612) 555-0199'; }, 50);</script>`;
  const AC_FORM = `<form class="_form _form_3"><input type="hidden" name="field[12]"><input type="hidden" name="field[13]">
    <input type="text" name="email"></form>`;

  let col = await collectorCtx(() => PAGE('', DNI));
  p = await col.ctx.newPage();
  await p.goto('https://www.client.test/?utm_source=google&utm_medium=cpc&gclid=GC1');
  await p.evaluate(() => VizAttribution.init({ adapters: { hubspot: false }, collector: { dniWaitMs: 100 } }));
  await p.waitForTimeout(400);
  check('standalone mode sends nothing', col.sent.length === 0, col.sent);
  await col.ctx.close();

  col = await collectorCtx(() => PAGE('', DNI));
  p = await col.ctx.newPage();
  await p.goto('https://www.client.test/services?utm_source=google&utm_medium=cpc&utm_campaign=hvac&gclid=GC1');
  await p.evaluate(ep => VizAttribution.init({ adapters: { hubspot: false }, collector: { endpoint: ep, siteKey: 'site_abc', dniWaitMs: 150 } }), EP);
  await p.waitForTimeout(600);
  let pv = col.sent.find(e => e.type === 'pageview');
  check('pageview sent', !!pv, col.sent);
  check('pageview has site key + anon id', pv && pv.site_key === 'site_abc' && /^VZ\.1\./.test(pv.anonymous_id), pv);
  check('pageview has swapped DNI number', pv && pv.tracking_number === '+16125550199', pv && pv.tracking_number);
  check('pageview flags new touch + session', pv && pv.new_touch === true && pv.new_session === true, pv);
  check('pageview carries last touch + gclid', pv && pv.touch.last.utm.campaign === 'hvac' && pv.ids.gclid === 'GC1', pv && pv.touch);
  check('internal fields stripped', pv && pv.touch.last._exp === undefined && typeof pv.touch.last.set_at === 'number', pv && pv.touch.last);
  check('page url has no query string', pv && pv.page.url === 'https://www.client.test/services', pv && pv.page);

  // same session: second page is not a new touch
  await p.goto('https://www.client.test/contact', { referer: 'https://www.client.test/services' });
  await p.evaluate(ep => VizAttribution.init({ adapters: { hubspot: false }, collector: { endpoint: ep, dniWaitMs: 100 } }), EP);
  await p.waitForTimeout(400);
  pv = col.sent.filter(e => e.type === 'pageview')[1];
  check('in-session pageview: new_touch false', pv && pv.new_touch === false && pv.new_session === false, pv);
  check('same anon id across pages', pv && pv.anonymous_id === col.sent[0].anonymous_id);

  // 14. Phone click + custom track()
  console.log('Phone click & track()');
  await p.click('#tel');
  await p.waitForTimeout(200);
  const pc = col.sent.find(e => e.type === 'phone_click');
  check('phone_click sent with number', pc && pc.props.number === '+16125550199', pc);
  await p.evaluate(() => VizAttribution.track('quote_started', { service: 'ac_repair' }));
  await p.waitForTimeout(200);
  const ce = col.sent.find(e => e.type === 'quote_started');
  check('track() sends custom event', ce && ce.props.service === 'ac_repair', ce);
  const dlSent = await p.evaluate(() => dataLayer.filter(e => e.event === 'vz_attribution.sent').length);
  check('dataLayer sent events', dlSent >= 2, dlSent);
  await col.ctx.close();

  // 15. pagehide flushes a quick bounce before the DNI wait ends
  console.log('Quick bounce');
  col = await collectorCtx(() => PAGE('', DNI));
  p = await col.ctx.newPage();
  await p.goto('https://www.client.test/?utm_source=meta&utm_medium=paid_social');
  await p.evaluate(ep => VizAttribution.init({ adapters: { hubspot: false }, collector: { endpoint: ep, dniWaitMs: 10000 } }), EP);
  // Real unload beacons aren't reliably visible to Playwright's router, so fire the event directly
  await p.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await p.waitForTimeout(300);
  check('pagehide sends pageview', col.sent.some(e => e.type === 'pageview' && e.touch.last.utm.source === 'meta'), col.sent);
  await p.waitForTimeout(200);
  check('pageview not sent twice', col.sent.filter(e => e.type === 'pageview').length === 1, col.sent.length);
  await col.ctx.close();

  // 16. Consent gating: nothing before consent, pending pageview flushed after
  console.log('Collector consent');
  col = await collectorCtx(() => PAGE('', DNI));
  p = await col.ctx.newPage();
  await p.goto('https://www.client.test/?utm_source=bing&utm_medium=cpc');
  await p.evaluate(ep => VizAttribution.init({ storage: false, adapters: { hubspot: false }, collector: { endpoint: ep, dniWaitMs: 100 } }), EP);
  await p.waitForTimeout(400);
  check('no send without analytics consent', col.sent.length === 0, col.sent);
  await p.evaluate(() => VizAttribution.setConsent(true));
  await p.waitForTimeout(300);
  check('pending pageview sent after consent', col.sent.length === 1 && col.sent[0].touch.last.utm.source === 'bing', col.sent);
  await col.ctx.close();

  col = await collectorCtx(() => PAGE('', DNI));
  p = await col.ctx.newPage();
  await p.goto('https://www.client.test/?utm_source=google&utm_medium=cpc');
  await p.evaluate(ep => VizAttribution.init({ adapters: { hubspot: false }, collector: { endpoint: ep, dniWaitMs: 100, adConsent: false } }), EP);
  await p.waitForTimeout(400);
  check('no send without ad consent', col.sent.length === 0, col.sent);
  check('cookie still written without ad consent', (await col.ctx.cookies()).some(c => c.name === 'vz_attr'));
  await p.click('#tel');
  await p.evaluate(() => VizAttribution.setAdConsent(true));
  await p.waitForTimeout(300);
  check('pageview flushed after ad consent', col.sent.filter(e => e.type === 'pageview').length === 1, col.sent);
  check('phone click before consent dropped', !col.sent.some(e => e.type === 'phone_click'), col.sent);
  await col.ctx.close();

  // 17. ActiveCampaign field mapping
  console.log('ActiveCampaign');
  ctx = await newCtx(() => PAGE('', AC_FORM));
  p = await ctx.newPage();
  await p.goto('https://www.client.test/?utm_source=google&utm_medium=cpc&gclid=ACG1');
  await p.evaluate(() => VizAttribution.init({ adapters: { hubspot: false, activecampaignFields: { utm_source: 12, vz_anonymous_id: 'field[13]' } } }));
  check('AC field[12] = utm_source', await val(p, '[name="field[12]"]') === 'google');
  check('AC field[13] = anon id', /^VZ\.1\./.test(await val(p, '[name="field[13]"]')));
  check('AC visible email untouched', await val(p, '._form [name=email]') === '');
  // AC embeds load late: form injected after init is filled by the observer
  await p.evaluate(() => {
    const f = document.createElement('form');
    f.className = '_form _form_9';
    f.innerHTML = '<input type="hidden" name="field[12]" id="acdyn">';
    document.body.appendChild(f);
  });
  await p.waitForTimeout(400);
  check('late AC embed filled', await val(p, '#acdyn') === 'google');
  // AC mapping uses built-in names even when fields are renamed for other forms
  await p.goto('https://www.client.test/?utm_source=bing&utm_medium=cpc');
  await p.evaluate(() => VizAttribution.init({ fieldNames: { utm_source: 'lead_source' }, adapters: { hubspot: false, activecampaignFields: { utm_source: '12' } } }));
  check('AC mapping independent of renames', await val(p, '[name="field[12]"]') === 'bing');
  await ctx.close();


  // 18. Full snapshot on fill/ready + Tag Assistant referrer ignored
  console.log('Snapshot & Tag Assistant');
  ctx = await newCtx(() => PAGE());
  p = await ctx.newPage();
  await ctx.addCookies([{ name: '_fbp', value: 'fb.1.1790721348545.31787', domain: '.client.test', path: '/' },
                        { name: '_ga', value: 'GA1.1.1555838360.1790721349', domain: '.client.test', path: '/' },
                        { name: '_ga_E2T8JBEDM6', value: 'GS2.1.s1790721348$o1$g1$t1790721361$j47$l0$h0', domain: '.client.test', path: '/' }]);
  await p.goto('https://www.client.test/?utm_source=facebook&utm_medium=paid_social&utm_campaign=vz_test_meta&fbclid=FB1');
  await p.evaluate(() => VizAttribution.init({ adapters: { hubspot: false } }));
  const fillEvt = await p.evaluate(() => dataLayer.find(e => e.event === 'vz_attribution.fill'));
  const d = fillEvt && fillEvt.vz_attribution_data;
  check('fill carries snapshot', d && /^VZ\.1\./.test(d.anonymous_id) && d.first.utm.source === 'facebook' && d.last.utm.campaign === 'vz_test_meta', d);
  check('snapshot has click ids + touch timing', d && d.last.click.fbclid === 'FB1' && typeof d.last._set === 'number' && typeof d.last._exp === 'number', d && d.last);
  check('snapshot raw cookies', d && d.cookies._fbp === 'fb.1.1790721348545.31787' && d.cookies._ga_E2T8JBEDM6.indexOf('GS2.1') === 0 && d.cookies._gcl_aw === '', d && d.cookies);
  check('snapshot parsed ids', d && d.ids.ga_client_id === '1555838360.1790721349' && d.ids.ga_session_id === '1790721348', d && d.ids);
  const readyEvt = await p.evaluate(() => dataLayer.find(e => e.event === 'vz_attribution.ready'));
  check('ready carries snapshot', readyEvt && readyEvt.vz_attribution_data && readyEvt.vz_attribution_data.anonymous_id === d.anonymous_id);
  await ctx.close();
  ctx = await newCtx(() => PAGE());
  p = await ctx.newPage();
  await p.goto('https://www.client.test/', { referer: 'https://tagassistant.google.com/' });
  await p.evaluate(() => VizAttribution.init({ adapters: { hubspot: false } }));
  g = await grab(p);
  check('tagassistant.google.com referrer ignored', g.first.utm.source === '(direct)', g.first.utm);
  await ctx.close();

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
