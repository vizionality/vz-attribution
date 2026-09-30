___TERMS_OF_SERVICE___

By creating or modifying this file you agree to Google Tag Manager's Community
Template Gallery Developer Terms of Service available at
https://developers.google.com/tag-manager/gallery-tos (or such other URL as
Google may provide), as modified from time to time.

___INFO___

{
  "type": "TAG",
  "id": "cvt_temp_public_id",
  "version": 1,
  "securityGroups": [],
  "displayName": "Vizionality Attribution",
  "categories": [
    "ATTRIBUTION",
    "LEAD_GENERATION",
    "ANALYTICS"
  ],
  "brand": {
    "id": "brand_dummy",
    "displayName": "Vizionality"
  },
  "description": "Stores first- and last-touch campaign data (UTMs, click IDs, referrer source) in a first-party cookie and fills it into hidden form fields. Works with HubSpot, Gravity Forms and ActiveCampaign. Optionally streams touches and pageviews to an attribution platform.",
  "containerContexts": [
    "WEB"
  ]
}


___TEMPLATE_PARAMETERS___

[
  {
    "type": "TEXT",
    "name": "scriptUrl",
    "displayName": "Library URL",
    "simpleValueType": true,
    "defaultValue": "https://cdn.jsdelivr.net/gh/vizionality/vz-attribution@1/dist/vz-attribution.min.js",
    "help": "Where vz-attribution.min.js is hosted. If you change the host, also update the 'Injects scripts' permission on the Permissions tab.",
    "valueValidators": [
      {
        "type": "NON_EMPTY"
      }
    ]
  },
  {
    "type": "GROUP",
    "name": "sessionGroup",
    "displayName": "Attribution",
    "groupStyle": "ZIPPY_OPEN",
    "subParams": [
      {
        "type": "TEXT",
        "name": "sessionMinutes",
        "displayName": "Session timeout (minutes)",
        "simpleValueType": true,
        "defaultValue": "30",
        "valueValidators": [
          {
            "type": "POSITIVE_NUMBER"
          }
        ]
      },
      {
        "type": "TEXT",
        "name": "firstTouchDays",
        "displayName": "First-touch cookie lifetime (days)",
        "simpleValueType": true,
        "defaultValue": "400",
        "help": "Browsers cap cookies at 400 days.",
        "valueValidators": [
          {
            "type": "POSITIVE_NUMBER"
          }
        ]
      },
      {
        "type": "CHECKBOX",
        "name": "lastNonDirect",
        "checkboxText": "Last non-direct: keep the previous campaign when a visitor returns directly after the session ends",
        "simpleValueType": true,
        "defaultValue": false
      },
      {
        "type": "TEXT",
        "name": "internalHosts",
        "displayName": "Additional internal hostnames (regex, one per line)",
        "simpleValueType": true,
        "defaultValue": "",
        "help": "Your own domain is detected automatically. Add other domains you own, e.g. shop\\.example\\.com$",
        "lineCount": 3
      },
      {
        "type": "TEXT",
        "name": "extraIgnoreReferrers",
        "displayName": "Additional referrers to ignore (regex, one per line)",
        "simpleValueType": true,
        "defaultValue": "",
        "help": "Referrers that should never start a new touch, e.g. payment gateways. PayPal, Stripe, HubSpot and SSO providers are ignored by default.",
        "lineCount": 3
      }
    ]
  },
  {
    "type": "GROUP",
    "name": "storageGroup",
    "displayName": "Storage & consent",
    "groupStyle": "ZIPPY_CLOSED",
    "subParams": [
      {
        "type": "TEXT",
        "name": "cookieName",
        "displayName": "Cookie name",
        "simpleValueType": true,
        "defaultValue": "vz_attr",
        "valueValidators": [
          {
            "type": "NON_EMPTY"
          }
        ]
      },
      {
        "type": "TEXT",
        "name": "cookieDomain",
        "displayName": "Cookie domain",
        "simpleValueType": true,
        "defaultValue": "auto",
        "help": "'auto' uses the top-level domain so subdomains share attribution. Leave empty for a host-only cookie."
      },
      {
        "type": "CHECKBOX",
        "name": "respectConsent",
        "checkboxText": "Only store the cookie when analytics_storage consent is granted (Google Consent Mode)",
        "simpleValueType": true,
        "defaultValue": true,
        "help": "Before consent, attribution is kept in memory for the page so forms still fill. The cookie is written as soon as consent is granted and deleted if it is revoked."
      }
    ]
  },
  {
    "type": "GROUP",
    "name": "fillGroup",
    "displayName": "Form filling",
    "groupStyle": "ZIPPY_CLOSED",
    "subParams": [
      {
        "type": "CHECKBOX",
        "name": "fillByName",
        "checkboxText": "Fill inputs whose name matches a field (e.g. name=\"utm_source\")",
        "simpleValueType": true,
        "defaultValue": true
      },
      {
        "type": "TEXT",
        "name": "classPrefix",
        "displayName": "CSS class prefix",
        "simpleValueType": true,
        "defaultValue": "vz-",
        "help": "Fills the input inside any element with class vz-<field>, e.g. vz-utm_source. Use this for Gravity Forms. Leave empty to disable."
      },
      {
        "type": "TEXT",
        "name": "attribute",
        "displayName": "Data attribute",
        "simpleValueType": true,
        "defaultValue": "data-vz",
        "help": "Fills inputs with data-vz=\"<field>\". Leave empty to disable."
      },
      {
        "type": "SELECT",
        "name": "overwrite",
        "displayName": "Overwrite behaviour",
        "macrosInSelect": false,
        "simpleValueType": true,
        "defaultValue": "hidden",
        "selectItems": [
          {
            "value": "hidden",
            "displayValue": "Overwrite hidden inputs, fill visible inputs only if empty"
          },
          {
            "value": "empty",
            "displayValue": "Only fill empty inputs"
          },
          {
            "value": "always",
            "displayValue": "Always overwrite"
          }
        ]
      },
      {
        "type": "CHECKBOX",
        "name": "observe",
        "checkboxText": "Watch for forms added after page load",
        "simpleValueType": true,
        "defaultValue": true
      },
      {
        "type": "SIMPLE_TABLE",
        "name": "fieldNames",
        "displayName": "Rename fields (optional)",
        "help": "Map a built-in field to a different input name, e.g. utm_source -> lead_source.",
        "simpleTableColumns": [
          {
            "defaultValue": "",
            "displayName": "Built-in field",
            "name": "from",
            "type": "TEXT"
          },
          {
            "defaultValue": "",
            "displayName": "Input name on your forms",
            "name": "to",
            "type": "TEXT"
          }
        ]
      }
    ]
  },
  {
    "type": "GROUP",
    "name": "collectorGroup",
    "displayName": "Platform collector (optional)",
    "groupStyle": "ZIPPY_CLOSED",
    "subParams": [
      {
        "type": "TEXT",
        "name": "collectorEndpoint",
        "displayName": "Collector endpoint",
        "simpleValueType": true,
        "defaultValue": "",
        "help": "Your attribution platform's ingest URL. Leave empty to run as a standalone form-attribution tool (nothing is sent anywhere)."
      },
      {
        "type": "TEXT",
        "name": "siteKey",
        "displayName": "Site key",
        "simpleValueType": true,
        "defaultValue": "",
        "help": "Public key the platform issued for this site."
      },
      {
        "type": "CHECKBOX",
        "name": "collectorPageviews",
        "checkboxText": "Send pageviews (needed to match calls to visits)",
        "simpleValueType": true,
        "defaultValue": true
      },
      {
        "type": "CHECKBOX",
        "name": "phoneClicks",
        "checkboxText": "Send an event when a tel: link is clicked",
        "simpleValueType": true,
        "defaultValue": true
      },
      {
        "type": "TEXT",
        "name": "numberSelector",
        "displayName": "Tracking number selector",
        "simpleValueType": true,
        "defaultValue": "a[href^=\"tel:\"]",
        "help": "CSS selector for the element that shows the call-tracking (DNI) number, e.g. .tracknotion-number"
      },
      {
        "type": "TEXT",
        "name": "dniWaitMs",
        "displayName": "Wait for number swap (ms)",
        "simpleValueType": true,
        "defaultValue": "2500",
        "help": "How long to wait for the call-tracking script to swap the number before sending the pageview. A quick exit sends immediately.",
        "valueValidators": [
          {
            "type": "POSITIVE_NUMBER"
          }
        ]
      },
      {
        "type": "CHECKBOX",
        "name": "requireAdConsent",
        "checkboxText": "Only send when ad_storage consent is granted (in addition to the cookie consent setting)",
        "simpleValueType": true,
        "defaultValue": true,
        "help": "Before consent, the current pageview is held in memory and sent the moment consent is granted."
      }
    ]
  },
  {
    "type": "GROUP",
    "name": "adapterGroup",
    "displayName": "Integrations",
    "groupStyle": "ZIPPY_CLOSED",
    "subParams": [
      {
        "type": "CHECKBOX",
        "name": "hubspot",
        "checkboxText": "HubSpot embedded forms (v4 and legacy)",
        "simpleValueType": true,
        "defaultValue": true
      },
      {
        "type": "TEXT",
        "name": "hubspotPrefix",
        "displayName": "HubSpot v4 field prefix",
        "simpleValueType": true,
        "defaultValue": "0-1/",
        "help": "0-1/ is the contact object. Change only if your fields map to another object."
      },
      {
        "type": "CHECKBOX",
        "name": "gravityForms",
        "checkboxText": "Gravity Forms (re-fill after AJAX re-renders)",
        "simpleValueType": true,
        "defaultValue": true
      },
      {
        "type": "CHECKBOX",
        "name": "activecampaign",
        "checkboxText": "ActiveCampaign forms (fill inputs named field[ID])",
        "simpleValueType": true,
        "defaultValue": true
      },
      {
        "type": "SIMPLE_TABLE",
        "name": "activecampaignFields",
        "displayName": "ActiveCampaign field mapping",
        "help": "Map a built-in field to an ActiveCampaign custom field ID, e.g. utm_source -> 12 (fills the input named field[12]). Find the ID in the form's HTML or in Contacts -> Fields.",
        "simpleTableColumns": [
          {
            "defaultValue": "",
            "displayName": "Built-in field",
            "name": "from",
            "type": "TEXT"
          },
          {
            "defaultValue": "",
            "displayName": "ActiveCampaign field ID",
            "name": "to",
            "type": "TEXT"
          }
        ]
      },
      {
        "type": "CHECKBOX",
        "name": "compatCampaignCollector",
        "checkboxText": "Expose window._campaignCollector.alpha.grab() for scripts written for Campaign Collector",
        "simpleValueType": true,
        "defaultValue": false
      },
      {
        "type": "TEXT",
        "name": "ga4MeasurementId",
        "displayName": "GA4 measurement ID (optional)",
        "simpleValueType": true,
        "defaultValue": "",
        "help": "e.g. G-E2T8JBEDM6. Leave empty to auto-detect the first _ga_* cookie."
      },
      {
        "type": "TEXT",
        "name": "dataLayerName",
        "displayName": "dataLayer name",
        "simpleValueType": true,
        "defaultValue": "dataLayer",
        "valueValidators": [
          {
            "type": "NON_EMPTY"
          }
        ]
      }
    ]
  }
]


___SANDBOXED_JS_FOR_WEB_TEMPLATE___

const injectScript = require('injectScript');
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


___WEB_PERMISSIONS___

[
  {
    "instance": {
      "key": {
        "publicId": "inject_script",
        "versionId": "1"
      },
      "param": [
        {
          "key": "urls",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 1,
                "string": "https://cdn.jsdelivr.net/gh/vizionality/vz-attribution@*"
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "access_globals",
        "versionId": "1"
      },
      "param": [
        {
          "key": "keys",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "key"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  },
                  {
                    "type": 1,
                    "string": "execute"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "vzAttributionConfig"
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": false
                  }
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "key"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  },
                  {
                    "type": 1,
                    "string": "execute"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "VizAttribution"
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": false
                  },
                  {
                    "type": 8,
                    "boolean": false
                  }
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "key"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  },
                  {
                    "type": 1,
                    "string": "execute"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "VizAttribution.setConsent"
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": false
                  },
                  {
                    "type": 8,
                    "boolean": true
                  }
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "key"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  },
                  {
                    "type": 1,
                    "string": "execute"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "VizAttribution.setAdConsent"
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": false
                  },
                  {
                    "type": 8,
                    "boolean": true
                  }
                ]
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "access_consent",
        "versionId": "1"
      },
      "param": [
        {
          "key": "consentTypes",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "consentType"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "analytics_storage"
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": false
                  }
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "consentType"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "ad_storage"
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": false
                  }
                ]
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "logging",
        "versionId": "1"
      },
      "param": [
        {
          "key": "environments",
          "value": {
            "type": 1,
            "string": "debug"
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  }
]


___TESTS___

scenarios:
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


___NOTES___

Vizionality Attribution v1.1.0

