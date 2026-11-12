/* Locale is supplied before scripts run. Standalone previews default to Chinese.
   Only explicit editor metadata paths are localized; item/user data is untouched. */
var I18n = (function () {
  var data = typeof oriel !== 'undefined' && oriel.data || {};
  var requestedLocale = normalize(data.uiLocale || 'zh_cn');
  var locale = EditorCatalogs[requestedLocale] ? requestedLocale : 'en_us', forced = null;
  var overrides = data.uiTranslations || {};
  function normalize(value) { var code = String(value).replace(/-/g, '_').toLowerCase(); return /^[a-z0-9_]{2,32}$/.test(code) ? code : 'en_us'; }
  function format(template, args) {
    var sequential = 0;
    return String(template).replace(/%%|%(?:([1-9][0-9]*)\$)?s/g, function (match, index) {
      if (match === '%%') return '%';
      var i = index === undefined ? sequential++ : Number(index) - 1;
      return i < args.length ? String(args[i]) : match;
    });
  }
  function text(language, key, args, useOverrides) {
    var map = EditorCatalogs[language] || EditorCatalogs.en_us;
    var template = useOverrides && typeof overrides[key] === 'string' ? overrides[key] : map[key];
    if (template === undefined) template = EditorCatalogs.en_us[key];
    return format(template === undefined ? key : template, args);
  }
  var api = {
    locale: locale, requestedLocale: requestedLocale, normalize: normalize, format: format,
    t: function (key) { return text(forced || locale, key, Array.prototype.slice.call(arguments, 1), !forced); },
    en: function (key) { return text('en_us', key, Array.prototype.slice.call(arguments, 1), false); },
    keyed: function (map) { var out = {}; Object.keys(map).forEach(function (key) { out[api.t(key)] = map[key]; }); return out; },
    withLanguage: function (language, callback) {
      var previous = forced; forced = normalize(language);
      try { return callback(); } finally { forced = previous; }
    }
  };
  EditorTextFields.forEach(function (field) {
    var owner = EDATA;
    for (var i = 0; i < field.path.length - 1; i++) owner = owner && owner[field.path[i]];
    if (owner) owner[field.path[field.path.length - 1]] = api.t(field.key);
  });
  if (locale !== 'zh_cn') EditorVanillaEnglish.forEach(function (field) {
    var owner = EDATA;
    for (var i = 0; i < field.path.length - 1; i++) owner = owner && owner[field.path[i]];
    if (owner) owner[field.path[field.path.length - 1]] = field.text;
  });
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('lang', locale.replace('_', '-'));
    document.title = api.t('cadeditor.ui.common.editor_title');
    var subtitle = document.querySelector('meta[name="oriel-subtitle"]');
    if (subtitle) subtitle.setAttribute('content', api.t('cadeditor.ui.common.editor_subtitle'));
  }
  return api;
})();
