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
echo "\n$ok passed, $bad failed\n";
