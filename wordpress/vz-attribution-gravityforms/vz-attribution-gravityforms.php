<?php
/**
 * Plugin Name:       Vizionality Attribution for Gravity Forms
 * Description:       Adds campaign attribution hidden fields to every Gravity Forms form and saves them as entry meta. Values are filled in the browser by the Vizionality Attribution library (vz-attribution.js). Also re-sets the attribution cookie from the server so Safari keeps it for 400 days instead of 7.
 * Version:           1.1.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * Author:            Vizionality
 * License:           MIT
 * GitHub Plugin URI: vizionality/vz-attribution
 * Primary Branch:    main
 */

namespace Vizionality\Attribution;

if (!defined('ABSPATH')) {
    exit;
}

final class GravityForms
{
    const VERSION   = '1.1.0';
    const META_NS   = 'vz';               // entry meta keys are stored as vz:<field>
    const HOOK_NS   = 'vz_attribution';   // filter prefix
    const MAX_LEN   = 500;
    const MAX_JSON  = 8000;

    /** Default fields. Keys are input names filled by vz-attribution.js. */
    const DEFAULT_FIELDS = [
        'vz_anonymous_id'      => 'Attribution: Anonymous ID',
        'vz_attribution_json'  => 'Attribution: Full JSON',

        'utm_source'           => 'Source (last touch)',
        'utm_medium'           => 'Medium (last touch)',
        'utm_campaign'         => 'Campaign (last touch)',
        'utm_term'             => 'Term (last touch)',
        'utm_content'          => 'Content (last touch)',
        'utm_id'               => 'Campaign ID (last touch)',
        'landing_page'         => 'Landing page (last touch)',
        'referrer'             => 'Referrer (last touch)',

        'utm_source_1st'       => 'Source (first touch)',
        'utm_medium_1st'       => 'Medium (first touch)',
        'utm_campaign_1st'     => 'Campaign (first touch)',
        'utm_term_1st'         => 'Term (first touch)',
        'utm_content_1st'      => 'Content (first touch)',
        'landing_page_1st'     => 'Landing page (first touch)',
        'referrer_1st'         => 'Referrer (first touch)',

        'gclid'                => 'Google Ads: gclid',
        'gbraid'               => 'Google Ads: gbraid',
        'wbraid'               => 'Google Ads: wbraid',
        'msclkid'              => 'Microsoft Ads: msclkid',
        'fbclid'               => 'Meta: fbclid',
        '_fbc'                 => 'Meta: _fbc',
        '_fbp'                 => 'Meta: _fbp',
        'li_fat_id'            => 'LinkedIn: li_fat_id',
        'ttclid'               => 'TikTok: ttclid',
        'ga_client_id'         => 'GA4: Client ID',
        'ga_session_id'        => 'GA4: Session ID',
    ];

    const JSON_FIELDS = ['vz_attribution_json'];

    // Server-side cookie refresh (Safari ITP): POST /wp-json/vz/v1/cookie
    const REST_NS        = 'vz/v1';
    const REST_ROUTE     = '/cookie';
    const COOKIE_MAX_AGE = 34560000;  // 400 days, the browser maximum
    const COOKIE_MAX_LEN = 3800;

    private static $instance = null;

    public static function instance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct()
    {
        // Server cookie refresh works with or without Gravity Forms.
        add_action('rest_api_init', [$this, 'register_rest']);
        add_action('wp_head', [$this, 'print_server_cookie_url'], 1);

        if (did_action('gform_loaded')) {
            $this->register();
        } else {
            add_action('gform_loaded', [$this, 'register'], 5);
        }
    }

    public function register(): void
    {
        add_filter('gform_form_tag', [$this, 'add_hidden_inputs'], 20, 2);
        add_filter('gform_entry_meta', [$this, 'define_entry_meta'], 10, 2);
        add_filter('gform_custom_merge_tags', [$this, 'define_merge_tags'], 10, 4);
        add_filter('gform_replace_merge_tags', [$this, 'replace_merge_tags'], 10, 7);
        add_filter('gform_entry_detail_meta_boxes', [$this, 'entry_meta_box'], 10, 3);

        // Optional: load the library from WordPress instead of GTM.
        // define('VZ_ATTRIBUTION_SCRIPT_URL', 'https://cdn.jsdelivr.net/gh/vizionality/vz-attribution@1/dist/vz-attribution.min.js');
        if (defined('VZ_ATTRIBUTION_SCRIPT_URL') && VZ_ATTRIBUTION_SCRIPT_URL) {
            add_action('wp_enqueue_scripts', [$this, 'enqueue_library']);
        }
    }

    // -------------------------------------------------------------------------
    // Fields
    // -------------------------------------------------------------------------

    /**
     * Fields for a form. Filters:
     *   vz_attribution/fields                (array $fields)
     *   vz_attribution/fields/form/{form_id} (array $fields, int $form_id)
     */
    public function fields(int $form_id = 0): array
    {
        $fields = apply_filters(self::HOOK_NS . '/fields', self::DEFAULT_FIELDS);
        if ($form_id) {
            $fields = apply_filters(self::HOOK_NS . "/fields/form/{$form_id}", $fields, $form_id);
        }
        return is_array($fields) ? $fields : self::DEFAULT_FIELDS;
    }

    /** Disable per form: add_filter('vz_attribution/enabled/form/3', '__return_false'); */
    public function enabled(int $form_id): bool
    {
        return (bool) apply_filters(self::HOOK_NS . "/enabled/form/{$form_id}", true, $form_id);
    }

    public static function meta_key(string $field): string
    {
        return self::META_NS . ':' . $field;
    }

    // -------------------------------------------------------------------------
    // Front end
    // -------------------------------------------------------------------------

    /**
     * Empty hidden inputs. Values are set in the browser by vz-attribution.js,
     * never server-side, so full-page caching can't leak one visitor's data to another.
     */
    public function add_hidden_inputs(string $form_tag, array $form): string
    {
        $form_id = (int) rgar($form, 'id');
        if (!$this->enabled($form_id)) {
            return $form_tag;
        }

        $html = '<div class="vz-attribution-fields" style="display:none" aria-hidden="true">';
        foreach (array_keys($this->fields($form_id)) as $field) {
            $html .= '<input type="hidden" name="' . esc_attr($field) . '" value="" />';
        }
        $html .= '</div>';

        return $form_tag . $html;
    }

    public function enqueue_library(): void
    {
        wp_enqueue_script('vz-attribution', VZ_ATTRIBUTION_SCRIPT_URL, [], null, ['strategy' => 'async', 'in_footer' => false]);
        $config = apply_filters(self::HOOK_NS . '/config', []);
        wp_add_inline_script('vz-attribution', 'window.vzAttributionConfig=' . wp_json_encode((object) $config) . ';', 'before');
    }

    // -------------------------------------------------------------------------
    // Entry meta
    // -------------------------------------------------------------------------

    public function define_entry_meta(array $entry_meta, $form_id): array
    {
        $form_id = (int) $form_id;
        if ($form_id && !$this->enabled($form_id)) {
            return $entry_meta;
        }

        foreach ($this->fields($form_id) as $field => $label) {
            $entry_meta[self::meta_key($field)] = [
                'label'                      => $label,
                'is_numeric'                 => false,
                'is_default_column'          => false,
                'update_entry_meta_callback' => [$this, 'value_from_post'],
            ];
        }
        return $entry_meta;
    }

    /** Called by Gravity Forms when the entry is saved. */
    public function value_from_post($key, $entry, $form)
    {
        $field = substr((string) $key, strlen(self::META_NS) + 1);
        if (!array_key_exists($field, $this->fields((int) rgar($form, 'id')))) {
            return '';
        }

        // phpcs:ignore WordPress.Security.NonceVerification -- Gravity Forms verifies the submission.
        $raw = isset($_POST[$field]) ? wp_unslash($_POST[$field]) : '';
        if (!is_string($raw)) {
            return '';
        }

        return in_array($field, self::JSON_FIELDS, true)
            ? $this->clean_json($raw)
            : $this->clean_text($raw);
    }

    private function clean_text(string $value): string
    {
        $value = sanitize_text_field($value);
        return function_exists('mb_substr') ? mb_substr($value, 0, self::MAX_LEN) : substr($value, 0, self::MAX_LEN);
    }

    private function clean_json(string $value): string
    {
        if ($value === '' || strlen($value) > self::MAX_JSON) {
            return '';
        }
        $decoded = json_decode($value, true);
        if (!is_array($decoded)) {
            return '';
        }
        array_walk_recursive($decoded, function (&$v) {
            if (is_string($v)) {
                $v = sanitize_text_field($v);
            }
        });
        return (string) wp_json_encode($decoded);
    }

    // -------------------------------------------------------------------------
    // Server cookie refresh (Safari)
    //
    // Safari caps cookies written by JavaScript at 7 days (24 hours after an ad
    // click). Cookies set in an HTTP response from the site's own server are not
    // capped. vz-attribution.js POSTs here after every page load; this endpoint
    // reads the visitor's own vz_attr cookie from the request and sends the exact
    // same value back in a Set-Cookie header with a 400-day lifetime.
    //
    // Filters:
    //   vz_attribution/server_cookie        (bool)  false disables the endpoint
    //   vz_attribution/server_cookie/names  (array) cookie names allowed, default ['vz_attr']
    // -------------------------------------------------------------------------

    public function server_cookie_enabled(): bool
    {
        return (bool) apply_filters(self::HOOK_NS . '/server_cookie', true);
    }

    /** Same-origin path of the endpoint, e.g. /wp-json/vz/v1/cookie (or /?rest_route=... on plain permalinks). */
    public function server_cookie_path(): string
    {
        $parts = wp_parse_url(rest_url(self::REST_NS . self::REST_ROUTE));
        $path  = isset($parts['path']) ? $parts['path'] : '/';
        return $path . (isset($parts['query']) ? '?' . $parts['query'] : '');
    }

    /** Tells the library where the endpoint is. Static per site, so safe with page caching. */
    public function print_server_cookie_url(): void
    {
        if (!$this->server_cookie_enabled()) {
            return;
        }
        echo '<script>window.vzServerCookieUrl=' . wp_json_encode($this->server_cookie_path()) . ";</script>\n"; // phpcs:ignore WordPress.Security.EscapeOutput -- JSON-encoded
    }

    public function register_rest(): void
    {
        if (!$this->server_cookie_enabled()) {
            return;
        }
        register_rest_route(self::REST_NS, self::REST_ROUTE, [
            'methods'             => 'POST',
            'callback'            => [$this, 'rest_refresh_cookie'],
            'permission_callback' => '__return_true', // only ever echoes the caller's own cookie
        ]);
    }

    public function rest_refresh_cookie($request)
    {
        $body   = json_decode((string) $request->get_body(), true);
        $name   = is_array($body) && isset($body['name']) && is_string($body['name']) ? $body['name'] : 'vz_attr';
        $domain = is_array($body) && isset($body['domain']) && is_string($body['domain']) ? $body['domain'] : '';

        $header = $this->refresh_cookie_header(
            $name,
            $domain,
            isset($_SERVER['HTTP_COOKIE']) ? (string) $_SERVER['HTTP_COOKIE'] : '',
            isset($_SERVER['HTTP_HOST']) ? (string) $_SERVER['HTTP_HOST'] : '',
            is_ssl()
        );

        $response = new \WP_REST_Response(null, 204);
        $response->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, private');
        $response->header('X-VZ-Cookie', $header ? 'refreshed' : 'skipped');
        if ($header) {
            $response->header('Set-Cookie', $header);
        }
        return $response;
    }

    /**
     * Builds the Set-Cookie header, or null when nothing should be set.
     * Only re-sets a cookie the browser already sent, byte for byte, on this host or a parent domain of it.
     */
    public function refresh_cookie_header(string $name, string $domain, string $raw_cookies, string $host, bool $secure): ?string
    {
        if (!$this->server_cookie_enabled()) {
            return null;
        }
        $names = (array) apply_filters(self::HOOK_NS . '/server_cookie/names', ['vz_attr']);
        if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $name) || !in_array($name, $names, true)) {
            return null;
        }

        $value = self::raw_cookie($raw_cookies, $name);
        if ($value === null || $value === '' || strlen($value) > self::COOKIE_MAX_LEN || !preg_match('/^[A-Za-z0-9%._~-]+$/', $value)) {
            return null;
        }

        $host   = strtolower((string) preg_replace('/:\d+$/', '', trim($host)));
        $domain = strtolower(ltrim(trim($domain), '.'));
        $domain_attr = '';
        if ($domain !== '') {
            if ($host === '' || !($host === $domain || substr($host, -(strlen($domain) + 1)) === '.' . $domain)) {
                return null;
            }
            $domain_attr = '; Domain=.' . $domain;
        }

        return $name . '=' . $value .
            '; Max-Age=' . self::COOKIE_MAX_AGE .
            '; Expires=' . gmdate('D, d M Y H:i:s', time() + self::COOKIE_MAX_AGE) . ' GMT' .
            '; Path=/' . $domain_attr . '; SameSite=Lax' . ($secure ? '; Secure' : '');
    }

    /** Raw (still URL-encoded) cookie value from a Cookie header, so it is echoed back unchanged. */
    public static function raw_cookie(string $header, string $name): ?string
    {
        foreach (explode(';', $header) as $pair) {
            $pair = trim($pair);
            $eq   = strpos($pair, '=');
            if ($eq !== false && substr($pair, 0, $eq) === $name) {
                return substr($pair, $eq + 1);
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // Merge tags: {vz:utm_source}, {vz:gclid}, ...
    // -------------------------------------------------------------------------

    public function define_merge_tags($merge_tags, $form_id, $fields, $element_id)
    {
        foreach ($this->fields((int) $form_id) as $field => $label) {
            $merge_tags[] = ['label' => $label, 'tag' => '{' . self::meta_key($field) . '}'];
        }
        return $merge_tags;
    }

    public function replace_merge_tags($text, $form, $entry, $url_encode, $esc_html, $nl2br, $format)
    {
        if (strpos((string) $text, '{' . self::META_NS . ':') === false || empty($entry['id'])) {
            return $text;
        }

        $fields = $this->fields((int) rgar((array) $form, 'id'));

        return preg_replace_callback('/\{' . self::META_NS . ':([a-z0-9_]+)\}/i', function ($m) use ($entry, $fields, $url_encode, $esc_html) {
            if (!array_key_exists($m[1], $fields)) {
                return $m[0];
            }
            $value = (string) gform_get_meta($entry['id'], self::meta_key($m[1]));
            if ($url_encode) {
                $value = rawurlencode($value);
            }
            if ($esc_html) {
                $value = esc_html($value);
            }
            return $value;
        }, $text);
    }

    // -------------------------------------------------------------------------
    // Admin: entry detail box
    // -------------------------------------------------------------------------

    public function entry_meta_box($meta_boxes, $entry, $form)
    {
        $meta_boxes['vz_attribution'] = [
            'title'    => esc_html__('Campaign Attribution', 'vz-attribution'),
            'callback' => [$this, 'render_meta_box'],
            'context'  => 'normal',
        ];
        return $meta_boxes;
    }

    public function render_meta_box($args): void
    {
        $entry = $args['entry'];
        $rows  = '';

        foreach ($this->fields((int) rgar($args['form'], 'id')) as $field => $label) {
            if (in_array($field, self::JSON_FIELDS, true)) {
                continue;
            }
            $value = gform_get_meta($entry['id'], self::meta_key($field));
            if ($value === '' || $value === null || $value === false) {
                continue;
            }
            $rows .= '<tr><th style="text-align:left;padding:6px 12px 6px 0;width:40%">' . esc_html($label) .
                     '</th><td style="padding:6px 0;word-break:break-all"><code>' . esc_html($value) . '</code></td></tr>';
        }

        echo $rows
            ? '<table style="width:100%;border-collapse:collapse">' . $rows . '</table>' // phpcs:ignore WordPress.Security.EscapeOutput -- escaped above
            : '<p>' . esc_html__('No attribution data was captured for this entry.', 'vz-attribution') . '</p>';
    }
}

GravityForms::instance();
