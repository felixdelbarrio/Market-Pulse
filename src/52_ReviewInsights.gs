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
  const { ss } = requireMarketsAdministrator_();
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
    JSON.stringify(['v1', revision, sheet.getLastRow(), bucket, period, country, platform, appName])));
  return readMarketsWebCache_('review-heatmap:' + key, () => {
    const taxonomy = catalog.getRange(2, 1, catalog.getLastRow() - 1, 4).getDisplayValues();
    const rules = compileReviewRules_(taxonomy);
    const counts = new Map(taxonomy.map(([id, block, name]) => [id, { id, block, name, bbva: 0, peers: 0 }]));
    for (const [id, block] of taxonomy) {
      const key = id.slice(0, 2) + '.xx';
      if (!counts.has(key)) counts.set(key, { id: key, block, name: 'Sin suboperativa identificada', bbva: 0, peers: 0 });
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
        const app = candidates.find(item => !appName || (item.isBbva ? 'BBVA Empresas' : item.appName) === appName);
        if (!app) continue;
        complaints++;
        const ids = classifyReviewEvidence_([title, original].join(' '), rules);
        if (ids.length) classified++;
        for (const id of ids) if (counts.has(id)) counts.get(id)[app.isBbva ? 'bbva' : 'peers']++;
      }
    }
    return { configured: true, complaints, classified, syncedAt: properties.getProperty('MARKETS_FUNCTIONAL_SYNCED'),
      functions: [...counts.values()].filter(row => row.bbva || row.peers)
        .sort((a, b) => b.bbva + b.peers - a.bbva - a.peers) };
  });
}
