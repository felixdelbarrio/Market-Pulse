const MARKETS_FUNCTIONAL_MASTER = '1hsFp-ZiiSsSt_ka73oKAWFlHEySdmJM_IrkBmK6YfH8';
const MARKETS_FUNCTIONAL_TABS = ['Soluciones Funcionales', 'Capacidades canal (core y VD)'];
const MARKETS_REVIEW_BLOCK_EVIDENCE = {
  '03': /\b(?:transferencia|transferencias|bank transfer|wire transfer|para transferi|havale|eft)\b/u,
  '08': /\b(?:prestamo|prestamos|linea de credito|business loan|ticari kredi)\b/u,
  '11': /\b(?:dat[aá]fono|terminal de pago|pos terminal|pos cihazi)\b/u,
  '16': /\b(?:iniciar sesion|inicio de sesion|log in|login|sign in|giris yapamiyorum|sifre)\b/u
};
// Reglas del catálogo exportado de News Radar. Solo se aplican a IDs activos del maestro.
const MARKETS_REVIEW_RULES = {
  "01.01": [["posicion global", "financial dashboard", "dashboard", "home banking", "digital banking solution", "corporate banking platform", "app itau empresas", "banca digital empresarial"], ["dashboard", "posición global", "posicion global", "visión integral", "vision integral", "vista global", "posicion de productos", "posición de productos", "account overview", "financial overview", "product overview", "aggregate", "aggregated"], ["workforce dashboard", "stock market dashboard", "cloud cost dashboard"]],
  "02.01": [["dashboard de cuentas", "visión integral de cuentas", "aggregate accounts"], [], []],
  "02.02": [["movimientos de cuenta", "account transactions"], [], []],
  "02.03": [["estado de cuenta", "account statement"], [], []],
  "02.05": [["camt053", "camt.053", "cuaderno 43"], [], []],
  "02.06": [["multicash", "bai-2"], [], []],
  "02.09": [["cash pooling"], [], []],
  "02.11": [["agregacion de cuentas", "account aggregation", "multibank"], [], []],
  "02.14": [["segunda cuenta", "additional account"], [], []],
  "02.17": [["parking account", "parking accounts", "cuenta remunerada para empresas", "cuentas remuneradas para empresas", "b2b parking", "excedentes de tesoreria"], [], []],
  "03.01": [["dashboard de pagos", "visión integral de pagos", "aggregate payments"], [], []],
  "03.06": [["bulk transfers", "bulk payments"], [], []],
  "03.09": [["pagos vostro", "vostro payments", "cuentas vostro", "vostro accounts"], [], []],
  "03.13": [["transferencias internacionales", "cross-border payments", "international transfers", "international payments", "pagos internacionales", "cross border payments", "international remittances", "remesas internacionales", "cross-border real-time payments", "x-border real-time payments", "cross border real time payments", "stablecoin payments", "pagos con stablecoins", "cross-border stablecoin", "liquidacion blockchain", "blockchain settlement", "tokenized payments", "tokenised payments"], [], ["child meal", "food delivery"]],
  "03.14": [["international bulk payments", "bulk international transfers", "cross-border bulk payments"], [], []],
  "03.16": [["supplier payments"], [], []],
  "03.18": [["pagos programados", "scheduled payments", "recurring payments"], [], []],
  "03.21": [["transferencias en streaming"], [], []],
  "03.25": [["iniciacion de pagos", "payment initiation"], [], []],
  "03.27": [["swift gpi", "swift-gpi"], ["tracking", "trazabilidad", "seguimiento", "swift gpi", "swift-gpi", "payment trace", "track transfers"], []],
  "04.01": [["real-time payroll", "dashboard de nóminas en tiempo real", "visión integral de nóminas en tiempo real", "aggregate payroll"], [], []],
  "04.02": [["payroll tracking"], [], []],
  "05.01": [["datos fiscales", "tax information"], [], []],
  "05.08": [["customs duty", "customs tax", "customs payments", "impuestos aduanales", "pago de aduanas", "icegate"], [], []],
  "05.23": [["impuestos provinciales", "provincial tax", "state tax payments", "tributos provinciales", "impuestos estatales", "tasas provinciales"], [], []],
  "05.26": [["impuestos masivos", "bulk tax payments"], [], []],
  "06.01": [["pago de servicios", "pago factura", "bill payment", "utility payments", "dashboard de pagos individuales cie o servicios/recibos no domicilados", "visión integral de pagos individuales cie o servicios/recibos no domicilados", "aggregate payments"], [], []],
  "06.03": [["pse pagos"], [], []],
  "06.06": [["request-to-pay", "solicitud de pago"], ["request to pay", "request-to-pay", "solicitud de pago", "petición de pago", "payment request", "codi"], []],
  "06.09": [["sepa mandates"], [], []],
  "06.15": [["echeqs pago"], [], []],
  "07.01": [["dashboard de cobros", "visión integral de cobros", "aggregate collections"], [], []],
  "07.02": [["adeudos directos", "direct debit", "debito automatico"], [], []],
  "08.01": [["dashboard de financiación", "visión integral de financiación", "aggregate financing"], [], []],
  "08.02": [["virtual credit"], [], []],
  "08.06": [["fast cash"], [], []],
  "08.10": [["linea de credito digital", "digital credit line", "ocdl"], [], []],
  "08.11": [["cupo rotativo", "revolving credit"], [], []],
  "08.12": [["prestamo empresarial", "business loan", "credito simple"], [], ["syndicated loan", "bilateral facility"]],
  "08.16": [["anticipo confirming", "reverse factoring advances"], [], []],
  "08.19": [["descuento mercantil"], [], []],
  "08.24": [["simulador de credito"], [], []],
  "08.25": [["prestamo tpv", "merchant cash advance"], [], []],
  "08.28": [["prestamo online negocio", "online business loan"], [], []],
  "08.29": [["credito pyme digital"], [], []],
  "08.33": [["solicitud de aval", "digital bank guarantee"], [], []],
  "08.41": [["factoring digital", "invoice financing", "descuento de facturas"], [], []],
  "09.01": [["dashboard de tarjetas/ listado de tarjetas", "visión integral de tarjetas/ listado de tarjetas", "aggregate cards"], [], []],
  "09.02": [["extractos de tarjetas", "estados de cuenta de tarjetas", "card statements"], [], []],
  "09.03": [["alias de tarjeta", "card nickname"], [], []],
  "09.04": [["movimientos de tarjetas de credito", "credit card transactions"], [], []],
  "09.05": [["limites de tarjetas de credito", "limites de la tarjeta de credito", "credit card spending limits", "credit card payment controls"], [], []],
  "09.06": [["bloquear tarjeta de credito", "credit card freeze", "bloquear la tarjeta de credito", "congelar tarjeta de credito", "freeze credit card"], [], []],
  "09.07": [["contratar tarjeta de credito", "issue corporate credit cards"], [], []],
  "09.08": [["emision masiva de tarjetas de credito", "bulk credit card issuance"], [], []],
  "09.09": [["pago de la tarjeta de credito", "pago de tarjeta de credito", "pago del saldo de tarjeta", "credit card repayment", "credit card bill"], ["pago de tarjeta", "pago de la tarjeta", "pagar la tarjeta", "pagar tarjeta", "pago mínimo", "saldar", "deuda de tarjeta", "card bill", "credit card bill", "card repayment", "repay credit card"], []],
  "09.10": [["bloquear tarjeta de debito", "debit card freeze", "bloquear la tarjeta de debito", "congelar tarjeta de debito", "freeze debit card"], [], []],
  "09.11": [["movimientos de tarjetas de debito", "debit card transactions"], [], []],
  "09.12": [["contrato de tarjeta de debito", "debit card agreement"], [], []],
  "09.13": [["solicitar tarjeta de debito", "request a debit card"], [], []],
  "09.14": [["pagos con tarjeta de debito", "pagos contactless con tarjetas de debito", "debit card payments"], [], []],
  "09.15": [["contratar tarjeta de debito", "issue business debit cards"], [], []],
  "09.16": [["emision masiva de tarjetas de debito", "bulk debit card issuance"], [], []],
  "09.17": [["movimientos de tarjetas prepago", "prepaid card transactions"], [], []],
  "09.18": [["pagos con tarjetas prepago", "prepaid card payments"], [], []],
  "09.19": [["contrato de tarjeta de credito", "credit card agreement"], [], []],
  "09.20": [["dynamic cvv"], [], []],
  "09.21": [["contrato de tarjeta prepago", "prepaid card agreement"], [], []],
  "09.22": [["cancelar tarjeta de credito", "cancel credit card"], [], []],
  "09.23": [["cancelar tarjeta de debito", "cancel debit card"], [], []],
  "10.01": [["carta de credito de exportacion", "export letter of credit"], [], []],
  "10.02": [["carta de credito de importacion", "import letter of credit"], [], []],
  "10.04": [["financiacion de importaciones", "export finance"], [], []],
  "10.05": [["cambio de divisas", "foreign exchange", "currency exchange"], [], []],
  "10.07": [["digital trade finance", "trade finance platform"], [], []],
  "10.12": [["t-cambio"], [], []],
  "11.01": [["dashboard de tpvs (reportería tpvs)", "visión integral de tpvs (reportería tpvs)", "aggregate terminals"], [], []],
  "11.02": [["digital merchant onboarding", "payment gateway", "pasarela de pago", "pasarelas de pago", "stripe checkout", "merchant acquiring onboarding", "alta de comercio", "afiliación de comercios", "softpos", "tap to pay", "terminales pos", "merchant acquiring", "adquirencia", "terminal de pago", "pagos integrados en comercio"], ["alta de comercio", "afiliación", "afiliacion", "contratación", "contratacion", "merchant onboarding", "merchant registration", "merchant acquiring onboarding", "new payment terminal", "solicitar tpv", "solicitud tpv", "softpos", "tap to pay", "terminales pos", "merchant acquiring", "adquirencia"], ["child meal", "kids card", "teen card"]],
  "12.01": [["dashboard de inversión libre patrimonial", "visión integral de inversión libre patrimonial", "aggregate investments"], [], []],
  "12.04": [["term deposit", "time deposit"], [], []],
  "12.05": [["fondos de inversion", "investment funds"], [], []],
  "12.07": [["global markets", "mesa de tesoreria", "trading desk", "trading algoritmico", "trader algoritmico", "algorithmic trading"], [], []],
  "12.10": [["custodia de valores", "securities custody", "custody", "custodia"], [], []],
  "13.02": [["finanzas inteligentes", "factura empresarial"], [], []],
  "13.03": [["financial analysis"], [], []],
  "13.04": [["financial health"], [], []],
  "13.01": [["carbon footprint"], [], []],
  "14.01": [["dashboard de seguros", "visión integral de seguros", "aggregate insurance"], [], []],
  "14.02": [["ciberseguro", "ciber seguro", "cyber insurance"], [], []],
  "14.04": [["autoseguro pyme"], [], []],
  "15.01": [["beneficiary management"], [], []],
  "15.05": [["trust management"], [], []],
  "15.06": [["expediente digital", "gestion documental", "document management"], [], []],
  "15.11": [["archivos cifrados", "encrypted files"], [], []],
  "15.13": [["secure messaging"], [], []],
  "15.16": [["multiempresa", "multi-company"], [], []],
  "15.19": [["payment receipts"], ["descarga", "descargar", "download", "transaction receipt", "comprobante de operación", "comprobante de operacion", "comprobante de transferencia", "comprobante de pago", "payment receipt", "justificante bancario"], []],
  "16.01": [["login biometrico", "biometria", "biometricos", "biometric", "biometrics", "facial recognition", "problemas de acceso", "error al iniciar sesion", "no deja entrar", "unable to log in", "login outage", "fallo de autenticacion"], ["login", "log in", "log-in", "inicio de sesión", "iniciar sesión", "acceso al canal", "acceso a la app", "sign in", "sign-in", "signing in", "authentication", "autenticación", "passkey", "sesión biométrica"], ["border control", "police facial recognition"]],
  "16.03": [["recuperar contrasena", "password recovery"], [], []],
  "16.04": [["consent management"], [], []],
  "16.05": [["firma electronica", "electronic signature", "e-signature", "autorizar operaciones", "autorización de pagos", "autorizacion de pagos", "payment authorization", "approve transactions", "transaction signing", "biometric payment authorization"], [], []],
  "16.06": [["pending approvals"], [], []],
  "16.08": [["softtoken", "softoken", "soft token"], [], []],
  "16.10": [["onboarding digital", "digital onboarding", "onboarding empresas", "kyb", "kyc", "onboarding"], ["empresa", "empresas", "pymes", "corporate", "enterprise", "sme", "smes", "business account", "business banking", "personas jurídicas", "persona jurídica", "sociedades"], ["employee onboarding", "onboarding de empleados"]],
  "16.13": [["out-of-band signing"], [], []],
  "17.01": [["preguntas frecuentes"], [], []],
  "17.04": [["notificaciones", "notifications"], [], []],
  "17.06": [["roles y permisos", "user permissions", "multiusuario", "multi-level approvals"], [], []],
  "17.09": [["mensajeria a beneficiarios"], [], []],
  "17.12": [["auditoria del canal", "channel audit"], [], []],
  "17.15": [["host to host", "host-to-host"], [], []],
  "17.16": [["api bancaria", "banking api", "open banking", "open finance", "api", "apis", "integracion erp", "erp integration", "mcp", "model context protocol", "embedded finance", "integracion contable", "accounting integration", "integren banca y contabilidad", "integracion banca y contabilidad", "integra banca y contabilidad", "banking apis", "apis bancarias", "treasury api", "api de tesoreria"], [], ["google cloud customers", "clientes de google cloud", "api tutorial"]],
  "18.01": [["helpdesk"], [], []],
  "18.03": [["monitor funcional"], [], []],
  "19.08": [["multilingual"], [], []],
  "19.10": [["demo mode"], [], []],
  "19.18": [["feature toggles"], [], []],
  "19.21": [["accessibility"], [], []],
  "20.02": [["retargeting"], [], []],
  "20.03": [["analitica de navegacion", "web analytics"], [], []],
  "20.04": [["analitica cualitativa"], [], ["quantum computing", "computación cuántica", "ordenador cuántico", "quantum computer"]],
  "20.05": [["deep link", "deep linking"], [], []],
  "20.07": [["campaign attribution"], [], []],
  "20.08": [["personalizacion", "personalization", "personalisation", "a/b testing"], [], []],
  "21.02": [["customer feedback"], [], []]
};
const MARKETS_FUNCTIONAL_HEADERS = ['id', 'block', 'function', 'description'];

function normalizeReviewEvidence_(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function compileReviewRules_(catalog) {
  const index = new Map();
  for (const [id, , name] of catalog) {
    const [terms, required, excluded] = MARKETS_REVIEW_RULES[id] || [[], [], []];
    const context = required.map(normalizeReviewEvidence_).filter(Boolean);
    const exclude = excluded.map(normalizeReviewEvidence_).filter(Boolean);
    for (const phrase of new Set([name, ...terms].map(normalizeReviewEvidence_))) {
      if (!phrase.includes(' ') && !context.length) continue;
      const first = phrase.split(' ')[0];
      if (!index.has(first)) index.set(first, []);
      index.get(first).push({ id, phrase, context, exclude });
    }
  }
  return index;
}

function classifyReviewEvidence_(text, index) {
  const normalized = normalizeReviewEvidence_(text);
  const padded = ' ' + normalized + ' ';
  const matches = new Set();
  const contains = phrase => padded.includes(' ' + phrase + ' ');
  for (const word of new Set(normalized.split(' '))) {
    for (const rule of index.get(word) || []) {
      if (contains(rule.phrase) && (!rule.context.length || rule.context.some(contains)) &&
          !rule.exclude.some(contains)) matches.add(rule.id);
    }
  }
  if (!matches.size) {
    for (const [block, evidence] of Object.entries(MARKETS_REVIEW_BLOCK_EVIDENCE)) {
      if (evidence.test(normalized)) matches.add(block + '.xx');
    }
  }
  return [...matches].sort();
}

function syncMarketsFunctionalCatalog_() {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { deferred: true };
  try {
    const ss = openMarketsSpreadsheet_(), master = SpreadsheetApp.openById(MARKETS_FUNCTIONAL_MASTER);
    const seen = new Set(), rows = [];
    for (const name of MARKETS_FUNCTIONAL_TABS) {
      const source = master.getSheetByName(name);
      if (!source || source.getLastRow() > 1500) throw new Error('Pestaña de catálogo ausente o fuera de límite: ' + name);
      const values = source.getRange(1, 1, source.getLastRow(), 6).getDisplayValues();
      const header = values.findIndex(row => row.includes('ID') && row.includes('Bloque funcional') &&
        row.includes('Funcionalidad/Sub Operativa'));
      if (header < 0) throw new Error('Cabecera de catálogo no válida: ' + name);
      const columns = ['ID', 'Bloque funcional', 'Funcionalidad/Sub Operativa', 'Descripción']
        .map(label => values[header].indexOf(label));
      for (const sourceRow of values.slice(header + 1)) {
        const [id, block, feature, description] = columns.map(column => String(sourceRow[column] || '').trim());
        if (!/^\d{2}\.\d{2}$/.test(id)) continue;
        if (!block || !feature || seen.has(id)) throw new Error('Funcionalidad incompleta o duplicada: ' + id);
        seen.add(id);
        rows.push([id, block, feature, description]);
      }
    }
    if (!rows.length) throw new Error('Catálogo funcional vacío.');
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    const properties = PropertiesService.getScriptProperties();
    const revision = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(rows)));
    const existing = ss.getSheetByName('FUNCTIONAL_CATALOG');
    const changed = !existing || properties.getProperty('MARKETS_FUNCTIONAL_REVISION') !== revision;
    if (changed) {
      const sheet = existing || ss.insertSheet('FUNCTIONAL_CATALOG');
      const previous = sheet.getLastRow();
      ensureSheetCapacity_(sheet, rows.length + 1, 4);
      sheet.getRange(1, 1, rows.length + 1, 4).setNumberFormat('@')
        .setValues([MARKETS_FUNCTIONAL_HEADERS, ...rows].map(row => row.map(marketsReviewLiteral_)));
      if (previous > rows.length + 1) sheet.getRange(rows.length + 2, 1, previous - rows.length - 1, 4).clearContent();
      sheet.setFrozenRows(1);
      SpreadsheetApp.flush();
      properties.setProperty('MARKETS_FUNCTIONAL_REVISION', revision);
    }
    properties.setProperty('MARKETS_FUNCTIONAL_SYNCED', new Date().toISOString());
    return { changed, functions: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function setupMarketsReviewInsights() {
  requireMarketsReviewOwner_();
  const result = syncMarketsFunctionalCatalog_();
  if (!ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === 'syncMarketsFunctionalCatalog_')) {
    ScriptApp.newTrigger('syncMarketsFunctionalCatalog_').timeBased().everyDays(1).atHour(10)
      .inTimezone('Europe/Madrid').create();
  }
  return result;
}

function getMarketsReviewHeatmap(filters) {
  currentMarketsUserEmail_();
  const ss = openMarketsSpreadsheet_();
  const catalog = ss.getSheetByName('FUNCTIONAL_CATALOG');
  if (!catalog || catalog.getLastRow() < 2) return { configured: false, functions: [] };
  const properties = PropertiesService.getScriptProperties();
  const sheet = marketsReviewSheet_(ss);
  const period = /^\d{4}-\d{2}$/.test(filters?.period) ? filters.period : '';
  const country = /^[A-Z]{2}$/.test(filters?.country) ? filters.country : '';
  const platform = ['Android', 'iOS'].includes(filters?.platform) ? filters.platform : '';
  const appName = String(filters?.app || '').slice(0, 150);
  const revision = properties.getProperty('MARKETS_FUNCTIONAL_REVISION');
  const bucket = Math.floor(Date.now() / 300000);
  const key = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(['v2', revision, sheet.getLastRow(), bucket, period, country, platform, appName])));
  return readMarketsWebCache_('review-heatmap:' + key, () => {
    const taxonomy = catalog.getRange(2, 1, catalog.getLastRow() - 1, 4).getDisplayValues();
    const rules = compileReviewRules_(taxonomy);
    const topics = {};
    const groups = { entities: new Map(), markets: new Map() };
    for (const [id, block, name] of taxonomy) {
      topics[id] = name;
      topics[id.slice(0, 2)] = block;
      topics[id.slice(0, 2) + '.xx'] = block + ' · Sin suboperativa identificada';
    }
    const apps = readAppCatalog_(ss);
    const byKey = new Map(apps.map(app => [app.appKey, app]));
    const byMarketPackage = new Map(apps.filter(app => app.platform === 'Android')
      .map(app => [app.countryCode + '|' + app.packageName, app]));
    let complaints = 0, classified = 0;
    const last = sheet.getLastRow();
    for (let first = 2; first <= last; first += 1000) {
      const rows = sheet.getRange(first, 1, Math.min(1000, last - first + 1), 11).getValues();
      for (const [, key, markets, source, listing, , date, rating, , title, original] of rows) {
        if (!(rating >= 1 && rating <= 3) || (platform && source !== platform) ||
            (period && !String(date).startsWith(period))) continue;
        const selectedMarkets = String(markets).split(',').filter(code => !country || code === country);
        if (!selectedMarkets.length) continue;
        const candidates = source === 'Android'
          ? selectedMarkets.map(code => byMarketPackage.get(code + '|' + listing)).filter(Boolean)
          : [byKey.get(key)].filter(Boolean);
        const nameOf = app => app.isBbva ? 'BBVA Empresas' : app.appName;
        const matched = candidates.filter(app => !appName || nameOf(app) === appName);
        if (!matched.length) continue;
        complaints++;
        const ids = classifyReviewEvidence_([title, original].join(' '), rules).filter(id => topics[id]);
        if (ids.length) classified++;
        const categories = new Set(ids.flatMap(id => [id, id.slice(0, 2)]));
        for (const [axis, labels] of [
          ['entities', new Set(matched.map(nameOf))],
          ['markets', new Set(matched.map(app => app.countryCode))]
        ]) {
          for (const label of labels) {
            const group = groups[axis].get(label) || { label, total: 0, counts: {} };
            group.total++;
            for (const id of categories) group.counts[id] = (group.counts[id] || 0) + 1;
            groups[axis].set(label, group);
          }
        }
      }
    }
    return { configured: true, complaints, classified, topics,
      groups: Object.fromEntries(Object.entries(groups).map(([axis, values]) => [axis, [...values.values()]
        .sort((a, b) => Number(b.label === 'BBVA Empresas') - Number(a.label === 'BBVA Empresas') ||
          b.total - a.total || a.label.localeCompare(b.label))])) };
  });
}

function reviewTopicRules_(ss) {
  const catalog = ss.getSheetByName('FUNCTIONAL_CATALOG');
  return catalog && catalog.getLastRow() > 1
    ? compileReviewRules_(catalog.getRange(2, 1, catalog.getLastRow() - 1, 3).getDisplayValues())
    : new Map();
}

const MARKETS_REVIEW_ENTITY = 'BBVA Empresas';
const MARKETS_REVIEW_SNAPSHOT_SCHEMA = 4;
const MARKETS_REVIEW_HELPFUL_MIN = 5;

function marketsReviewWindow_(filters = {}) {
  const today = Utilities.formatDate(new Date(), MARKETS_CONFIG.timeZone, 'yyyy-MM-dd');
  const earliest = shiftReviewDay_(today, -365);
  const start = filters.start && filters.start > earliest ? filters.start : earliest;
  const end = filters.end && filters.end < today ? filters.end : today;
  const recent = shiftReviewDay_(end, -29);
  return { start, recent: recent < start ? start : recent, end };
}

function marketsAnnualReviewWindow_(window) {
  const annual = marketsReviewWindow_({ end: window.end });
  const start = shiftReviewDay_(annual.end, -364);
  return { start: start > annual.start ? start : annual.start, end: annual.end };
}

function shiftReviewDay_(date, days) {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}

function marketsDefaultCommentStart_(end) {
  const [year, month] = end.split('-').map(Number);
  return shiftReviewDay_(end, 1 - new Date(Date.UTC(year, month, 0)).getUTCDate());
}

function marketsReviewDigest_(value) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value)));
}

function marketsReviewCatalogVersion_(catalog) {
  const listings = catalog.filter(app => app.platform === 'Android' || app.platform === 'iOS')
    .map(app => JSON.stringify([app.appKey, app.platform, app.countryCode, app.packageName, app.appId, app.appName, app.isBbva]));
  return marketsReviewDigest_(listings.sort());
}

function marketsReviewVersions_(properties, catalogVersion) {
  return [properties.MARKETS_REVIEWS_GENERATION || '', properties.MARKETS_FUNCTIONAL_REVISION || '', catalogVersion];
}

function marketsReviewSnapshotScope_(operation, filters, window) {
  if (filters.year || filters.analysisMonth || filters.platform !== 'ALL' || filters.topic || filters.rating || filters.search || filters.reviewKey ||
      filters.period || Number(filters.page || 0) !== 0) return '';
  const language = ['es', 'en', 'tr'].includes(filters.language) ? filters.language : 'es';
  if (operation === 'page') {
    return filters.app === 'BBVA Empresas' && !filters.segment && window.start === marketsDefaultCommentStart_(window.end)
      ? ['page', filters.country, language].join(':') : '';
  }
  return (!filters.entity || filters.entity === MARKETS_REVIEW_ENTITY) && !filters.app && filters.segment === 'DETRACTOR' && window.start === shiftReviewDay_(window.end, -365)
    ? ['analytics', filters.country].join(':') : '';
}

function publishMarketsReviewSnapshot_() {
  const ss = openMarketsSpreadsheet_();
  const properties = PropertiesService.getScriptProperties();
  const catalog = readAppCatalog_(ss), catalogVersion = marketsReviewCatalogVersion_(catalog);
  const versions = marketsReviewVersions_(properties.getProperties(), catalogVersion);
  const { end } = marketsReviewWindow_();
  const previous = readMarketsPersistentCache_('review-snapshot');
  if (previous?.schema === MARKETS_REVIEW_SNAPSHOT_SCHEMA && previous.end === end && JSON.stringify(previous.versions) === JSON.stringify(versions)) {
    return { complete: true, published: Object.keys(previous.values).length };
  }
  const analyticsWindow = marketsReviewWindow_();
  const annualWindow = marketsAnnualReviewWindow_(analyticsWindow);
  const commentWindow = marketsReviewWindow_({ start: marketsDefaultCommentStart_(end) });
  const topics = marketsReviewTopics_(ss);
  const rows = queryMarketsReviews_(ss, { country: 'ALL', platform: 'ALL' }, analyticsWindow, true, catalog);
  const byCountry = new Map();
  const comments = [];
  for (const row of rows) {
    if (row.countries.length !== 1) continue;
    const [country] = row.countries;
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country).push(row);
    if (row.date >= commentWindow.start && row.entities.includes(MARKETS_REVIEW_ENTITY)) comments.push(row);
  }
  const values = {};
  for (const country of ['ALL', ...MARKETS_WEB.countryCodes]) {
    const scoped = country === 'ALL' ? rows : byCountry.get(country) || [];
    const analytics = summarizeMarketsReviewAnalytics_(scoped, topics, { segment: 'DETRACTOR', entity: MARKETS_REVIEW_ENTITY }, analyticsWindow, annualWindow);
    values['analytics:' + country] = analytics;
    if (country === 'ALL') continue;
    for (const language of ['es', 'en', 'tr']) {
      const page = paginateMarketsReviews_(comments, { country, topics }, commentWindow);
      page.rows = page.rows.map(({ translations, ...row }) => {
        const translated = translations[language];
        return { ...row, text: translated || row.original, translated: Boolean(translated && translated !== row.original) };
      });
      values['page:' + country + ':' + language] = page;
    }
  }
  if (JSON.stringify(marketsReviewVersions_(properties.getProperties(), catalogVersion)) !== JSON.stringify(versions)) {
    return { complete: false, published: 0 };
  }
  const result = tryWriteMarketsPersistentCache_('review-snapshot', { end, versions, values, schema: MARKETS_REVIEW_SNAPSHOT_SCHEMA }, end);
  if (!result.ok) throw new Error(result.error);
  return { complete: true, published: Object.keys(values).length };
}

function getMarketsReviewPage(filters) {
  currentMarketsUserEmail_();
  filters = normalizeMarketsReviewFilters_(filters);
  if (filters.country === 'ALL') throw new Error('Selecciona una geografía para consultar los comentarios.');
  const ss = openMarketsSpreadsheet_();
  if (!filters.start && !filters.period) {
    const { end } = marketsReviewWindow_(filters);
    filters.start = marketsDefaultCommentStart_(end);
  }
  const window = marketsReviewWindow_(filters);
  if (filters.start && filters.start < window.start) window.start = filters.start;
  return readMarketsReviewCache_(ss, 'page', filters, window, catalog => {
    const rows = queryMarketsReviews_(ss, { ...filters, country: 'ALL', territorialOnly: true }, window, false, catalog);
    return paginateMarketsReviews_(rows, { ...filters, topics: marketsReviewTopics_(ss) }, window);
  });
}

function normalizeMarketsReviewFilters_(filters) {
  filters = filters || {};
  const country = filters.country || 'ALL', platform = filters.platform || 'ALL';
  if (!/^(ALL|[A-Z]{2})$/.test(country) || !['ALL', 'iOS', 'Android', 'Huawei'].includes(platform)) {
    throw new Error('Geografía o plataforma no válidas.');
  }
  for (const value of [filters.start, filters.end]) {
    if (value && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) {
      throw new Error('Fecha no válida.');
    }
  }
  if (filters.start && filters.end && filters.start > filters.end) throw new Error('Intervalo no válido.');
  if (filters.year && !/^(?:19|20)\d{2}$/.test(filters.year)) throw new Error('Año no válido.');
  if (filters.analysisMonth && !/^(?:19|20)\d{2}-(0[1-9]|1[0-2])$/.test(filters.analysisMonth)) throw new Error('Mes no válido.');
  if (filters.period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.period)) throw new Error('Mes no válido.');
  if (filters.topic && !/^(general|\d{2})$/.test(filters.topic)) throw new Error('Bloque no válido.');
  if (filters.rating !== undefined && filters.rating !== '' && !/^[1-5]$/.test(filters.rating)) {
    throw new Error('Número de estrellas no válido.');
  }
  const normalized = { country, platform, page: Math.min(10000, Math.max(0, Math.floor(Number(filters.page) || 0))) };
  for (const key of ['start', 'end', 'year', 'analysisMonth', 'period', 'topic', 'segment', 'app', 'entity', 'reviewKey', 'search']) {
    if (typeof filters[key] === 'string' && filters[key]) normalized[key] = filters[key].slice(0, 200);
  }
  if (filters.rating) normalized.rating = String(filters.rating);
  if (['es', 'en', 'tr'].includes(filters.language)) normalized.language = filters.language;
  return normalized;
}

function paginateMarketsReviews_(rows, filters, window) {
  const counts = Object.create(null);
  const matching = [];
  for (const row of rows) {
    if (row.countries.length !== 1) continue;
    const [country] = row.countries;
    counts[country] = (counts[country] || 0) + 1;
    if (country === filters.country) matching.push(row);
  }
  const size = 25;
  const page = Math.min(Math.max(0, Math.ceil(matching.length / size) - 1),
    Math.max(0, Math.trunc(Number(filters.page) || 0)));
  return { page, size, total: matching.length, rows: matching.slice(page * size, (page + 1) * size),
    counts, topics: filters.topics, window };
}

function getMarketsReviewAnalytics(filters) {
  currentMarketsUserEmail_();
  const ss = openMarketsSpreadsheet_();
  filters = normalizeMarketsReviewFilters_(filters);
  const window = marketsReviewWindow_(filters);
  const today = marketsReviewWindow_().end;
  if (filters.year) {
    window.start = filters.year + '-01-01';
    window.end = [today, filters.year + '-12-31'].sort()[0];
    window.recent = window.start;
  }
  if (filters.analysisMonth) {
    const start = filters.analysisMonth + '-01';
    const [year, month] = filters.analysisMonth.split('-').map(Number);
    window.recent = start;
    window.end = [today, shiftReviewDay_(new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10), -1)].sort()[0];
    if (window.start >= start) window.start = (year - 1) + '-01-01';
  }
  filters.entity = filters.entity || MARKETS_REVIEW_ENTITY;
  const language = filters.language || 'es';
  delete filters.language;
  const data = readMarketsReviewCache_(ss, 'analytics', filters, window, catalog => {
    const topics = marketsReviewTopics_(ss);
    const annual = filters.year ? { start: window.start, end: window.end } : marketsAnnualReviewWindow_(window);
    const previous = filters.year ? { start: (Number(filters.year) - 1) + '-01-01', end: (Number(filters.year) - 1) + '-12-31' } : null;
    const start = previous?.start || (annual.start < window.start ? annual.start : window.start);
    const rows = queryMarketsReviews_(ss, { ...filters, app: '', segment: '', start }, { start, end: window.end }, true, catalog);
    const result = summarizeMarketsReviewAnalytics_(rows, topics, filters, window, annual);
    if (previous) {
      const priorRows = rows.filter(row => row.date >= previous.start && row.date <= previous.end);
      result.annual.previousTotal = priorRows.length ? priorRows.filter(row => row.entities.includes(filters.entity)).length : null;
    }
    return result;
  });
  function localizeReview({ translations, ...review }) {
    const translated = translations?.[language];
    return { ...review, text: translated || review.original, translated: Boolean(translated && translated !== review.original) };
  }
  return {
    ...data,
    examples: data.examples.map(({ block, review }) => ({ block, review: localizeReview(review) })),
    annual: { ...data.annual, topHelpful: data.annual.topHelpful.map(localizeReview) }
  };
}

function readMarketsReviewCache_(ss, operation, filters, window, builder) {
  const properties = PropertiesService.getScriptProperties().getProperties();
  const catalog = readAppCatalog_(ss);
  const versions = marketsReviewVersions_(properties, marketsReviewCatalogVersion_(catalog));
  const scope = Object.keys(filters).sort().map(key => [key, filters[key]]);
  const key = marketsReviewDigest_(['review', MARKETS_REVIEW_SNAPSHOT_SCHEMA, operation, ss.getId(), window.start, window.end, versions, scope]);
  return readMarketsWebCache_('market-review:' + key, () => {
    const snapshotScope = marketsReviewSnapshotScope_(operation, filters, window);
    if (snapshotScope) {
      const snapshot = readMarketsPersistentCache_('review-snapshot');
      if (snapshot?.schema === MARKETS_REVIEW_SNAPSHOT_SCHEMA && snapshot.end === window.end &&
          JSON.stringify(snapshot.versions) === JSON.stringify(versions) &&
          Object.hasOwn(snapshot.values, snapshotScope)) return snapshot.values[snapshotScope];
    }
    return builder(catalog);
  });
}

function advanceMarketsReviewGeneration_(properties) {
  try { properties.setProperty('MARKETS_REVIEWS_GENERATION', String(Date.now())); }
  catch (error) { console.warn('No se pudo invalidar la caché de reseñas. ' + error.message); }
}

function marketsReviewTopics_(ss) {
  const catalog = ss.getSheetByName('FUNCTIONAL_CATALOG');
  const topics = { general: 'Generalista' };
  if (catalog && catalog.getLastRow() > 1) {
    for (const [id, label] of catalog.getRange(2, 1, catalog.getLastRow() - 1, 2).getDisplayValues()) {
      if (/^\d{2}\./.test(id) && label) topics[id.slice(0, 2)] = label;
    }
  }
  return topics;
}

function reviewBalancePoints_(stats) {
  return 100 * (stats.promoters - stats.detractors) / stats.total;
}

function summarizeMarketsReviewAnalytics_(rows, topics, filters, window, annual = window) {
  const segment = MARKETS_DEFAULT_REVIEW_SEGMENTS.find(group => group.id === filters.segment);
  if (filters.segment && !segment) throw new Error('Segmento de comentarios desconocido.');
  const visible = rows.filter(row => row.date >= window.start && row.date <= window.end);
  const selected = visible.filter(row => !segment || segment.stars.includes(row.rating));
  const blocksOf = row => {
    const blocks = row.blocks.filter(id => Object.hasOwn(topics, id));
    return blocks.length ? blocks : ['general'];
  };
  const groups = new Map();
  const monthly = new Map();
  const local = selected.filter(row => row.entities.includes(filters.entity || MARKETS_REVIEW_ENTITY));
  const net = rating => MARKETS_DEFAULT_REVIEW_SEGMENTS[2].stars.includes(rating) ? 1
    : MARKETS_DEFAULT_REVIEW_SEGMENTS[0].stars.includes(rating) ? -1 : 0;
  const blockTotals = new Map();
  for (const row of selected) {
    const blocks = blocksOf(row);
    for (const block of blocks) blockTotals.set(block, (blockTotals.get(block) || 0) + 1);
    for (const entity of row.entities) {
      const group = groups.get(entity) || { label: entity, total: 0, counts: {} };
      group.total++;
      for (const block of blocks) group.counts[block] = (group.counts[block] || 0) + 1;
      groups.set(entity, group);
    }
  }
  for (const row of filters.year ? [] : visible) {
    const month = row.date.slice(0, 7);
    for (const entity of row.entities) {
      const key = JSON.stringify([entity, month]);
      const point = monthly.get(key) || { entity, month, total: 0, promoters: 0, detractors: 0 };
      point.total++;
      point.promoters += Number(net(row.rating) === 1);
      point.detractors += Number(net(row.rating) === -1);
      monthly.set(key, point);
    }
  }
  const base = { total: 0, promoters: 0, detractors: 0 };
  const recent = [], recentBlocks = new Map();
  function count(target, row) {
    const score = net(row.rating);
    target.total++;
    target.promoters += Number(score === 1);
    target.detractors += Number(score === -1);
  }
  for (const row of filters.year ? [] : local) {
    if (row.date < window.recent) {
      count(base, row);
      continue;
    }
    recent.push(row);
    for (const id of blocksOf(row)) {
      if (!recentBlocks.has(id)) recentBlocks.set(id, { total: 0, promoters: 0, detractors: 0 });
      count(recentBlocks.get(id), row);
    }
  }
  const baseline = base.total ? { ...base, balance: reviewBalancePoints_(base), start: window.start,
    end: shiftReviewDay_(window.recent, -1) } : null;
  const deltas = [...recentBlocks].map(([id, stats]) => {
    const balance = reviewBalancePoints_(stats);
    return { id, label: topics[id], ...stats, weight: 100 * stats.total / recent.length,
      balance, gap: baseline ? balance - baseline.balance : null };
  }).sort((a, b) => a.gap - b.gap || a.label.localeCompare(b.label));
  const examples = [];
  const used = new Set();
  for (const block of ['general', ...deltas.filter(item => item.id !== 'general').slice(0, 3).map(item => item.id)]) {
    const example = selectMarketsReviewExample_(recent.filter(row => blocksOf(row).includes(block)), used);
    if (!example) continue;
    used.add(normalizeReviewEvidence_([example.title, example.original].join(' ')));
    examples.push({ block, review: example });
  }
  const leading = [...blockTotals].filter(([id]) => id !== 'general')
    .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))[0];
  return { window, topics, examples, total: selected.length, leadingBlock: leading ? { id: leading[0], count: leading[1] } : null,
    annual: summarizeAnnualMarketsReviews_(rows, filters.entity || MARKETS_REVIEW_ENTITY, annual, net),
    entities: [...groups.values()].sort((a, b) => Number(b.label === 'BBVA Empresas') - Number(a.label === 'BBVA Empresas') ||
      b.total - a.total || a.label.localeCompare(b.label)), entityOptions: [...new Set(visible.flatMap(row => row.entities))].sort(),
    monthlyEntityOptions: [...new Set(visible.flatMap(row => row.entities))].sort(),
    monthly: [...monthly.values()].map(point => ({ ...point, balance: reviewBalancePoints_(point) })),
    deltas, baseline, recentTotal: recent.length };
}


function summarizeAnnualMarketsReviews_(rows, entity, { start, end }, net) {
  const summary = { start, end, total: 0, promoters: 0, detractors: 0, neutral: 0, helpful: 0, answered: 0 };
  const helpful = [], authors = new Map();
  for (const row of rows) {
    if (row.date < start || row.date > end || !row.entities.includes(entity)) continue;
    summary.total++;
    const score = net(row.rating);
    summary[score > 0 ? 'promoters' : score < 0 ? 'detractors' : 'neutral']++;
    if (Number.isInteger(row.helpful) && row.helpful >= MARKETS_REVIEW_HELPFUL_MIN) helpful.push(row);
    if (row.reply?.trim()) summary.answered++;
    const author = row.author?.trim();
    if (author) authors.set(author, (authors.get(author) || 0) + 1);
  }
  return { ...summary, helpful: helpful.length, helpfulMinimum: MARKETS_REVIEW_HELPFUL_MIN,
    topHelpful: helpful.sort((a, b) => b.helpful - a.helpful || b.date.localeCompare(a.date) || a.key.localeCompare(b.key)).slice(0, 3),
    topAuthors: [...authors].sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
      .slice(0, 3).map(([author, count]) => ({ author, count })) };
}

function selectMarketsReviewExample_(rows, used) {
  const documents = new Map();
  const frequency = new Map();
  const stop = new Set('para como este esta esto pero porque desde hasta sobre with this that from have your bir için ama olan'.split(' '));
  for (const row of rows) {
    const text = normalizeReviewEvidence_([row.title, row.original].join(' '));
    if (!text || used.has(text) || documents.has(text)) continue;
    const terms = new Set(text.split(' ').filter(word => word.length > 2 && !stop.has(word) && !/\d/.test(word)));
    if (!terms.size) continue;
    documents.set(text, { row, terms });
    for (const term of terms) frequency.set(term, (frequency.get(term) || 0) + 1);
  }
  const count = documents.size;
  const centroid = new Map();
  const vectors = [];
  for (const { row, terms } of documents.values()) {
    const vector = [...terms].map(term => [term, Math.log((count + 1) / (frequency.get(term) + 1)) + 1]);
    const length = Math.sqrt(vector.reduce((sum, [, value]) => sum + value * value, 0));
    const unit = vector.map(([term, value]) => [term, value / length]);
    for (const [term, value] of unit) centroid.set(term, (centroid.get(term) || 0) + value / count);
    vectors.push({ row, unit });
  }
  return vectors.map(({ row, unit }) => ({ row, score: unit.reduce((sum, [term, value]) => sum + value * centroid.get(term), 0) }))
    .sort((a, b) => b.score - a.score || a.row.key.localeCompare(b.row.key))[0]?.row;
}
