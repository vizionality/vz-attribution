import json
URL_DEFAULT = "https://cdn.jsdelivr.net/gh/vizionality/vz-attribution@1/dist/vz-attribution.min.js"
URL_PATTERN = "https://cdn.jsdelivr.net/gh/vizionality/vz-attribution@*"

def text(name, label, default=None, help=None, validators=None, lines=None, **kw):
    p = {"type": "TEXT", "name": name, "displayName": label, "simpleValueType": True}
    if default is not None: p["defaultValue"] = default
    if help: p["help"] = help
    if validators: p["valueValidators"] = validators
    if lines: p["lineCount"] = lines
    p.update(kw); return p
def check(name, label, default, help=None):
    p = {"type": "CHECKBOX", "name": name, "checkboxText": label, "simpleValueType": True, "defaultValue": default}
    if help: p["help"] = help
    return p
def group(name, label, sub, style="ZIPPY_CLOSED"):
    return {"type": "GROUP", "name": name, "displayName": label, "groupStyle": style, "subParams": sub}

params = [
  text("scriptUrl", "Library URL", URL_DEFAULT,
       "Where vz-attribution.min.js is hosted. If you change the host, also update the 'Injects scripts' permission on the Permissions tab.",
       [{"type": "NON_EMPTY"}]),
  group("sessionGroup", "Attribution", [
    text("sessionMinutes", "Session timeout (minutes)", "30", validators=[{"type": "POSITIVE_NUMBER"}]),
    text("firstTouchDays", "First-touch cookie lifetime (days)", "400",
         "Browsers cap cookies at 400 days.", [{"type": "POSITIVE_NUMBER"}]),
    check("lastNonDirect", "Last non-direct: keep the previous campaign when a visitor returns directly after the session ends", False),
    text("internalHosts", "Additional internal hostnames (regex, one per line)", "",
         "Your own domain is detected automatically. Add other domains you own, e.g. shop\\.example\\.com$", lines=3),
    text("extraIgnoreReferrers", "Additional referrers to ignore (regex, one per line)", "",
         "Referrers that should never start a new touch, e.g. payment gateways. PayPal, Stripe, HubSpot and SSO providers are ignored by default.", lines=3),
  ], "ZIPPY_OPEN"),
  group("storageGroup", "Storage & consent", [
    text("cookieName", "Cookie name", "vz_attr", validators=[{"type": "NON_EMPTY"}]),
    text("cookieDomain", "Cookie domain", "auto", "'auto' uses the top-level domain so subdomains share attribution. Leave empty for a host-only cookie."),
    check("respectConsent", "Only store the cookie when analytics_storage consent is granted (Google Consent Mode)", True,
          "Before consent, attribution is kept in memory for the page so forms still fill. The cookie is written as soon as consent is granted and deleted if it is revoked."),
  ]),
  group("fillGroup", "Form filling", [
    check("fillByName", "Fill inputs whose name matches a field (e.g. name=\"utm_source\")", True),
    text("classPrefix", "CSS class prefix", "vz-", "Fills the input inside any element with class vz-<field>, e.g. vz-utm_source. Use this for Gravity Forms. Leave empty to disable."),
    text("attribute", "Data attribute", "data-vz", "Fills inputs with data-vz=\"<field>\". Leave empty to disable."),
    {"type": "SELECT", "name": "overwrite", "displayName": "Overwrite behaviour", "macrosInSelect": False, "simpleValueType": True,
     "defaultValue": "hidden", "selectItems": [
       {"value": "hidden", "displayValue": "Overwrite hidden inputs, fill visible inputs only if empty"},
       {"value": "empty", "displayValue": "Only fill empty inputs"},
       {"value": "always", "displayValue": "Always overwrite"}]},
    check("observe", "Watch for forms added after page load", True),
    {"type": "SIMPLE_TABLE", "name": "fieldNames", "displayName": "Rename fields (optional)",
     "help": "Map a built-in field to a different input name, e.g. utm_source -> lead_source.",
     "simpleTableColumns": [
       {"defaultValue": "", "displayName": "Built-in field", "name": "from", "type": "TEXT"},
       {"defaultValue": "", "displayName": "Input name on your forms", "name": "to", "type": "TEXT"}]},
  ]),
  group("collectorGroup", "Platform collector (optional)", [
    text("collectorEndpoint", "Collector endpoint", "",
         "Your attribution platform's ingest URL. Leave empty to run as a standalone form-attribution tool (nothing is sent anywhere)."),
    text("siteKey", "Site key", "", "Public key the platform issued for this site."),
    check("collectorPageviews", "Send pageviews (needed to match calls to visits)", True),
    check("phoneClicks", "Send an event when a tel: link is clicked", True),
    text("numberSelector", "Tracking number selector", "a[href^=\"tel:\"]",
         "CSS selector for the element that shows the call-tracking (DNI) number, e.g. .tracknotion-number"),
    text("dniWaitMs", "Wait for number swap (ms)", "2500",
         "How long to wait for the call-tracking script to swap the number before sending the pageview. A quick exit sends immediately.",
         [{"type": "POSITIVE_NUMBER"}]),
    check("requireAdConsent", "Only send when ad_storage consent is granted (in addition to the cookie consent setting)", True,
          "Before consent, the current pageview is held in memory and sent the moment consent is granted."),
  ]),
  group("adapterGroup", "Integrations", [
    check("hubspot", "HubSpot embedded forms (v4 and legacy)", True),
    text("hubspotPrefix", "HubSpot v4 field prefix", "0-1/", "0-1/ is the contact object. Change only if your fields map to another object."),
    check("gravityForms", "Gravity Forms (re-fill after AJAX re-renders)", True),
    check("activecampaign", "ActiveCampaign forms (fill inputs named field[ID])", True),
    {"type": "SIMPLE_TABLE", "name": "activecampaignFields", "displayName": "ActiveCampaign field mapping",
     "help": "Map a built-in field to an ActiveCampaign custom field ID, e.g. utm_source -> 12 (fills the input named field[12]). Find the ID in the form's HTML or in Contacts -> Fields.",
     "simpleTableColumns": [
       {"defaultValue": "", "displayName": "Built-in field", "name": "from", "type": "TEXT"},
       {"defaultValue": "", "displayName": "ActiveCampaign field ID", "name": "to", "type": "TEXT"}]},
    check("compatCampaignCollector", "Expose window._campaignCollector.alpha.grab() for scripts written for Campaign Collector", False),
    text("ga4MeasurementId", "GA4 measurement ID (optional)", "", "e.g. G-E2T8JBEDM6. Leave empty to auto-detect the first _ga_* cookie."),
    text("dataLayerName", "dataLayer name", "dataLayer", validators=[{"type": "NON_EMPTY"}]),
  ]),
]

code = r"""const injectScript = require('injectScript');
const setInWindow = require('setInWindow');
const copyFromWindow = require('copyFromWindow');
const callInWindow = require('callInWindow');
const isConsentGranted = require('isConsentGranted');
const addConsentListener = require('addConsentListener');
const makeTableMap = require('makeTableMap');
const makeNumber = require('makeNumber');
const log = require('logToConsole');

const lines = (value) => (value || '')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const existing = copyFromWindow('VizAttribution');
if (existing && existing._initialized) {
  log('Vizionality Attribution: already initialized');
  data.gtmOnSuccess();
  return;
}

let adConsent = true;
if (data.collectorEndpoint && data.requireAdConsent) {
  adConsent = isConsentGranted('ad_storage');
  addConsentListener('ad_storage', (consentType, granted) => {
    callInWindow('VizAttribution.setAdConsent', granted);
  });
}

let storage = true;
if (data.respectConsent) {
  storage = isConsentGranted('analytics_storage');
  addConsentListener('analytics_storage', (consentType, granted) => {
    callInWindow('VizAttribution.setConsent', granted);
  });
}

const config = {
  cookieName: data.cookieName,
  cookieDomain: data.cookieDomain || '',
  sessionMinutes: makeNumber(data.sessionMinutes) || 30,
  firstTouchDays: makeNumber(data.firstTouchDays) || 400,
  lastNonDirect: data.lastNonDirect === true,
  storage: storage,
  internalHosts: lines(data.internalHosts),
  extraIgnoreReferrers: lines(data.extraIgnoreReferrers),
  ga4MeasurementId: data.ga4MeasurementId || '',
  fieldNames: data.fieldNames ? makeTableMap(data.fieldNames, 'from', 'to') : {},
  fill: {
    byName: data.fillByName === true,
    classPrefix: data.classPrefix || '',
    attribute: data.attribute || '',
    overwrite: data.overwrite || 'hidden',
    observe: data.observe === true
  },
  adapters: {
    hubspot: data.hubspot === true,
    hubspotPrefix: data.hubspotPrefix || '0-1/',
    gravityForms: data.gravityForms === true,
    activecampaign: data.activecampaign === true,
    activecampaignFields: data.activecampaignFields ? makeTableMap(data.activecampaignFields, 'from', 'to') : {}
  },
  collector: {
    endpoint: data.collectorEndpoint || '',
    siteKey: data.siteKey || '',
    pageviews: data.collectorPageviews === true,
    phoneClicks: data.phoneClicks === true,
    numberSelector: data.numberSelector || '',
    dniWaitMs: makeNumber(data.dniWaitMs) || 2500,
    adConsent: adConsent
  },
  dataLayerName: data.dataLayerName || 'dataLayer',
  compatCampaignCollector: data.compatCampaignCollector === true,
  sdk: 'gtm-template'
};

setInWindow('vzAttributionConfig', config, true);
log('Vizionality Attribution: loading', data.scriptUrl, config);

injectScript(data.scriptUrl, data.gtmOnSuccess, data.gtmOnFailure, 'vzAttribution');
"""

def gk(key, read, write, execute):
    return {"type": 3, "mapKey": [{"type": 1, "string": k} for k in ("key", "read", "write", "execute")],
            "mapValue": [{"type": 1, "string": key}, {"type": 8, "boolean": read}, {"type": 8, "boolean": write}, {"type": 8, "boolean": execute}]}
def perm(pid, param):
    return {"instance": {"key": {"publicId": pid, "versionId": "1"}, "param": param},
            "clientAnnotations": {"isEditedByUser": True}, "isRequired": True}

perms = [
  perm("inject_script", [{"key": "urls", "value": {"type": 2, "listItem": [{"type": 1, "string": URL_PATTERN}]}}]),
  perm("access_globals", [{"key": "keys", "value": {"type": 2, "listItem": [
      gk("vzAttributionConfig", True, True, False),
      gk("VizAttribution", True, False, False),
      gk("VizAttribution.setConsent", True, False, True),
      gk("VizAttribution.setAdConsent", True, False, True)]}}]),
  perm("access_consent", [{"key": "consentTypes", "value": {"type": 2, "listItem": [
      {"type": 3, "mapKey": [{"type": 1, "string": "consentType"}, {"type": 1, "string": "read"}, {"type": 1, "string": "write"}],
       "mapValue": [{"type": 1, "string": "analytics_storage"}, {"type": 8, "boolean": True}, {"type": 8, "boolean": False}]},
      {"type": 3, "mapKey": [{"type": 1, "string": "consentType"}, {"type": 1, "string": "read"}, {"type": 1, "string": "write"}],
       "mapValue": [{"type": 1, "string": "ad_storage"}, {"type": 8, "boolean": True}, {"type": 8, "boolean": False}]}]}}]),
  perm("logging", [{"key": "environments", "value": {"type": 1, "string": "debug"}}]),
]

info = {
  "type": "TAG", "id": "cvt_temp_public_id", "version": 1, "securityGroups": [],
  "displayName": "Vizionality Attribution",
  "categories": ["ATTRIBUTION", "LEAD_GENERATION", "ANALYTICS"],
  "brand": {"id": "brand_dummy", "displayName": "Vizionality"},
  "description": "Stores first- and last-touch campaign data (UTMs, click IDs, referrer source) in a first-party cookie and fills it into hidden form fields. Works with HubSpot, Gravity Forms and ActiveCampaign. Optionally streams touches and pageviews to an attribution platform.",
  "containerContexts": ["WEB"]
}

tests = """scenarios:
- name: Injects library and sets config
  code: |-
    const mockData = {
      scriptUrl: 'https://cdn.jsdelivr.net/gh/vizionality/vz-attribution@1/dist/vz-attribution.min.js',
      cookieName: 'vz_attr', cookieDomain: 'auto', sessionMinutes: '30', firstTouchDays: '400',
      respectConsent: false, fillByName: true, classPrefix: 'vz-', attribute: 'data-vz',
      overwrite: 'hidden', observe: true, hubspot: true, hubspotPrefix: '0-1/', gravityForms: true,
      dataLayerName: 'dataLayer'
    };
    let injectedUrl;
    mock('injectScript', (url, onSuccess) => { injectedUrl = url; onSuccess(); });
    runCode(mockData);
    assertThat(injectedUrl).isEqualTo(mockData.scriptUrl);
    assertApi('setInWindow').wasCalled();
    assertApi('gtmOnSuccess').wasCalled();
- name: Skips when already initialized
  code: |-
    mock('copyFromWindow', (key) => key === 'VizAttribution' ? { _initialized: true } : undefined);
    runCode({ scriptUrl: 'https://cdn.jsdelivr.net/gh/vizionality/vz-attribution@1/dist/vz-attribution.min.js' });
    assertApi('injectScript').wasNotCalled();
    assertApi('gtmOnSuccess').wasCalled();
- name: Collector and ActiveCampaign config passed through, ad consent read
  code: |-
    let cfg;
    mock('setInWindow', (key, value) => { if (key === 'vzAttributionConfig') cfg = value; });
    mock('isConsentGranted', (type) => type !== 'ad_storage');
    mock('injectScript', (url, onSuccess) => { onSuccess(); });
    runCode({
      scriptUrl: 'https://cdn.jsdelivr.net/gh/vizionality/vz-attribution@1/dist/vz-attribution.min.js',
      cookieName: 'vz_attr', sessionMinutes: '30', firstTouchDays: '400', respectConsent: true,
      collectorEndpoint: 'https://collect.example.com/v1/collect', siteKey: 'site_abc',
      collectorPageviews: true, phoneClicks: true, numberSelector: '.dni', dniWaitMs: '1500', requireAdConsent: true,
      activecampaign: true, activecampaignFields: [{ from: 'utm_source', to: '12' }]
    });
    assertThat(cfg.collector.endpoint).isEqualTo('https://collect.example.com/v1/collect');
    assertThat(cfg.collector.siteKey).isEqualTo('site_abc');
    assertThat(cfg.collector.dniWaitMs).isEqualTo(1500);
    assertThat(cfg.collector.adConsent).isEqualTo(false);
    assertThat(cfg.storage).isEqualTo(true);
    assertThat(cfg.adapters.activecampaignFields.utm_source).isEqualTo('12');
    assertApi('gtmOnSuccess').wasCalled();
"""

out = []
out.append("""___TERMS_OF_SERVICE___

By creating or modifying this file you agree to Google Tag Manager's Community
Template Gallery Developer Terms of Service available at
https://developers.google.com/tag-manager/gallery-tos (or such other URL as
Google may provide), as modified from time to time.

""")
out.append("___INFO___\n\n" + json.dumps(info, indent=2) + "\n\n\n")
out.append("___TEMPLATE_PARAMETERS___\n\n" + json.dumps(params, indent=2) + "\n\n\n")
out.append("___SANDBOXED_JS_FOR_WEB_TEMPLATE___\n\n" + code + "\n\n")
out.append("___WEB_PERMISSIONS___\n\n" + json.dumps(perms, indent=2) + "\n\n\n")
out.append("___TESTS___\n\n" + tests + "\n\n")
out.append("___NOTES___\n\nVizionality Attribution v1.1.0\n\n")
open(__import__("os").path.join(__import__("os").path.dirname(__file__), "template.tpl"), "w").write("".join(out))
print("ok")
