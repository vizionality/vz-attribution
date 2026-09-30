/*!
 * Vizionality Attribution v1.2.0
 * First/last-touch campaign attribution, click-ID capture, form fill and
 * an optional collector that streams touches and pageviews to your platform.
 * (c) Vizionality. MIT License.
 *
 * Usage:
 *   window.vzAttributionConfig = { ... };   // optional, before the script loads
 *   <script src="vz-attribution.min.js" async></script>
 * or
 *   VizAttribution.init({ ... });
 */
(function (window, document) {
  'use strict';

  if (window.VizAttribution && window.VizAttribution._initialized) return;

  var VERSION = '1.2.0';

  // ---------------------------------------------------------------------------
  // Defaults
  // ---------------------------------------------------------------------------
  var DEFAULTS = {
    cookieName: 'vz_attr',
    cookieDomain: 'auto',          // 'auto' | '.example.com' | '' (host-only)
    firstTouchDays: 400,           // browsers cap cookie lifetime at 400 days
    sessionMinutes: 30,
    lastNonDirect: false,          // true: direct return visits keep the previous last touch
    storage: true,                 // false: keep everything in memory, write no cookie
    serverCookie: '',              // same-origin URL that re-sets the cookie server-side (Safari).
                                   // '' = use window.vzServerCookieUrl from the WordPress plugin; 'off' = disable
    internalHosts: [],             // extra hostnames (regex strings) treated as internal
    ignoreReferrers: [             // referrers that never create a new touch
      'paypal\\.com$', 'stripe\\.com$', 'hsforms\\.com$', 'hubspot\\.com$',
      'accounts\\.google\\.com$', 'login\\.microsoftonline\\.com$',
      'tagassistant\\.google\\.com$'   // GTM Preview / Tag Assistant
    ],
    extraIgnoreReferrers: [],      // added to ignoreReferrers (keeps the defaults)
    ga4MeasurementId: '',          // 'G-XXXXXXX'; empty = auto-detect first _ga_* cookie
    fieldNames: {},                // rename fields: { utm_source: 'lead_source' }
    fill: {
      byName: true,                // <input name="utm_source">
      classPrefix: 'vz-',          // wrapper/input class "vz-utm_source" (Gravity Forms etc.)
      attribute: 'data-vz',        // data-vz="utm_source"
      overwrite: 'hidden',         // 'hidden' = overwrite hidden inputs, fill visible ones only if empty; 'always' | 'empty'
      observe: true                // re-fill when new forms are added to the page
    },
    adapters: {
      hubspot: true,               // HubSpot embedded forms (v4 + legacy)
      hubspotPrefix: '0-1/',       // v4 field name prefix for contact properties
      gravityForms: true,          // re-fill on gform_post_render
      activecampaign: true,        // fill ActiveCampaign form inputs named field[ID]
      activecampaignFields: {}     // { utm_source: 12, vz_anonymous_id: 'field[13]' }
    },
    collector: {
      endpoint: '',                // platform ingest URL; empty = standalone mode, nothing is sent
      siteKey: '',                 // public per-site key issued by the platform
      pageviews: true,             // send every pageview (needed for call matching)
      phoneClicks: true,           // send an event when a tel: link is clicked
      numberSelector: 'a[href^="tel:"]', // where the call-tracking (DNI) number appears
      dniWaitMs: 2500,             // wait for the call-tracking script to swap the number
      adConsent: true              // initial ad consent; the GTM template sets this from ad_storage
    },
    dataLayerName: 'dataLayer',
    eventPrefix: 'vz_attribution',
    compatCampaignCollector: false, // expose window._campaignCollector.alpha.grab()
    rules: null                    // extend/override referrer rules: { organic: { name: 'regex' } }
  };

  var UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content', 'id',
                  'source_platform', 'marketing_tactic', 'creative_format'];

  // click-id param -> [inferred source, inferred medium]
  var CLICK_IDS = {
    gclid: ['google', 'cpc'], gbraid: ['google', 'cpc'], wbraid: ['google', 'cpc'],
    dclid: ['google', 'display'], msclkid: ['bing', 'cpc'], fbclid: ['facebook', 'social'],
    ttclid: ['tiktok', 'cpc'], li_fat_id: ['linkedin', 'cpc'], twclid: ['x', 'cpc']
  };

  var RULES = {
    organic: {
      google: '^(www\\.)?google\\.[a-z]{2,3}(\\.[a-z]{2})?$',
      bing: '^(www\\.|cn\\.)?bing\\.com$',
      duckduckgo: '^(html\\.)?duckduckgo\\.com$',
      yahoo: '(^|\\.)search\\.yahoo\\.(com|co\\.jp)$|^(www\\.)?yahoo\\.com$',
      ecosia: '^(www\\.)?ecosia\\.org$',
      brave: '^search\\.brave\\.com$',
      baidu: '^(www\\.)?baidu\\.com$',
      yandex: '^(www\\.)?yandex\\.(com|ru)$',
      aol: '^(search\\.)?aol\\.com$',
      ask: '^(www\\.)?ask\\.com$'
    },
    ai: {
      chatgpt: '(^|\\.)(chatgpt\\.com|chat\\.openai\\.com)$',
      perplexity: '(^|\\.)perplexity\\.ai$',
      gemini: '^gemini\\.google\\.com$',
      claude: '(^|\\.)claude\\.ai$',
      copilot: '^copilot\\.microsoft\\.com$',
      mistral: '(^|\\.)mistral\\.ai$',
      deepseek: '(^|\\.)deepseek\\.com$'
    },
    social: {
      facebook: '(^|\\.)facebook\\.com$|^fb\\.me$',
      instagram: '(^|\\.)instagram\\.com$',
      linkedin: '(^|\\.)linkedin\\.com$|^lnkd\\.in$',
      youtube: '(^|\\.)youtube\\.com$|^youtu\\.be$',
      x: '^t\\.co$|(^|\\.)x\\.com$|(^|\\.)twitter\\.com$',
      reddit: '(^|\\.)reddit\\.com$',
      pinterest: '(^|\\.)pinterest\\.[a-z.]+$',
      tiktok: '(^|\\.)tiktok\\.com$',
      nextdoor: '(^|\\.)nextdoor\\.com$',
      threads: '(^|\\.)threads\\.net$'
    }
  };

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
        var v = src[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
          target[k] = extend({}, target[k], v);
        } else if (v !== undefined) {
          target[k] = v;
        }
      }
    }
    return target;
  }

  function nowSec() { return Math.floor(Date.now() / 1000); }

  function readCookie(name) {
    var esc = name.replace(/[.$?*|{}()[\]\\\/+^]/g, '\\$&');
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + esc + '=([^;]*)'));
    if (!m) return undefined;
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }

  function writeCookie(name, value, maxAgeSec, domain) {
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; max-age=' + maxAgeSec + '; path=/' +
      (domain ? '; domain=' + domain : '') +
      '; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
  }

  function detectCookieDomain() {
    var host = location.hostname;
    if (!host || host === 'localhost' || /^[\d.]+$/.test(host) || host.indexOf(':') > -1) return '';
    var parts = host.split('.');
    for (var i = parts.length - 2; i >= 0; i--) {
      var d = '.' + parts.slice(i).join('.');
      document.cookie = 'vz_tld=1; path=/; max-age=10; domain=' + d;
      if (readCookie('vz_tld')) {
        document.cookie = 'vz_tld=; path=/; max-age=0; domain=' + d;
        return d;
      }
    }
    return '';
  }

  function encode(obj) { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
  function decode(str) {
    if (!str) return null;
    try { return JSON.parse(decodeURIComponent(escape(atob(str)))); } catch (e) { return null; }
  }

  function getParams() {
    var out = {};
    var q = location.search.replace(/^\?/, '');
    if (!q) return out;
    q.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      var k = i > -1 ? pair.slice(0, i) : pair;
      var v = i > -1 ? pair.slice(i + 1) : '';
      try {
        k = decodeURIComponent(k.replace(/\+/g, ' ')).toLowerCase();
        v = decodeURIComponent(v.replace(/\+/g, ' '));
      } catch (e) { return; }
      if (k && v && out[k] === undefined) out[k] = v.slice(0, 500);
    });
    return out;
  }

  function hostOf(url) {
    var a = document.createElement('a');
    a.href = url;
    return (a.hostname || '').toLowerCase();
  }

  function cleanUrl() { return location.protocol + '//' + location.host + location.pathname; }

  function matchesAny(host, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      try { if (new RegExp(patterns[i], 'i').test(host)) return true; } catch (e) { /* bad pattern */ }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Core
  // ---------------------------------------------------------------------------
  var cfg = null;
  var state = null;       // persisted { v, anonymous_id, first, last }
  var rules = null;
  var cookieDomain = '';
  var fillTimer = null;
  var pageNewTouch = false;   // this page started a new touch
  var pageNewSession = false; // this page started a new session

  function dl() {
    var name = cfg.dataLayerName;
    window[name] = window[name] || [];
    return window[name];
  }

  function isInternal(host) {
    if (!host) return false;
    if (host === location.hostname.toLowerCase()) return true;
    var base = cookieDomain.replace(/^\./, '');
    if (base && (host === base || host.slice(-(base.length + 1)) === '.' + base)) return true;
    return matchesAny(host, cfg.internalHosts);
  }

  function touchFromUrl(params) {
    var utm = {}, click = {}, hasUtm = false, hasClick = false, k;

    UTM_KEYS.forEach(function (key) {
      if (params['utm_' + key]) { utm[key] = params['utm_' + key]; hasUtm = true; }
    });
    for (k in CLICK_IDS) {
      if (params[k]) { click[k] = params[k]; hasClick = true; }
    }
    if (!hasUtm && !hasClick) return null;

    if (!utm.source && hasClick) {
      for (k in CLICK_IDS) {
        if (click[k]) { utm.source = CLICK_IDS[k][0]; utm.medium = utm.medium || CLICK_IDS[k][1]; break; }
      }
    }
    return { utm: utm, click: click };
  }

  function touchFromReferrer() {
    var ref = document.referrer;
    if (!ref) return null;
    var host = hostOf(ref);
    if (!host || isInternal(host) || matchesAny(host, cfg.ignoreReferrers.concat(cfg.extraIgnoreReferrers || []))) return null;

    for (var medium in rules) {
      for (var source in rules[medium]) {
        if (matchesAny(host, [rules[medium][source]])) return { utm: { source: source, medium: medium }, click: {} };
      }
    }
    return { utm: { source: host, medium: 'referral' }, click: {} };
  }

  function makeTouch(base, t) {
    return {
      utm: base ? base.utm : { source: '(direct)', medium: '(none)' },
      click: base ? base.click : {},
      landing_page: cleanUrl(),
      referrer: document.referrer ? hostOf(document.referrer) : '',
      _set: t
    };
  }

  function resolve() {
    var t = nowSec();
    var params = getParams();
    var stored = cfg.storage ? decode(readCookie(cfg.cookieName)) : null;
    state = (stored && stored.v === 1) ? stored : (state || { v: 1 });

    var touch = touchFromUrl(params) || touchFromReferrer();

    if (!state.anonymous_id) {
      state.anonymous_id = 'VZ.1.' + Date.now() + '.' + Math.random().toString(36).slice(2, 12);
    }
    pageNewTouch = false;
    if (!state.first) { state.first = makeTouch(touch, t); pageNewTouch = true; }

    var sessionActive = state.last && state.last._exp > t;
    pageNewSession = !sessionActive;
    if (touch) {
      state.last = makeTouch(touch, t);
      pageNewTouch = true;
    } else if (!sessionActive && !(cfg.lastNonDirect && state.last)) {
      state.last = makeTouch(null, t);
      pageNewTouch = true;
    }
    state.last._exp = t + cfg.sessionMinutes * 60;

    persist();
  }

  function persist() {
    if (!cfg.storage) return;
    writeCookie(cfg.cookieName, encode(state), cfg.firstTouchDays * 86400, cookieDomain);
  }

  function readAdCookies() {
    var out = {}, v, m;

    if ((v = readCookie('_ga'))) {
      m = v.match(/(\d+\.\d+)$/);
      if (m) out.ga_client_id = m[1];
    }

    var gaName = cfg.ga4MeasurementId ? '_ga_' + cfg.ga4MeasurementId.replace(/^G-/i, '') : null;
    if (!gaName) {
      m = document.cookie.match(/(?:^|;\s*)(_ga_[A-Z0-9]+)=/);
      if (m) gaName = m[1];
    }
    if (gaName && (v = readCookie(gaName))) {
      m = v.match(/^GS2\.\d+\.s(\d+)/) || v.match(/^GS1\.\d+\.(\d+)/);
      if (m) out.ga_session_id = m[1];
    }

    [['_gcl_aw', 'gclid'], ['_gcl_ag', 'gbraid'], ['_gcl_gb', 'wbraid'], ['_gcl_dc', 'dclid']].forEach(function (p) {
      var c = readCookie(p[0]);
      if (c) {
        var id = c.split('.').slice(2).join('.');
        if (id) out[p[1]] = id;
      }
    });

    if ((v = readCookie('_uetmsclkid'))) out.msclkid = v.replace(/^_uet/, '');
    if ((v = readCookie('_fbc'))) out._fbc = v;
    if ((v = readCookie('_fbp'))) out._fbp = v;
    if ((v = readCookie('li_fat_id'))) out.li_fat_id = v;
    if ((v = readCookie('_ttp'))) out._ttp = v;

    return out;
  }

  // ---------------------------------------------------------------------------
  // Server cookie refresh (Safari ITP)
  // Safari caps cookies written by JavaScript at 7 days (24 h after an ad click).
  // After this page's last cookie write, ask the site's own server to send the
  // same cookie back in a Set-Cookie header, which Safari keeps for 400 days.
  // Same-origin only, so the response comes from the website's own server/IP.
  // ---------------------------------------------------------------------------
  var serverCookieStatus = 'off';

  function serverCookieUrl() {
    var u = cfg.serverCookie;
    if (u === 'off' || u === false) return '';
    return u || window.vzServerCookieUrl || '';
  }

  function refreshServerCookie() {
    var url = serverCookieUrl();
    if (!url) { serverCookieStatus = 'off'; return; }
    if (!cfg.storage) { serverCookieStatus = 'waiting for consent'; return; }
    if (!window.fetch) { serverCookieStatus = 'unsupported'; return; }
    var a = document.createElement('a');
    a.href = url;
    if (a.protocol + '//' + a.host !== location.protocol + '//' + location.host) {
      serverCookieStatus = 'skipped: not same-origin';
      return;
    }
    serverCookieStatus = 'pending';
    try {
      window.fetch(a.href, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cfg.cookieName, domain: cookieDomain })
      }).then(function (r) {
        serverCookieStatus = r.ok ? (r.headers.get('X-VZ-Cookie') || 'ok') : 'error ' + r.status;
      })['catch'](function () { serverCookieStatus = 'error'; });
    } catch (e) { serverCookieStatus = 'error'; }
  }

  // Raw ad/analytics cookie values ("" when not set), for debugging and GTM variables
  var RAW_COOKIES = ['_ga', '_gcl_aw', '_gcl_ag', '_gcl_gb', '_gcl_dc', '_uetmsclkid', '_fbc', '_fbp', 'li_fat_id', '_ttp'];
  function readRawCookies() {
    var out = {}, m, re = /(?:^|;\s*)(_ga_[A-Z0-9]+)=/g;
    RAW_COOKIES.forEach(function (name) { out[name] = readCookie(name) || ''; });
    while ((m = re.exec(document.cookie))) out[m[1]] = readCookie(m[1]) || '';
    return out;
  }

  // Full attribution snapshot pushed to the dataLayer on ready and fill
  function snapshot() {
    var g = grab();
    if (!g) return null;
    return {
      anonymous_id: g.anonymous_id,
      first: g.first,
      last: g.last,
      cookies: readRawCookies(),
      ids: g.cookies,
      new_touch: pageNewTouch
    };
  }

  // ---------------------------------------------------------------------------
  // Public data
  // ---------------------------------------------------------------------------
  function grab() {
    if (!state) return null;
    if (cfg.storage) {
      var fresh = decode(readCookie(cfg.cookieName));
      if (fresh && fresh.v === 1) state = fresh;
    }
    return {
      anonymous_id: state.anonymous_id,
      first: JSON.parse(JSON.stringify(state.first)),
      last: JSON.parse(JSON.stringify(state.last)),
      cookies: readAdCookies()
    };
  }

  // Flat key/value map of every fillable field, using built-in names
  function rawValues() {
    var g = grab();
    if (!g) return {};
    var c = g.cookies, out = {}, k;

    UTM_KEYS.forEach(function (key) {
      if (g.last.utm[key]) out['utm_' + key] = g.last.utm[key];
      if (g.first.utm[key]) out['utm_' + key + '_1st'] = g.first.utm[key];
    });
    out.landing_page = g.last.landing_page;
    out.landing_page_1st = g.first.landing_page;
    if (g.last.referrer) out.referrer = g.last.referrer;
    if (g.first.referrer) out.referrer_1st = g.first.referrer;

    // Click IDs: prefer platform cookies, fall back to IDs captured from the URL
    for (k in CLICK_IDS) {
      var val = c[k] || g.last.click[k] || g.first.click[k];
      if (val) out[k] = val;
    }
    if (c.ga_client_id) out.ga_client_id = c.ga_client_id;
    if (c.ga_session_id) out.ga_session_id = c.ga_session_id;
    if (c._fbp) out._fbp = c._fbp;
    if (c._ttp) out._ttp = c._ttp;
    out._fbc = c._fbc || (out.fbclid ? 'fb.1.' + (g.last.click.fbclid ? g.last._set : g.first._set) * 1000 + '.' + out.fbclid : undefined);
    if (!out._fbc) delete out._fbc;

    out.vz_anonymous_id = g.anonymous_id;
    out.vz_attribution_json = JSON.stringify({ first: g.first, last: g.last });
    return out;
  }

  // Same map with the configured renames applied
  function values() {
    var out = rawValues(), renamed = {}, k;
    for (k in out) renamed[cfg.fieldNames[k] || k] = out[k];
    return renamed;
  }

  // ---------------------------------------------------------------------------
  // Form fill
  // ---------------------------------------------------------------------------
  function setInput(el, value) {
    if (!el || value === undefined || value === null) return false;
    var mode = cfg.fill.overwrite;
    var isHidden = el.type === 'hidden';
    if (mode === 'empty' && el.value) return false;
    if (mode === 'hidden' && !isHidden && el.value) return false;
    if (el.value === String(value)) return false;
    el.value = value;
    return true;
  }

  function inputIn(el) {
    if (!el) return null;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el;
    return el.querySelector('input, textarea');
  }

  function fill(root) {
    if (!state) return 0;
    var vals = values(), scope = root || document, count = 0, f = cfg.fill;

    if (f.byName) {
      Array.prototype.forEach.call(scope.querySelectorAll('input[name], textarea[name]'), function (el) {
        if (Object.prototype.hasOwnProperty.call(vals, el.name) && setInput(el, vals[el.name])) count++;
      });
    }

    if (f.classPrefix) {
      var re = new RegExp('(?:^|\\s)' + f.classPrefix.replace(/[-.]/g, '\\$&') + '([a-z0-9_]+)', 'i');
      Array.prototype.forEach.call(scope.querySelectorAll('[class*="' + f.classPrefix + '"]'), function (el) {
        var m = (typeof el.className === 'string' ? el.className : '').match(re);
        if (m && Object.prototype.hasOwnProperty.call(vals, m[1]) && setInput(inputIn(el), vals[m[1]])) count++;
      });
    }

    if (f.attribute) {
      Array.prototype.forEach.call(scope.querySelectorAll('[' + f.attribute + ']'), function (el) {
        var key = el.getAttribute(f.attribute);
        if (Object.prototype.hasOwnProperty.call(vals, key) && setInput(inputIn(el), vals[key])) count++;
      });
    }

    if (cfg.adapters.activecampaign) count += fillActiveCampaign(scope);

    if (count) dl().push({ event: cfg.eventPrefix + '.fill', vz_fields_filled: count, vz_attribution_data: snapshot() });
    return count;
  }

  // ActiveCampaign forms name custom fields field[ID]. Map built-in fields to IDs:
  // activecampaignFields: { utm_source: 12 } or { utm_source: 'field[12]' }
  function fillActiveCampaign(scope) {
    var map = cfg.adapters.activecampaignFields || {}, raw = null, count = 0, key;
    for (key in map) {
      if (!Object.prototype.hasOwnProperty.call(map, key) || map[key] === '' || map[key] == null) continue;
      if (!raw) raw = rawValues();
      if (raw[key] === undefined) continue;
      var id = String(map[key]).replace(/\s/g, '');
      var name = /^\d+$/.test(id) ? 'field[' + id + ']' : id;
      var els = scope.querySelectorAll('input, textarea');
      for (var i = 0; i < els.length; i++) {
        if (els[i].name === name && setInput(els[i], raw[key])) count++;
      }
    }
    return count;
  }

  function scheduleFill() {
    clearTimeout(fillTimer);
    fillTimer = setTimeout(function () { fill(); }, 150);
  }

  // ---------------------------------------------------------------------------
  // Adapters
  // ---------------------------------------------------------------------------
  function hubspotAdapter() {
    var prefix = cfg.adapters.hubspotPrefix;

    function fillV4(form) {
      if (!form || typeof form.setFieldValue !== 'function') return;
      var vals = values();
      for (var k in vals) {
        try { form.setFieldValue(prefix + k, vals[k]); } catch (e) { /* field not on form */ }
      }
    }

    // v4 embeds
    window.addEventListener('hs-form-event:on-ready', function (event) {
      if (window.HubSpotFormsV4) fillV4(window.HubSpotFormsV4.getFormFromEvent(event));
    });
    var tries = 0;
    var poll = setInterval(function () {
      if (window.HubSpotFormsV4 && window.HubSpotFormsV4.getForms) {
        clearInterval(poll);
        window.HubSpotFormsV4.getForms().forEach(fillV4);
      } else if (++tries > 20) {
        clearInterval(poll);
      }
    }, 500);

    // Legacy (v2/v3) embeds render plain inputs named after the property
    window.addEventListener('message', function (event) {
      var d = event.data;
      if (d && d.type === 'hsFormCallback' && d.eventName === 'onFormReady') scheduleFill();
    });
  }

  function gravityFormsAdapter() {
    document.addEventListener('gform/post_render', scheduleFill); // GF 2.9+
    var tries = 0;
    (function hook() {
      if (window.jQuery) {
        window.jQuery(document).on('gform_post_render', scheduleFill);
      } else if (++tries < 40) {
        setTimeout(hook, 250);
      }
    })();
  }

  function observeForms() {
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType === 1 && (n.tagName === 'FORM' || n.tagName === 'INPUT' || (n.querySelector && n.querySelector('form, input')))) {
            scheduleFill();
            return;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------------------------
  // Collector (optional): streams touches, pageviews and phone clicks to the
  // attribution platform so calls and CRM deals can be matched to visits.
  // Off unless collector.endpoint is set. Sends only when storage consent is
  // granted (cfg.storage) and ad consent is granted (setAdConsent).
  // ---------------------------------------------------------------------------
  var adConsent = true;
  var pendingPageview = null; // pageview built before consent, sent once granted

  var ID_KEYS = ['gclid', 'gbraid', 'wbraid', 'dclid', 'msclkid', 'fbclid', '_fbc', '_fbp',
                 'ttclid', '_ttp', 'li_fat_id', 'twclid', 'ga_client_id', 'ga_session_id'];

  function collectorOn() { return !!(cfg.collector && cfg.collector.endpoint); }
  function canSend() { return collectorOn() && cfg.storage && adConsent; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

  // "+1 (612) 555-0100" / "tel:6125550100" -> "+16125550100" / "6125550100"
  function normalizeNumber(str) {
    if (!str) return '';
    var s = String(str).replace(/^\s*tel:/i, '').trim();
    var digits = s.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return '';
    return (s.charAt(0) === '+' ? '+' : '') + digits;
  }

  function trackingNumber() {
    var sel = cfg.collector.numberSelector, el;
    if (!sel) return '';
    try { el = document.querySelector(sel); } catch (e) { return ''; }
    if (!el) return '';
    var href = el.getAttribute('href') || '';
    return normalizeNumber(/^\s*tel:/i.test(href) ? href : el.textContent);
  }

  function publicTouch(t) {
    var out = JSON.parse(JSON.stringify(t));
    out.set_at = out._set;
    delete out._set;
    delete out._exp;
    return out;
  }

  function buildEvent(type, props) {
    var g = grab(), raw = rawValues(), ids = {};
    ID_KEYS.forEach(function (k) { if (raw[k]) ids[k] = raw[k]; });
    var evt = {
      v: 1,
      sdk: 'vz-attribution/' + VERSION + (cfg.sdk ? '+' + cfg.sdk : ''),
      site_key: cfg.collector.siteKey,
      event_id: uid(),
      type: type,
      ts: Date.now(),
      anonymous_id: g.anonymous_id,
      page: {
        url: cleanUrl(),
        path: location.pathname,
        title: (document.title || '').slice(0, 200),
        referrer: document.referrer ? hostOf(document.referrer) : ''
      },
      touch: { first: publicTouch(g.first), last: publicTouch(g.last) },
      ids: ids,
      tracking_number: trackingNumber(),
      props: props || {}
    };
    if (type === 'pageview') {
      evt.new_session = pageNewSession;
      evt.new_touch = pageNewTouch;
    }
    return evt;
  }

  function transmit(evt) {
    var body = JSON.stringify(evt), url = cfg.collector.endpoint;
    try {
      // text/plain keeps it a "simple" request: no CORS preflight
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return true;
    } catch (e) { /* fall through */ }
    try {
      if (window.fetch) {
        window.fetch(url, { method: 'POST', body: body, keepalive: true, mode: 'no-cors',
                            credentials: 'omit', headers: { 'Content-Type': 'text/plain' } });
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function send(type, props) {
    if (!collectorOn()) return false;
    var evt = buildEvent(type, props);
    if (!canSend()) {
      if (type === 'pageview') pendingPageview = evt; // keep this page's view until consent
      return false;
    }
    var ok = transmit(evt);
    if (ok) dl().push({ event: cfg.eventPrefix + '.sent', vz_sent_type: type });
    return ok;
  }

  function flushPending() {
    if (!pendingPageview || !canSend()) return;
    var evt = pendingPageview;
    pendingPageview = null;
    evt.tracking_number = trackingNumber() || evt.tracking_number;
    evt.ids = buildEvent('pageview').ids; // click-ID cookies may exist now
    if (transmit(evt)) dl().push({ event: cfg.eventPrefix + '.sent', vz_sent_type: 'pageview' });
  }

  function schedulePageview() {
    var done = false;
    function go() {
      if (done) return;
      done = true;
      send('pageview');
    }
    // Wait for the call-tracking script to swap in its number, but never lose a quick bounce
    setTimeout(go, cfg.collector.dniWaitMs);
    window.addEventListener('pagehide', go);
  }

  function watchPhoneClicks() {
    document.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== document) {
        if (el.tagName === 'A' && /^\s*tel:/i.test(el.getAttribute('href') || '')) {
          send('phone_click', { number: normalizeNumber(el.getAttribute('href')) });
          return;
        }
        el = el.parentNode;
      }
    }, true);
  }

  // ---------------------------------------------------------------------------
  // Init / API
  // ---------------------------------------------------------------------------
  function init(options) {
    if (api._initialized) return api;

    cfg = extend({}, DEFAULTS, window.vzAttributionConfig || {}, options || {});
    rules = extend({}, RULES, cfg.rules || {});
    cookieDomain = cfg.cookieDomain === 'auto' ? detectCookieDomain() : (cfg.cookieDomain || '');

    adConsent = cfg.collector.adConsent !== false;

    resolve();
    api._initialized = true;

    if (collectorOn()) {
      if (cfg.collector.pageviews) schedulePageview();
      if (cfg.collector.phoneClicks) watchPhoneClicks();
    }

    if (cfg.compatCampaignCollector) {
      window._campaignCollector = window._campaignCollector || { alpha: { grab: grab, fill: fill } };
    }

    if (cfg.adapters.hubspot) hubspotAdapter();
    if (cfg.adapters.gravityForms) gravityFormsAdapter();

    function onReady() {
      fill();
      if (cfg.fill.observe) observeForms();
      refreshServerCookie(); // after the cookie write; the plugin's URL is on the page by now
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
    else onReady();

    var g = grab();
    dl().push({
      event: cfg.eventPrefix + '.ready',
      vz_attribution: {
        anonymous_id: g.anonymous_id,
        first_source: g.first.utm.source, first_medium: g.first.utm.medium, first_campaign: g.first.utm.campaign,
        last_source: g.last.utm.source, last_medium: g.last.utm.medium, last_campaign: g.last.utm.campaign,
        new_touch: pageNewTouch, collector: collectorOn()
      },
      vz_attribution_data: snapshot()
    });

    return api;
  }

  // Consent: call setConsent(false) to stop storing and delete the cookie;
  // setConsent(true) to (re)enable storage.
  function setConsent(granted) {
    if (!cfg) return;
    cfg.storage = !!granted;
    if (granted) { persist(); refreshServerCookie(); flushPending(); }
    else writeCookie(cfg.cookieName, '', 0, cookieDomain);
  }

  // Ad consent (ad_storage) gates only the collector, not the cookie or form fill.
  function setAdConsent(granted) {
    if (!cfg) return;
    adConsent = !!granted;
    if (granted) flushPending();
  }

  // Send a custom event to the platform, e.g. track('pageview') after an SPA route change
  function track(type, props) {
    if (!cfg || !type) return false;
    if (type === 'pageview') { resolve(); refreshServerCookie(); }
    return send(String(type), props);
  }

  // Quick health check for the console: VizAttribution.status()
  function status() {
    return {
      version: VERSION,
      consent: cfg ? !!cfg.storage : null,
      adConsent: adConsent,
      collector: cfg ? collectorOn() : false,
      serverCookie: serverCookieStatus,
      cookieDomain: cookieDomain
    };
  }

  var api = {
    version: VERSION,
    status: status,
    _initialized: false,
    init: init,
    grab: grab,
    values: values,
    fill: fill,
    setConsent: setConsent,
    setAdConsent: setAdConsent,
    track: track
  };

  window.VizAttribution = api;

  // Auto-init when a config object was provided before load (e.g. by the GTM template)
  if (window.vzAttributionConfig && window.vzAttributionConfig.autoInit !== false) init();

})(window, document);
