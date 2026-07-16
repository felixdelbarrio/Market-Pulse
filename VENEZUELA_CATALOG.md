# Catalogo Venezuela

Identificadores verificados el 2026-07-16. La seleccion prioriza productos empresariales o apps que admiten operativa de empresas.

| Orden | App | Android package | iOS app ID | Huawei app ID |
|---:|---|---|---:|---|
| 0 | BBVA | `com.bbva.empresas` | `1590189082` | `C1751602113005231488` |
| 1 | Mercantil Empresas | `com.mercantilbanco.mme.mercantilmovil` | `1548017515` | `C1746451170823523136` |
| 2 | Banesco VE | `com.banesco.samfbancamovilunificada` | `1497546462` | `C1801620142921151424` |
| 3 | Bancaribe Empresas | `bancaribeMobileBankingCash.v1` | `1542090352` | `C1765377894340655808` |
| 4 | BNC | `bnc.bncnet.mobile2` | `1635259975` | `C1742708304376777536` |

## Criterios operativos

- BBVA Empresas es la app comparable de negocio. La ficha iOS es visible en la tienda venezolana, aunque su descripcion comercial actual no enumera Venezuela; conviene confirmar esta eleccion con el owner de producto antes de publicar el dashboard.
- Banesco VE admite acceso de `BanescOnline Empresa`; BNC incluye nominas, proveedores e impuestos. Mercantil y Bancaribe tienen fichas explicitamente empresariales.
- Los `APP_ID` de Huawei se resolvieron por paquete con la API publica utilizada por AppGallery. En la comprobacion inicial las cinco apps devolvieron cero valoraciones publicas, por lo que el dataset conserva celdas vacias.
- `DISPLAY_ORDER` controla el orden esperado en tablas; no se utiliza para afirmar un ranking regulatorio por activos. Si el negocio necesita exactamente los cuatro mayores bancos por activos, sustituya las filas de competidor tras validar el periodo y la fuente regulatoria.

## Fuentes de tienda

- Google Play: `https://play.google.com/store/apps/details?id=<PACKAGE_NAME>&gl=VE`
- Apple lookup: `https://itunes.apple.com/lookup?id=<APP_ID>&country=ve`
- AppGallery discovery: `https://web-dre.hispace.dbankcloud.com/edge/webedge/appinfo`
