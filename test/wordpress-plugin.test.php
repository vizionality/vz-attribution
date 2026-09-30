<?php
define('ABSPATH', '/');
$GLOBALS['hooks'] = []; $GLOBALS['meta'] = [];
function add_action($h,$c,$p=10,$a=1){ $GLOBALS['hooks'][$h][]=$c; }
function add_filter($h,$c,$p=10,$a=1){ $GLOBALS['hooks'][$h][]=$c; }
function did_action($h){ return 0; }
function apply_filters($h,$v){ $args=func_get_args(); array_shift($args); foreach($GLOBALS['hooks'][$h]??[] as $c){ $args[0]=call_user_func_array($c,$args);} return $args[0]; }
function rgar($a,$k){ return is_array($a)&&isset($a[$k])?$a[$k]:null; }
function esc_attr($s){ return htmlspecialchars($s,ENT_QUOTES); }
function esc_html($s){ return htmlspecialchars($s,ENT_QUOTES); }
function esc_html__($s){ return $s; }
function sanitize_text_field($s){ return trim(strip_tags($s)); }
function wp_unslash($s){ return $s; }
function wp_json_encode($v){ return json_encode($v); }
function gform_get_meta($id,$k){ return $GLOBALS['meta'][$k] ?? ''; }
function rest_url($p){ return 'https://www.client.test/wp-json/' . $p; }
function wp_parse_url($u){ return parse_url($u); }
function register_rest_route($ns,$r,$a){ $GLOBALS['routes'][$ns.$r]=$a; }
function is_ssl(){ return true; }
class WP_REST_Response { public $status; public $headers=[]; function __construct($d=null,$s=200){ $this->status=$s; } function header($k,$v){ $this->headers[$k]=$v; } }
class FakeRequest { private $b; function __construct($b){ $this->b=$b; } function get_body(){ return $this->b; } }
require __DIR__ . '/../wordpress/vz-attribution-gravityforms/vz-attribution-gravityforms.php';
foreach($GLOBALS['hooks']['gform_loaded'] as $c) $c();
$p = Vizionality\Attribution\GravityForms::instance();
$ok=0;$bad=0; $t=function($n,$c)use(&$ok,&$bad){ echo ($c?"  ok   ":"  FAIL ").$n."\n"; $c?$ok++:$bad++; };

$html = apply_filters('gform_form_tag', '<form>', ['id'=>3]);
$t('hidden inputs added', strpos($html,'name="utm_source"')!==false && strpos($html,'name="gclid"')!==false);
$t('no server-side values', substr_count($html,'value=""') === count(Vizionality\Attribution\GravityForms::DEFAULT_FIELDS));
add_filter('vz_attribution/enabled/form/4', function(){ return false; });
$t('per-form disable', apply_filters('gform_form_tag', '<form>', ['id'=>4]) === '<form>');
add_filter('vz_attribution/fields/form/5', function($f){ $f['custom_x']='Custom'; return $f; });
$t('per-form field filter', strpos(apply_filters('gform_form_tag','<form>',['id'=>5]),'custom_x')!==false);

$meta = apply_filters('gform_entry_meta', [], 3);
$t('entry meta registered', isset($meta['vz:utm_source']) && isset($meta['vz:vz_attribution_json']));

$_POST = ['utm_source'=>'google<script>x</script>', 'vz_attribution_json'=>'{"first":{"utm":{"source":"<b>g</b>"}}}', 'gclid'=>['array']];
$t('text sanitized', $p->value_from_post('vz:utm_source',[],['id'=>3]) === 'googlex');
$t('json sanitized', $p->value_from_post('vz:vz_attribution_json',[],['id'=>3]) === '{"first":{"utm":{"source":"g"}}}');
$_POST['vz_attribution_json']='not json';
$t('invalid json rejected', $p->value_from_post('vz:vz_attribution_json',[],['id'=>3]) === '');
$t('non-string rejected', $p->value_from_post('vz:gclid',[],['id'=>3]) === '');
$t('unknown field rejected', $p->value_from_post('vz:evil',[],['id'=>3]) === '');

$GLOBALS['meta'] = ['vz:utm_source'=>'google','vz:utm_campaign'=>'a&b'];
$out = apply_filters('gform_replace_merge_tags', 'Src: {vz:utm_source} / {vz:utm_campaign} / {vz:nope} / {other}', ['id'=>3], ['id'=>9], false, true, false, 'html');
$t('merge tags replaced', $out === 'Src: google / a&amp;b / {vz:nope} / {other}');
$t('merge tags url encoded', apply_filters('gform_replace_merge_tags','{vz:utm_campaign}',['id'=>3],['id'=>9],true,false,false,'text') === 'a%26b');
$t('no entry -> untouched', apply_filters('gform_replace_merge_tags','{vz:utm_source}',['id'=>3],false,false,false,false,'text') === '{vz:utm_source}');

// Server cookie refresh (Safari)
ob_start(); foreach($GLOBALS['hooks']['wp_head'] as $c) $c(); $head = ob_get_clean();
$t('wp_head prints endpoint path', strpos($head, 'window.vzServerCookieUrl="\/wp-json\/vz\/v1\/cookie"') !== false);
foreach($GLOBALS['hooks']['rest_api_init'] as $c) $c();
$t('REST route registered (POST)', isset($GLOBALS['routes']['vz/v1/cookie']) && $GLOBALS['routes']['vz/v1/cookie']['methods'] === 'POST');
$val = 'eyJ2IjoxfQ%3D%3D';
$ck = "_ga=GA1.1.1.2; vz_attr=$val; other=x";
$t('raw cookie keeps encoding', Vizionality\Attribution\GravityForms::raw_cookie($ck, 'vz_attr') === $val);
$h = $p->refresh_cookie_header('vz_attr', '.client.test', $ck, 'www.client.test', true);
$t('header echoes value, 400 days, parent domain, secure',
   $h !== null && strpos($h, "vz_attr=$val; Max-Age=34560000; Expires=") === 0 && strpos($h, '; Path=/; Domain=.client.test; SameSite=Lax; Secure') !== false);
$t('host with port accepted', $p->refresh_cookie_header('vz_attr', '.client.test', $ck, 'www.client.test:8443', false) !== null);
$t('host-only cookie when no domain', strpos((string)$p->refresh_cookie_header('vz_attr', '', $ck, 'www.client.test', false), 'Domain=') === false);
$t('foreign domain rejected', $p->refresh_cookie_header('vz_attr', '.evil.com', $ck, 'www.client.test', true) === null);
$t('lookalike domain rejected', $p->refresh_cookie_header('vz_attr', 'lient.test', $ck, 'www.client.test', true) === null);
$t('unlisted cookie name rejected', $p->refresh_cookie_header('_ga', '.client.test', $ck, 'www.client.test', true) === null);
$t('missing cookie -> nothing set', $p->refresh_cookie_header('vz_attr', '.client.test', '_ga=1', 'www.client.test', true) === null);
$t('header injection rejected', $p->refresh_cookie_header('vz_attr', '.client.test', 'vz_attr=abc;%0d%0aX: y', 'www.client.test', true) !== null
   && $p->refresh_cookie_header('vz_attr', '.client.test', "vz_attr=a b\r\nSet-Cookie: x", 'www.client.test', true) === null);
$t('oversized value rejected', $p->refresh_cookie_header('vz_attr', '', 'vz_attr=' . str_repeat('a', 4000), 'www.client.test', true) === null);
$_SERVER['HTTP_COOKIE'] = $ck; $_SERVER['HTTP_HOST'] = 'go.client.test';
$r = $p->rest_refresh_cookie(new FakeRequest('{"name":"vz_attr","domain":".client.test"}'));
$t('endpoint: 204 + Set-Cookie + no-store', $r->status === 204 && isset($r->headers['Set-Cookie']) && strpos($r->headers['Cache-Control'], 'no-store') !== false && $r->headers['X-VZ-Cookie'] === 'refreshed');
$r = $p->rest_refresh_cookie(new FakeRequest('garbage'));
$t('endpoint: bad body falls back to vz_attr host-only', isset($r->headers['Set-Cookie']) && strpos($r->headers['Set-Cookie'], 'Domain=') === false);
$_SERVER['HTTP_COOKIE'] = '';
$r = $p->rest_refresh_cookie(new FakeRequest('{"name":"vz_attr"}'));
$t('endpoint: no cookie -> skipped, still no-store', !isset($r->headers['Set-Cookie']) && $r->headers['X-VZ-Cookie'] === 'skipped' && strpos($r->headers['Cache-Control'], 'no-store') !== false);
add_filter('vz_attribution/server_cookie', function(){ return false; });
ob_start(); foreach($GLOBALS['hooks']['wp_head'] as $c) $c(); $head2 = ob_get_clean();
$t('filter disables head script', $head2 === '');
$t('filter disables header', $p->refresh_cookie_header('vz_attr', '.client.test', $ck, 'www.client.test', true) === null);
echo "\n$ok passed, $bad failed\n";
