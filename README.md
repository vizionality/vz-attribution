# Vizionality Attribution

First- and last-touch campaign attribution for lead forms. Captures UTMs, ad click IDs and referrer source into a first-party cookie, then fills them into hidden form fields so every lead in the CRM carries its source.

It runs in two modes:

- **Standalone** (default): cookie + form fill only. Nothing leaves the browser.
- **Platform**: set a collector endpoint and it also streams every touch, pageview and phone-link click to your attribution platform, including the call-tracking (DNI) number each visitor saw. That is what lets the platform match phone calls and CRM deals back to the visit and ad click that produced them.

| Piece | Path | What it is |
|---|---|---|
| Library | `src/vz-attribution.js` → `dist/vz-attribution.min.js` | The script that does the work (~4 KB gzipped) |
| GTM template | `gtm/template.tpl` | Native, sandboxed GTM tag that configures and loads the library |
| WordPress plugin | `wordpress/vz-attribution-gravityforms/` | Adds the hidden inputs to every Gravity Forms form and saves values as entry meta |
| Tests | `test/` | 70 browser tests (Playwright) + 13 plugin tests |

## What it captures

| Field (input name) | Value |
|---|---|
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id` | Last touch (current session) |
| same + `_1st` (e.g. `utm_source_1st`) | First touch (original visit) |
| `landing_page`, `landing_page_1st`, `referrer`, `referrer_1st` | Landing URL and referring host |
| `gclid`, `gbraid`, `wbraid`, `dclid` | Google Ads (from `_gcl_*` cookies, falling back to the URL) |
| `msclkid` | Microsoft Ads |
| `fbclid`, `_fbc`, `_fbp` | Meta (`_fbc` is built from `fbclid` if the pixel hasn't set it) |
| `li_fat_id`, `ttclid` | LinkedIn, TikTok |
| `ga_client_id`, `ga_session_id` | GA4 |
| `vz_anonymous_id` | Persistent visitor ID |
| `vz_attribution_json` | Full first/last touch as JSON |

**Touch rules**

- UTMs or a click ID in the URL → new touch. A click ID without UTMs infers source/medium (`gclid` → google / cpc).
- External referrer with no UTMs → classified as `organic` (search engines), `ai` (ChatGPT, Perplexity, Gemini, Claude, Copilot…), `social`, or `referral` (the hostname).
- Internal pages, payment gateways (PayPal, Stripe), SSO providers and GTM Preview (Tag Assistant) never start a new touch.
- Session = 30 min of inactivity. A direct return after the session ends sets last touch to `(direct) / (none)`, or keeps the previous campaign with `lastNonDirect: true`.
- First touch is set once and kept 400 days (the browser maximum).

## 1. Publish the library (one time)

1. Create a **public** GitHub repo, e.g. `github.com/vizionality/vz-attribution`, and push this folder.
2. Run `npm install && npm test` to build `dist/` and run the tests.
3. Tag a release: `git tag v1.0.0 && git push --tags`.
4. It's now served free by jsDelivr:
   `https://cdn.jsdelivr.net/gh/vizionality/vz-attribution@1/dist/vz-attribution.min.js`
   (`@1` = latest 1.x.x tag. Pin `@1.0.0` for clients where you want no automatic updates.)

If the GitHub org isn't `vizionality`, replace it in `gtm/build_template.py` (both URL constants), run `python3 gtm/build_template.py`, and update the plugin header's `GitHub Plugin URI`.

Prefer not to depend on jsDelivr? Upload `dist/vz-attribution.min.js` to any host you control and change the template's **Library URL** and its **Injects scripts** permission.

## 2. Add it to a client's GTM container

1. **Templates → Tag Templates → New → ⋮ → Import** → `gtm/template.tpl` → Save.
2. **Tags → New → Vizionality Attribution**.
3. Trigger: **Initialization – All Pages**.
4. Settings to check per client:
   - **GA4 measurement ID** if the site has more than one GA4 property (otherwise auto-detected).
   - **Additional internal hostnames** for other domains the client owns (checkout, booking or app domains).
   - **Consent**: "Only store the cookie when analytics_storage consent is granted" is on by default. Forms still fill before consent; the cookie is written once consent is granted.
5. Preview → visit with `?utm_source=test&utm_medium=cpc&utm_campaign=vz_test` → confirm the `vz_attribution.ready` event and that form fields are filled → Publish.

**dataLayer events** for triggers and variables: `vz_attribution.ready` (with a `vz_attribution` object: first/last source, medium, campaign, anonymous ID, `new_touch`, `collector`), `vz_attribution.fill`, and `vz_attribution.sent` (collector only, with `vz_sent_type`).

Both `vz_attribution.ready` and `vz_attribution.fill` also carry `vz_attribution_data`, the full snapshot:

| Key | What it is |
|---|---|
| `anonymous_id` | Persistent visitor ID (`VZ.1.<ms timestamp>.<random>`) |
| `first` / `last` | Each touch: `utm` (source, medium, campaign, term, content…), `click` (click IDs from the URL), `landing_page`, `referrer`, `_set` (when the touch started, Unix seconds), `_exp` (on `last`: when the session expires) |
| `cookies` | Raw values of `_ga`, `_ga_<ID>`, `_gcl_aw`, `_gcl_ag`, `_gcl_gb`, `_gcl_dc`, `_uetmsclkid`, `_fbc`, `_fbp`, `li_fat_id`, `_ttp` (empty string when not set) |
| `ids` | The same cookies parsed: `ga_client_id`, `ga_session_id`, `gclid`, `gbraid`, `wbraid`, `dclid`, `msclkid`, … |
| `new_touch` | `true` when this page started a new touch |

Use a Data Layer Variable such as `vz_attribution_data.last.utm.source` in GTM.

## 3. Connect the forms

**HubSpot embedded forms**: create contact properties whose internal names match the fields (`utm_source`, `utm_source_1st`, `gclid`, …), add them to the form as hidden fields. The library fills v4 and legacy (non-iframe) embeds automatically. Forms rendered inside an iframe can't be filled from the page.

**Gravity Forms**: two options.
- **Plugin (recommended):** zip `wordpress/vz-attribution-gravityforms/` and install it. Every form gets the hidden inputs automatically; values are saved as entry meta, shown on the entry screen, available in exports, and usable in notifications with merge tags like `{vz:utm_source}`.
- **No plugin:** add a Hidden (or Single Line Text with Visibility: Hidden) field per value and set **Custom CSS Class** to `vz-<field>`, e.g. `vz-utm_source`.

**Any other form** (Webflow, Elementor, custom HTML): add hidden inputs named after the fields, or put `data-vz="utm_source"` / class `vz-utm_source` on the input or its wrapper.

**ActiveCampaign forms**: ActiveCampaign names custom fields `field[ID]`, so use the template's **ActiveCampaign field mapping** table (Integrations group) instead of renames:

1. In ActiveCampaign, create contact custom fields (Contacts → Fields). Recommended set: `vz_anonymous_id`, `gclid`, `_fbc`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_source_1st`, `utm_medium_1st`, `utm_campaign_1st`, `landing_page_1st`.
2. Add them to the form as hidden fields.
3. Find each field's ID (inspect the embedded form: `<input type="hidden" name="field[12]">`, or the field's ID in Contacts → Fields).
4. In the table, map built-in field → ID, e.g. `utm_source` → `12`. Full names like `field[12]` also work.

Embeds that load after the page (the JavaScript embed) are filled automatically. The mapping uses built-in names, so it works alongside renames for other forms on the same site. When the platform connects to ActiveCampaign with an API key, it can create these fields and generate the mapping for you.

Rename fields to match an existing CRM with the template's **Rename fields** table (e.g. `utm_source` → `lead_source`).

### Plugin filters

```php
// Add or remove fields for all forms
add_filter('vz_attribution/fields', function ($fields) {
    unset($fields['ttclid']);
    $fields['partner_id'] = 'Partner ID';
    return $fields;
});

// Per form
add_filter('vz_attribution/fields/form/3', fn($fields, $form_id) => $fields, 10, 2);

// Disable on a form
add_filter('vz_attribution/enabled/form/7', '__return_false');

// Load the library from WordPress instead of GTM (wp-config.php)
define('VZ_ATTRIBUTION_SCRIPT_URL', 'https://cdn.jsdelivr.net/gh/vizionality/vz-attribution@1/dist/vz-attribution.min.js');
add_filter('vz_attribution/config', fn() => ['sessionMinutes' => 30]);
```

The plugin never fills values server-side (so page caching can't leak one visitor's UTMs to another) and makes no outbound requests. For automatic updates, use [Git Updater](https://git-updater.com/) with the `GitHub Plugin URI` header, or update manually.

## 4. Platform collector (optional)

Set **Collector endpoint** and **Site key** in the template's *Platform collector* group. With no endpoint, nothing is ever sent.

**What gets sent** (JSON, `POST` as `text/plain` via `sendBeacon`, so no CORS preflight):

| Event | When |
|---|---|
| `pageview` | Every page, after waiting **dniWaitMs** (default 2500) for the call-tracking script to swap in its number. A quick exit (`pagehide`) sends immediately, never twice. |
| `phone_click` | A `tel:` link is clicked. `props.number` is the number clicked (strong signal for matching mobile calls). |
| custom | Anything you send with `VizAttribution.track('name', { ...props })`. |

```json
{
  "v": 1, "sdk": "vz-attribution/1.1.0+gtm-template", "site_key": "site_abc",
  "event_id": "m1x2y3...", "type": "pageview", "ts": 1790000000000,
  "anonymous_id": "VZ.1.1790000000000.k3j2h1g5f4",
  "page": { "url": "https://www.client.com/services", "path": "/services", "title": "...", "referrer": "www.google.com" },
  "new_session": true, "new_touch": true,
  "touch": {
    "first": { "utm": { "source": "google", "medium": "cpc", "campaign": "hvac" }, "click": { "gclid": "..." }, "landing_page": "...", "referrer": "", "set_at": 1790000000 },
    "last":  { "utm": { "...": "..." }, "click": {}, "landing_page": "...", "referrer": "", "set_at": 1790000000 }
  },
  "ids": { "gclid": "...", "_fbc": "...", "_fbp": "...", "ga_client_id": "...", "ga_session_id": "..." },
  "tracking_number": "+16125550199",
  "props": {}
}
```

- **Call matching:** the platform stores `(tracking_number, anonymous_id, ts)` for every pageview. When a call arrives from the call tracker (e.g. TrackNotion via Zapier), it looks up who was viewing that number just before the call started.
- **Tracking number selector:** defaults to the first `a[href^="tel:"]`. If the DNI number is shown elsewhere, set a selector like `.tracknotion-number`. Numbers are normalized to digits (`+16125550199`).
- **Page URLs** are sent without query strings or fragments, so form data in URLs never reaches the platform.
- **Consent:** the collector sends only when the cookie is allowed (analytics_storage, if **Only store the cookie…** is on) *and*, when **Only send when ad_storage consent is granted** is on, ad consent is granted. The current pageview is held in memory and sent the moment consent is granted. Phone clicks before consent are dropped. The cookie and form fill still work with ad consent denied.
- **SPAs:** call `VizAttribution.track('pageview')` after a route change. It re-reads UTMs from the new URL before sending.
- **Endpoint requirements:** accept `POST` with a `text/plain` JSON body, respond `204`, and allow any origin (beacons don't read the response). Validate `site_key` against the request's `Origin`/`Referer` and dedupe on `event_id`.

## JavaScript API

```js
VizAttribution.init({ ...options })   // only needed when not using the GTM template
VizAttribution.grab()                  // { anonymous_id, first, last, cookies }
VizAttribution.values()                // flat { field: value } map used for filling
VizAttribution.fill(rootElement?)      // fill forms now (e.g. after a custom modal opens)
VizAttribution.setConsent(true|false)  // start storing / delete the cookie (also gates the collector)
VizAttribution.setAdConsent(true|false)// collector only: allow/deny sending to the platform
VizAttribution.track(type, props?)     // collector only: send a custom event, or 'pageview' for SPAs
```

Options (all optional): `cookieName`, `cookieDomain` (`'auto'`), `sessionMinutes`, `firstTouchDays`, `lastNonDirect`, `storage`, `internalHosts`, `ignoreReferrers`, `extraIgnoreReferrers`, `ga4MeasurementId`, `fieldNames`, `fill.{byName, classPrefix, attribute, overwrite, observe}`, `adapters.{hubspot, hubspotPrefix, gravityForms, activecampaign, activecampaignFields}`, `collector.{endpoint, siteKey, pageviews, phoneClicks, numberSelector, dniWaitMs, adConsent}`, `dataLayerName`, `eventPrefix`, `compatCampaignCollector`, `rules`. Defaults are at the top of `src/vz-attribution.js`.

## Migrating a site from Campaign Collector

Tick **Expose window._campaignCollector.alpha.grab()** in the template so existing listener scripts keep working, then pause the Campaign Collector tag. Visitors start with fresh first-touch data because the cookie is new.

## Community Template Gallery (optional)

To list the template publicly: put `template.tpl`, `metadata.yaml` and the `LICENSE` in the root of a public repo, then submit it through Google's gallery process ([requirements](https://developers.google.com/tag-platform/tag-manager/templates/gallery)). Importing the `.tpl` directly works without this.

## Privacy

In platform mode, pageviews with the anonymous ID, click IDs and page path are sent to your endpoint, so name the platform as a processor in the client's privacy policy.

The anonymous ID and click IDs are pseudonymous identifiers and count as personal data under GDPR/CCPA-style laws, especially once joined to a form submission. Keep consent gating on for sites with EU/UK/California traffic and mention the `vz_attr` cookie in the client's cookie policy.
