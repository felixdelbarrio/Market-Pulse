/** Configuracion unica del monitor real de ratings Android, iOS y Huawei. */
var MARKETS_CONFIG = Object.freeze({
  codeVersion: '2026.07.26.20',
  spreadsheetId: '1IkJgvM2imxm3r1x092q5dqpThrlnDoZ-5QvH8n2h2oQ',
  webAppUrl: 'https://script.google.com/a/macros/bbva.com/s/AKfycbzcrsLIXgG5vUM2jRilCO7-i5ZK6A_X0Yv-kPXqkBLFX5HOi5Soo6KF037RAgs9WxRk4g/exec',
  timeZone: 'Europe/Madrid', runHour: 7, runMinute: 5,
  healthCheckHour: 9, healthCheckMinute: 15, lockTimeoutMs: 30000,
  requestRetries: 2, retryBaseDelayMs: 1200, huaweiBatchSize: 6, huaweiBatchDelayMs: 300,
  countryCodes: Object.freeze(['AR', 'CO', 'ES', 'MX', 'PE', 'TR', 'UY', 'VE']),
  sheets: Object.freeze({
    control: 'CONTROL', catalog: 'APP_CATALOG', ratings: 'RATINGS',
    competition: 'DASHBOARD_COMPETITION', trends: 'DASHBOARD_TRENDS', fetchLog: 'FETCH_LOG',
    alerts: 'ALERT_LOG', alertPreferences: 'ALERT_SUBSCRIPTIONS', runs: 'RUN_LOG'
  }),
  headers: Object.freeze({
    control: Object.freeze(['PARAMETER', 'VALUE', 'DESCRIPTION']),
    catalog: Object.freeze([
      'APP_KEY', 'PLATFORM', 'STORE', 'COUNTRY_CODE', 'COUNTRY', 'APP_NAME', 'APP_ID',
      'PACKAGE_NAME', 'IS_BBVA', 'ENABLED', 'LOCALE', 'ALERT_RECIPIENTS', 'WARNING_DROP',
      'CRITICAL_DROP', 'MIN_OBSERVATIONS_7D', 'COMPETITOR_ALERTS', 'COUNTRY_PLATFORM_WEIGHT',
      'GROUP_USER_WEIGHT', 'DISPLAY_ORDER', 'MARKET_SEGMENT', 'DASHBOARD_SECTION',
      'COMPETITOR_SET_VERSION', 'PRODUCT_SCOPE', 'WEIGHT_SOURCE', 'WEIGHT_EFFECTIVE_DATE',
      'COMMERCIAL_ELIGIBLE', 'COMMERCIAL_EVIDENCE_URL', 'STORE_EVIDENCE_URL', 'VERIFIED_AT'
    ]),
    ratings: Object.freeze([
      'RECORD_KEY', 'OBSERVED_DATE', 'YEAR', 'YEAR_MONTH', 'PLATFORM', 'STORE', 'COUNTRY_CODE',
      'COUNTRY', 'APP_KEY', 'APP_NAME', 'APP_ID', 'IS_BBVA', 'RATING', 'RATING_COUNT', 'RANKING',
      'PREVIOUS_RATING_30D', 'DELTA_30D', 'IS_LATEST', 'SOURCE', 'INGESTED_AT', 'MARKET_SEGMENT',
      'DISPLAY_ORDER', 'RANKING_EXPECTED_APPS', 'RANKING_OBSERVED_APPS', 'RANKING_COVERAGE',
      'RANKING_IS_COMPLETE', 'PREVIOUS_RATING_COUNT_30D', 'RATING_COUNT_DELTA_30D'
    ]),
    trends: Object.freeze([
      'PERIOD_MONTH', 'PLATFORM', 'COUNTRY_CODE', 'COUNTRY', 'APP_KEY', 'APP_NAME', 'IS_BBVA',
      'RATING_EOM', 'MARKET_SEGMENT', 'RATING_COUNT_EOM'
    ]),
    competition: Object.freeze([
      'OBSERVED_DATE', 'PLATFORM', 'COUNTRY_CODE', 'COUNTRY', 'MARKET_SEGMENT', 'APP_KEY',
      'APP_NAME', 'IS_BBVA', 'DISPLAY_ORDER', 'RATING', 'RATING_COUNT', 'RANKING_IS_COMPLETE',
      'DELTA_30D', 'IS_FRESH_THIS_RUN', 'RATING_COUNT_DELTA_30D', 'STORE_WEB_URL'
    ]),
    fetchLog: Object.freeze([
      'RUN_ID', 'REFERENCE_DATE', 'FETCHED_AT', 'APP_KEY', 'PLATFORM', 'COUNTRY_CODE',
      'MARKET_SEGMENT', 'STATUS', 'HTTP_STATUS', 'RATING', 'RATING_COUNT', 'RETRYABLE', 'DETAIL', 'SOURCE'
    ]),
    alerts: Object.freeze([
      'TIMESTAMP', 'EVENT_KEY', 'REFERENCE_DATE', 'PLATFORM', 'COUNTRY_CODE', 'TYPE', 'SEVERITY',
      'DETAIL', 'RECIPIENTS', 'RUN_ID', 'SOURCE', 'USER_EMAIL', 'RULE_ID', 'METRIC_VALUE',
      'THRESHOLD', 'APP_KEY', 'DIRECTION'
    ]),
    alertPreferences: Object.freeze([
      'USER_EMAIL', 'ACTIVE', 'COUNTRIES', 'PLATFORMS', 'REVIEW_SHARE_ENABLED',
      'REVIEW_WARNING_PCT', 'REVIEW_CRITICAL_PCT', 'WEEKLY_DROP_ENABLED',
      'WEEKLY_WARNING_DROP', 'WEEKLY_CRITICAL_DROP', 'CROSSOVER_ENABLED',
      'CROSSOVER_DIRECTION', 'DELIVERY_MODE', 'UPDATED_AT', 'UPDATED_BY', 'CONFIG_VERSION', 'STATUS',
      'DAILY_DROP_ENABLED', 'DAILY_WARNING_DROP', 'DAILY_CRITICAL_DROP',
      'MTD_DROP_ENABLED', 'MTD_WARNING_DROP', 'MTD_CRITICAL_DROP',
      'YTD_DROP_ENABLED', 'YTD_WARNING_DROP', 'YTD_CRITICAL_DROP', 'REPEAT_WHILE_BREACHED',
      'REGISTERED_AT', 'LAST_SEEN_AT', 'LAST_TEST_AT', 'LAST_DELIVERY_AT'
    ]),
    runs: Object.freeze([
      'STARTED_AT', 'RUN_ID', 'STATUS', 'APPS_TOTAL', 'APPS_OK', 'APPS_NO_RATING', 'APPS_ERROR',
      'ROWS_UPSERTED', 'ALERTS_CREATED', 'DURATION_MS', 'DETAIL', 'SCORECARD_ROWS', 'TREND_ROWS',
      'COMPETITION_ROWS', 'FRESH_APPS', 'WEIGHT_CONFIG_STATUS', 'ALERT_SUBSCRIBERS', 'EMAILS_SENT',
      'ALERT_DELIVERY_STATUS', 'ALERT_DELIVERY_DETAIL'
    ])
  }),
  controlDefaults: Object.freeze([
    ['CODE_VERSION', '2026.07.26.20', 'Version del contrato de datos y del Apps Script'],
    ['TIME_ZONE', 'Europe/Madrid', 'Zona horaria de ejecucion y fechas'],
    ['SEND_ALERT_EMAILS', false, 'Enviar emails; mantener FALSE durante la validacion inicial'],
    ['ALERT_SENDER_ALIAS', 'voc-commercial.group@bbva.com', 'Remitente verificado en Gmail > Enviar como para las alertas VoC'],
    ['MONITOR_HEALTH_ENABLED', true, 'Verificar cada manana que el proceso diario y su canal de alertas han finalizado'],
    ['MONITOR_ADMIN_EMAIL', 'voc-commercial.group@bbva.com', 'Destino operativo para incidencias del proceso diario'],
    ['ADMIN_EMAILS', '', 'Administradores autorizados, separados por coma; setupProject registra al propietario inicial'],
    ['RATING_LOOKBACK_DAYS', 30, 'Ventana para DELTA_30D']
  ])
});

function catalogSeed_(key, platform, countryCode, country, appName, appId, packageName, isBbva, order, segment, section, scope) {
  return [key, platform, platform === 'Android' ? 'Google Play' : platform === 'iOS' ? 'App Store' : 'Huawei AppGallery',
    countryCode, country, appName, appId || '', packageName || '', Boolean(isBbva), true,
    platform === 'Huawei' ? 'es_' + countryCode : 'es', '', 0.30, 0.50, 5, true, '', '', order,
    segment || 'BANK', section || 'COUNTRY_BANKS', '2026Q3', scope || 'BUSINESS', '', '',
    true, '', '', ''];
}

function commercialSeed_(key, platform, countryCode, country, appName, appId, packageName, order, evidenceUrl, storeUrl) {
  const row = catalogSeed_(key, platform, countryCode, country, appName, appId, packageName, false, order,
    'FINTECH', 'COUNTRY_COMMERCIAL_DIGITAL', 'COMMERCIAL');
  row[25] = true; row[26] = evidenceUrl; row[27] = storeUrl; row[28] = '2026-07-16';
  return row;
}

var MARKETS_CATALOG_SEEDS = Object.freeze([
  catalogSeed_('ANDROID|VE|BBVA', 'Android', 'VE', 'Venezuela', 'BBVA', 'com.bbva.empresas', 'com.bbva.empresas', true, 0),
  catalogSeed_('ANDROID|VE|MERCANTIL_EMPRESAS', 'Android', 'VE', 'Venezuela', 'Mercantil Empresas', 'com.mercantilbanco.mme.mercantilmovil', 'com.mercantilbanco.mme.mercantilmovil', false, 1),
  catalogSeed_('ANDROID|VE|BANESCO_VE', 'Android', 'VE', 'Venezuela', 'Banesco VE', 'com.banesco.samfbancamovilunificada', 'com.banesco.samfbancamovilunificada', false, 2),
  catalogSeed_('ANDROID|VE|BANCARIBE_EMPRESAS', 'Android', 'VE', 'Venezuela', 'Bancaribe Empresas', 'bancaribeMobileBankingCash.v1', 'bancaribeMobileBankingCash.v1', false, 3),
  catalogSeed_('ANDROID|VE|BNC', 'Android', 'VE', 'Venezuela', 'BNC', 'bnc.bncnet.mobile2', 'bnc.bncnet.mobile2', false, 4),
  catalogSeed_('IOS|VE|BBVA', 'iOS', 'VE', 'Venezuela', 'BBVA', '1590189082', '', true, 0),
  catalogSeed_('IOS|VE|MERCANTIL_EMPRESAS', 'iOS', 'VE', 'Venezuela', 'Mercantil Empresas', '1548017515', '', false, 1),
  catalogSeed_('IOS|VE|BANESCO_VE', 'iOS', 'VE', 'Venezuela', 'Banesco VE', '1497546462', '', false, 2),
  catalogSeed_('IOS|VE|BANCARIBE_EMPRESAS', 'iOS', 'VE', 'Venezuela', 'Bancaribe Empresas', '1542090352', '', false, 3),
  catalogSeed_('IOS|VE|BNC', 'iOS', 'VE', 'Venezuela', 'BNC', '1635259975', '', false, 4),
  catalogSeed_('HUAWEI|VE|BBVA', 'Huawei', 'VE', 'Venezuela', 'BBVA', 'C1751602113005231488', 'com.bbva.empresas', true, 0),
  catalogSeed_('HUAWEI|VE|MERCANTIL_EMPRESAS', 'Huawei', 'VE', 'Venezuela', 'Mercantil Empresas', 'C1746451170823523136', 'com.mercantilbanco.mme.mercantilmovil', false, 1),
  catalogSeed_('HUAWEI|VE|BANESCO_VE', 'Huawei', 'VE', 'Venezuela', 'Banesco VE', 'C1801620142921151424', 'com.banesco.samfbancamovilunificada', false, 2),
  catalogSeed_('HUAWEI|VE|BANCARIBE_EMPRESAS', 'Huawei', 'VE', 'Venezuela', 'Bancaribe Empresas', 'C1765377894340655808', 'bancaribeMobileBankingCash.v1', false, 3),
  catalogSeed_('HUAWEI|VE|BNC', 'Huawei', 'VE', 'Venezuela', 'BNC', 'C1742708304376777536', 'bnc.bncnet.mobile2', false, 4),

  commercialSeed_('ANDROID|MX|MERCADO_PAGO', 'Android', 'MX', 'Mexico', 'Mercado Pago Negocios', 'com.mercadopago.wallet', 'com.mercadopago.wallet', 0, 'https://www.mercadopago.com.mx/herramientas-para-vender', 'https://play.google.com/store/apps/details?id=com.mercadopago.wallet'),
  commercialSeed_('ANDROID|MX|KONFIO', 'Android', 'MX', 'Mexico', 'Konfio', 'com.konfio.credito', 'com.konfio.credito', 1, 'https://konfio.mx/', 'https://play.google.com/store/apps/details?id=com.konfio.credito'),
  commercialSeed_('ANDROID|MX|CLIP', 'Android', 'MX', 'Mexico', 'Clip', 'com.payclip.clip', 'com.payclip.clip', 2, 'https://www.clip.mx/', 'https://play.google.com/store/apps/details?id=com.payclip.clip'),
  commercialSeed_('ANDROID|MX|CLARA', 'Android', 'MX', 'Mexico', 'Clara', 'cc.clara.claracard', 'cc.clara.claracard', 3, 'https://www.clara.com/es-mx', 'https://play.google.com/store/apps/details?id=cc.clara.claracard'),
  commercialSeed_('IOS|MX|MERCADO_PAGO', 'iOS', 'MX', 'Mexico', 'Mercado Pago Negocios', '925436649', '', 0, 'https://www.mercadopago.com.mx/herramientas-para-vender', 'https://apps.apple.com/mx/app/id925436649'),
  commercialSeed_('IOS|MX|KONFIO', 'iOS', 'MX', 'Mexico', 'Konfio', '1499151815', '', 1, 'https://konfio.mx/', 'https://apps.apple.com/mx/app/id1499151815'),
  commercialSeed_('IOS|MX|CLIP', 'iOS', 'MX', 'Mexico', 'Clip', '771245360', '', 2, 'https://www.clip.mx/', 'https://apps.apple.com/mx/app/id771245360'),
  commercialSeed_('IOS|MX|CLARA', 'iOS', 'MX', 'Mexico', 'Clara', '1538820373', '', 3, 'https://www.clara.com/es-mx', 'https://apps.apple.com/mx/app/id1538820373'),

  commercialSeed_('ANDROID|AR|MERCADO_PAGO', 'Android', 'AR', 'Argentina', 'Mercado Pago Negocios', 'com.mercadopago.wallet', 'com.mercadopago.wallet', 0, 'https://www.mercadopago.com.ar/mp/cobrosmasivos', 'https://play.google.com/store/apps/details?id=com.mercadopago.wallet'),
  commercialSeed_('ANDROID|AR|UALA_BIS', 'Android', 'AR', 'Argentina', 'Uala Bis', 'ar.com.bancar.uala', 'ar.com.bancar.uala', 1, 'https://www.uala.com.ar/prensa/Ual%C3%A1-Bis-Tap-en-tu-celu', 'https://play.google.com/store/apps/details?id=ar.com.bancar.uala'),
  commercialSeed_('ANDROID|AR|PAYWAY', 'Android', 'AR', 'Argentina', 'Payway', 'com.prismamp.mobile.comercios', 'com.prismamp.mobile.comercios', 2, 'https://www.payway.com.ar/', 'https://play.google.com/store/apps/details?id=com.prismamp.mobile.comercios'),
  commercialSeed_('IOS|AR|MERCADO_PAGO', 'iOS', 'AR', 'Argentina', 'Mercado Pago Negocios', '925436649', '', 0, 'https://www.mercadopago.com.ar/mp/cobrosmasivos', 'https://apps.apple.com/ar/app/id925436649'),
  commercialSeed_('IOS|AR|UALA_BIS', 'iOS', 'AR', 'Argentina', 'Uala Bis', '1279808159', '', 1, 'https://www.uala.com.ar/prensa/Ual%C3%A1-Bis-Tap-en-tu-celu', 'https://apps.apple.com/ar/app/id1279808159'),
  commercialSeed_('IOS|AR|PAYWAY', 'iOS', 'AR', 'Argentina', 'Payway', '1550133741', '', 2, 'https://www.payway.com.ar/', 'https://apps.apple.com/ar/app/id1550133741'),

  commercialSeed_('ANDROID|ES|QONTO', 'Android', 'ES', 'Spain', 'Qonto', 'eu.qonto.qonto', 'eu.qonto.qonto', 0, 'https://qonto.com/es/open-an-account/cuenta-persona-juridica', 'https://play.google.com/store/apps/details?id=eu.qonto.qonto'),
  commercialSeed_('ANDROID|ES|REVOLUT_BUSINESS', 'Android', 'ES', 'Spain', 'Revolut Business', 'com.revolut.business', 'com.revolut.business', 1, 'https://www.revolut.com/es-ES/business/', 'https://play.google.com/store/apps/details?id=com.revolut.business'),
  commercialSeed_('ANDROID|ES|WISE_BUSINESS', 'Android', 'ES', 'Spain', 'Wise Business', 'com.transferwise.android', 'com.transferwise.android', 2, 'https://wise.com/es/business/ecommerce', 'https://play.google.com/store/apps/details?id=com.transferwise.android'),
  commercialSeed_('ANDROID|ES|SUMUP_BUSINESS', 'Android', 'ES', 'Spain', 'SumUp Business', 'com.kaching.merchant', 'com.kaching.merchant', 3, 'https://www.sumup.com/es-es/acepta-pagos/', 'https://play.google.com/store/apps/details?id=com.kaching.merchant'),
  commercialSeed_('IOS|ES|QONTO', 'iOS', 'ES', 'Spain', 'Qonto', '1214811644', '', 0, 'https://qonto.com/es/open-an-account/cuenta-persona-juridica', 'https://apps.apple.com/es/app/id1214811644'),
  commercialSeed_('IOS|ES|REVOLUT_BUSINESS', 'iOS', 'ES', 'Spain', 'Revolut Business', '1436969262', '', 1, 'https://www.revolut.com/es-ES/business/', 'https://apps.apple.com/es/app/id1436969262'),
  commercialSeed_('IOS|ES|WISE_BUSINESS', 'iOS', 'ES', 'Spain', 'Wise Business', '612261027', '', 2, 'https://wise.com/es/business/ecommerce', 'https://apps.apple.com/es/app/id612261027'),
  commercialSeed_('IOS|ES|SUMUP_BUSINESS', 'iOS', 'ES', 'Spain', 'SumUp Business', '514879214', '', 3, 'https://www.sumup.com/es-es/acepta-pagos/', 'https://apps.apple.com/es/app/id514879214'),

  commercialSeed_('ANDROID|CO|NEQUI_NEGOCIOS', 'Android', 'CO', 'Colombia', 'Nequi Negocios', 'com.nequi.negocios', 'com.nequi.negocios', 0, 'https://www.nequi.com.co/negocios/app-negocios', 'https://play.google.com/store/apps/details?id=com.nequi.negocios'),
  commercialSeed_('ANDROID|CO|BOLD', 'Android', 'CO', 'Colombia', 'Bold', 'co.bold', 'co.bold', 1, 'https://www.bold.co/pagos', 'https://play.google.com/store/apps/details?id=co.bold'),
  commercialSeed_('ANDROID|CO|MERCADO_PAGO', 'Android', 'CO', 'Colombia', 'Mercado Pago Negocios', 'com.mercadopago.wallet', 'com.mercadopago.wallet', 2, 'https://www.mercadopago.com.co/herramientas-para-vender', 'https://play.google.com/store/apps/details?id=com.mercadopago.wallet'),
  commercialSeed_('ANDROID|CO|CLARA', 'Android', 'CO', 'Colombia', 'Clara', 'cc.clara.claracard', 'cc.clara.claracard', 3, 'https://www.clara.com/es-co', 'https://play.google.com/store/apps/details?id=cc.clara.claracard'),
  commercialSeed_('IOS|CO|NEQUI_NEGOCIOS', 'iOS', 'CO', 'Colombia', 'Nequi Negocios', '6741329765', '', 0, 'https://www.nequi.com.co/negocios/app-negocios', 'https://apps.apple.com/co/app/id6741329765'),
  commercialSeed_('IOS|CO|BOLD', 'iOS', 'CO', 'Colombia', 'Bold', '1489537348', '', 1, 'https://www.bold.co/pagos', 'https://apps.apple.com/co/app/id1489537348'),
  commercialSeed_('IOS|CO|MERCADO_PAGO', 'iOS', 'CO', 'Colombia', 'Mercado Pago Negocios', '925436649', '', 2, 'https://www.mercadopago.com.co/herramientas-para-vender', 'https://apps.apple.com/co/app/id925436649'),
  commercialSeed_('IOS|CO|CLARA', 'iOS', 'CO', 'Colombia', 'Clara', '1538820373', '', 3, 'https://www.clara.com/es-co', 'https://apps.apple.com/co/app/id1538820373')
]);
