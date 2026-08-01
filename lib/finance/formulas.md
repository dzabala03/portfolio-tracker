# Fórmulas Financieras — Portfolio Tracker

> Fuente de verdad matemática del proyecto.
> Cualquier cambio en estas fórmulas debe reflejarse primero aquí,
> luego en `calculations.ts`.

---

## 1. Costo Promedio Ponderado Móvil (Moving Weighted Average)

Se recalcula con cada compra. Las ventas no modifican el costo promedio,
solo reducen la cantidad de acciones.

```
Al comprar:
  new_avg_cost = (shares_held × avg_cost + buy_shares × buy_price + fees)
                 ─────────────────────────────────────────────────────────
                              (shares_held + buy_shares)

Al vender:
  avg_cost no cambia
  shares_held -= sell_shares
```

> Por qué Costo Promedio y no FIFO: más simple de implementar y suficiente
> para tracking personal. FIFO es requerido para Schedule D (impuestos EE.UU.).
> Si en el futuro se necesita reporte fiscal, se debe refactorizar a FIFO.

---

## 2. Valor Actual de la Posición

```
current_value = shares_held × current_price
```

---

## 3. Capital Invertido Activo

```
invested_value = shares_held × avg_cost
```
(No incluye comisiones ya pagadas — están absorbidas en el avg_cost)

---

## 4. P&G No Realizado (Unrealized P&L)

```
unrealized_pnl     = current_value − invested_value
unrealized_pnl_pct = (unrealized_pnl / invested_value) × 100
```

---

## 5. P&G Realizado (Realized P&L)

Se calcula en el momento de cada venta usando el avg_cost vigente en ese momento.

```
realized_pnl += (sell_price − avg_cost_at_sell) × sell_shares − fees
```

---

## 6. Variación del Día

```
daily_change     = (current_price − prev_close) × shares_held
daily_change_pct = ((current_price − prev_close) / prev_close) × 100
```

`prev_close` viene del campo `pc` de Finnhub Quote API.

---

## 7. % Rentabilidad Total del Portafolio

```
total_return_pct = (total_unrealized_pnl / total_invested_value) × 100
```

---

## 8. Peso en el Portafolio (Allocation)

```
weight = (holding.current_value / portfolio.total_value) × 100
```

---

## 9. Capital Neto Invertido (para el resumen)

```
total_invested = Σ(buy_shares × buy_price + fees) − Σ(sell_shares × sell_price − fees)
```

Nota: este es el capital que aún está "en juego" o que fue a venta.

---

## 10. Capital Neto en Mercado (histórico, no solo posiciones abiertas)

```
net_capital_in_market = Σ(buy_shares × buy_price + fees) − Σ(sell_shares × sell_price − fees)
```

Sobre TODAS las transacciones BUY/SELL, no solo las de posiciones actualmente
abiertas (a diferencia de `total_invested`, fórmula 9 original, que solo
suma lo abierto). Es el dinero que sigue "puesto" en el mercado ahora mismo.

---

## 11. Efectivo Disponible

```
cash_available = net_cash_flow − net_capital_in_market
cash_available_pct = (cash_available / (total_value + cash_available)) × 100
```

`net_cash_flow` viene de la fórmula de flujo de caja (depósitos + dividendos
+ intereses − retiros − comisiones sueltas). Es el efectivo que entró/salió
de la cuenta y no está actualmente invertido en ninguna posición.

---

## 12. Rendimiento Total desde el Inicio

```
total_return = total_unrealized_pnl + total_realized_pnl + total_dividends + total_interest − total_fees
total_return_pct = (total_return / (total_deposits − total_withdrawals)) × 100
```

Es un % de retorno simple sobre el capital neto aportado, **no** TWR ni XIRR
(no pondera por el momento en que entró cada depósito). Sirve como
aproximación rápida de "cuánto ha crecido mi dinero desde que empecé".

---

## 13. Distribución por Sector

```
sector_pct = (Σ current_value de holdings en ese sector) / (total_value + cash_available) × 100
```

El sector de cada ticker viene de `finnhubIndustry` (Finnhub `/stock/profile2`).
El efectivo disponible se muestra como una categoría más ("Efectivo") para
que la distribución sume ~100% del patrimonio neto, no solo de lo invertido.

---

## 14. Serie diaria de valor del portafolio (histórico)

Se reconstruye, no se guarda snapshot a snapshot. Para cada día bursátil
del rango pedido (calendario tomado de los precios de cierre de Yahoo
Finance — ver `lib/yahoo/client.ts`):

```
valor(día) = efectivo_acumulado(día) + Σ shares_held(ticker, día) × cierre(ticker, día)
```

`shares_held` y `efectivo_acumulado` se obtienen reproduciendo TODAS las
transacciones (no solo las del rango) hasta esa fecha — así el primer día
del rango ya arranca con el estado correcto. Si un ticker no tiene cierre
ese día exacto (gap de datos), se usa el último cierre conocido.

---

## 15. TWR — Time-Weighted Return

Chain-linking de retornos diarios, ajustando el día en que hay un aporte
o retiro externo (no cuentan dividendos/intereses: son retorno de la
inversión, no capital nuevo):

```
base(día)   = valor(día − 1) + flujo_externo(día)
retorno(día) = valor(día) / base(día) − 1

TWR = ( Π (1 + retorno(día)) ) − 1
```

El aporte se trata como puesto al inicio del día, antes del movimiento de
mercado — convención estándar cuando no se tiene el valor intradía exacto
en el momento del flujo. Como se calcula con revaluación diaria real (no
una aproximación), es TWR "verdadero", no Modified Dietz.

---

## 16. MWR — Money-Weighted Return (Modified Dietz)

Aproximación estándar GIPS/CFA, sin resolver una TIR iterativa:

```
MWR = (V_fin − V_ini − ΣCF_i) / (V_ini + Σ CF_i × w_i)

w_i = (días_restantes_hasta_fin) / (días_totales_del_período)
```

Un aporte grande cerca del final del período pesa poco en el denominador
(`w_i` chico) — por eso penaliza fuerte si depositaste justo antes de una
caída: la pérdida golpea contra una base de capital que casi no creció.

**Fuente de precios históricos:** el free tier de Finnhub rechaza
`/stock/candle` para acciones US (403, solo forex/crypto). Se usa el
endpoint no oficial de Yahoo Finance (`query1.finance.yahoo.com/.../chart`)
— sin API key, pero no documentado ni garantizado por Yahoo. Si deja de
responder, revisar `lib/yahoo/client.ts` antes de asumir falta de datos.

---

## 18. Variación a 30 días por posición

```
change_30d_pct   = (precio_actual − precio_hace_30d) / precio_hace_30d × 100
change_30d_value = (precio_actual − precio_hace_30d) × acciones_actuales
```

`precio_hace_30d` es el cierre de Yahoo más cercano (en o antes) a la
fecha de hace 30 días naturales. "Mejor/Peor activo (30d)" en el panel
de Distribución son, entre las posiciones abiertas, la de mayor y menor
`change_30d_pct`. Usa la cantidad de acciones ACTUAL (no la de hace 30
días) — si compraste más de un ticker en el medio, el $ mostrado no es
literalmente "lo que ganaste esas acciones en 30 días", sino "cuánto
valdría hoy el cambio de precio aplicado a lo que tienes ahora".

---

## 19. Índices de mercado en vivo

Finnhub free tier rechaza símbolos de índice directos (`^GSPC`, `^DJI`,
etc. → "Market data subscription required for CFD indices"), y los ETF
proxy (SPY, QQQ...) no reflejan el NIVEL real del índice (SPY ≈ S&P500/10,
sin relación fija y limpia para Nasdaq/Nasdaq100/Russell). Se usa Yahoo
Finance (`meta.regularMarketPrice`/`previousClose` del mismo endpoint de
histórico) — da el nivel real del índice y se actualiza en vivo, a
diferencia del array de velas diarias que puede quedarse "hasta ayer"
mientras el mercado sigue abierto.

```
change     = regularMarketPrice − previousClose
change_pct = change / previousClose × 100
```

La misma cotización en vivo se usa para completar el último punto de la
línea de comparación contra índices (`appendOrReplaceToday` en
`lib/finance/performance.ts`), así esa línea no se queda un día atrás
respecto a la del portafolio.

---

## 22. Sección Pesos COP

TRM oficial vía `datos.gov.co` (dataset de la Superintendencia
Financiera, gratis, sin API key) — no es la misma cosa que una tasa de
cambio de mercado genérica: es el valor regulado que Colombia publica
una vez al día.

```
valor_total_cop        = valor_total_portafolio_usd × trm_hoy
rendimiento_portafolio_cop = rendimiento_total_usd × trm_hoy
efectivo_disponible_cop = efectivo_disponible_usd × trm_hoy
```

Un "fondeo broker" (dólares enviados desde Colombia vía ARQ, Global66,
etc.) crea SIEMPRE dos registros: (1) una transacción DEPOSIT normal
en `transactions` — afecta efectivo disponible y rendimiento en USD
como cualquier depósito — y (2) el detalle en `broker_fundings` (TRM
de ese momento, método, comisión). La comisión se puede pagar en USD o
en COP; se guarda precalculada en ambas monedas usando la TRM de ESE
fondeo específico (no la de hoy):

```
si comisión pagada en USD: fee_cop = fee_amount × trm_del_fondeo
si comisión pagada en COP: fee_usd = fee_amount / trm_del_fondeo
```

```
rendimiento_total_cop = rendimiento_portafolio_cop − Σ(fee_cop de todos los fondeos)
```

`rendimiento_total_cop` es el "de verdad" — descuenta lo que realmente
costó traer el dinero desde Colombia, a diferencia de
`rendimiento_portafolio_cop` que es solo la conversión directa del
rendimiento en USD.

Un fondeo puede marcarse como "no incluido en el portafolio USD"
(`include_in_portfolio = false` al crearlo). En ese caso NO se crea la
transacción DEPOSIT y `broker_fundings.transaction_id` queda `NULL` —
sirve para registrar fondeos históricos cuyo efectivo ya fue
contabilizado por otra vía (p. ej. ya estaba en el CSV importado),
evitando inflar el efectivo disponible en USD con un duplicado. La
comisión de ese fondeo SÍ sigue restando en `rendimiento_total_cop`
(el costo real de traer el dinero no cambia por cómo se registre el
efectivo).

### "Total depositado" (primera tarjeta, tanto en USD como en COP)

En USD es simplemente `cashFlow.totalDeposits` (suma de transacciones
tipo DEPOSIT, sin restar retiros). En COP NO es una conversión de ese
número — es el total de pesos que realmente se enviaron, sumando cada
fondeo a la TRM que tenía ESE día (no la de hoy):

```
total_cop_enviado = Σ(usd_amount_i × trm_del_fondeo_i)  para TODOS los fondeos
```

Se suman TODOS los fondeos, incluidos los marcados
`include_in_portfolio = false` — esos pesos también se enviaron
realmente, solo que su lado USD ya estaba contabilizado por otra vía
(no se duplica porque el USD y el COP viven en tablas distintas:
`transactions` vs. `broker_fundings`).

### Dos hileras en Pesos COP: "sin" vs. "con" efecto de la TRM

La hilera "sin efecto de la TRM" es la conversión simple de arriba:
toma el rendimiento en USD (una sola cifra) y lo multiplica por la TRM
de HOY, como si la tasa de cambio hubiera sido constante todo el
tiempo. Ignora que cada fondeo se hizo a una TRM distinta.

La hilera "con efecto de la TRM" sí lo captura, porque compara dos
cosas medidas en pesos de momentos distintos — el valor de hoy (a la
TRM de hoy) contra los pesos que de verdad saliste de tu bolsillo (cada
uno a su propia TRM histórica):

```
rendimiento_portafolio_con_trm = valor_total_cop_hoy − total_cop_enviado
rendimiento_total_con_trm      = rendimiento_portafolio_con_trm − Σ(fee_cop)
```

La diferencia entre las dos versiones es exactamente la ganancia o
pérdida cambiaria sobre el capital enviado:

```
rendimiento_con_trm − rendimiento_sin_trm = Σ(usd_amount_i × (trm_hoy − trm_del_fondeo_i))
```

Si el peso se ha depreciado desde que enviaste cada fondeo
(`trm_hoy > trm_del_fondeo`), la versión "con efecto" muestra un
rendimiento mayor — de verdad ganaste algo extra en pesos por ese
movimiento cambiario, no es solo la rentabilidad del mercado en dólares.

### Gráfico de Pesos COP (histórico, día por día) — mismo selector que USD

`/api/portfolio/performance-cop` alimenta un gráfico con el mismo
selector de rango Y el mismo toggle "Evolución del valor" / "% de
rendimiento" que el gráfico en USD (`PerformanceChart`) — en ambos
modos se comparan las dos mismas líneas "sin efecto TRM" / "con efecto
TRM", solo cambia la unidad.

**Modo Valor** — mismo concepto que las tarjetas de arriba, pero
aplicado a CADA DÍA de la serie histórica en vez de solo al snapshot de
hoy:

```
valor_dia_sin_efecto = valor_usd(día) × trm_hoy         (constante en toda la serie)
valor_dia_con_efecto = valor_usd(día) × trm(ese día)
```

`valor_usd(día)` es la MISMA serie que ya usa "Evolución del valor" en
USD (`buildDailySeries`) — no se recalcula nada del lado de
holdings/cash, solo se multiplica por la TRM. La línea "sin efecto" es
por definición una copia a escala de la línea en USD (mismo shape,
todo multiplicado por una constante) — solo la línea "con efecto"
tiene una forma distinta, porque la TRM real se mueve día a día.

**Modo % de rendimiento** — el TWR encadenado día a día
(`buildTWRCurve`, la misma función que ya usa el gráfico en USD):

```
twr_sin_efecto = buildTWRCurve(valor_usd, flujos_usd)             ← idéntico al TWR en USD
twr_con_efecto = buildTWRCurve(valor_usd × trm(día), flujos_usd × trm(día del flujo))
```

`twr_sin_efecto` es matemáticamente IDÉNTICO a la curva TWR del
gráfico en USD — escalar toda la serie y los flujos por una TRM
CONSTANTE no cambia ningún % de retorno (los % son invariantes a
escala). Se verificó comparando el último punto de ambas curvas para
el mismo rango: coinciden exacto. `twr_con_efecto` sí es distinto,
porque cada día (y cada flujo, con la TRM de SU propia fecha) se
convierte con una tasa distinta — el movimiento de la TRM día a día
queda reflejado directamente en el % de retorno, no solo en el monto
final.

La TRM del dataset viene en filas con un rango de vigencia
(`vigenciadesde`..`vigenciahasta`, los fines de semana quedan dentro
del rango del viernes) — `fetchTRMSeries` expande cada fila a un punto
por día calendario para poder cruzarla 1:1 contra `valor_usd(día)`. Si
algún día de la serie no tiene TRM publicada todavía, se usa la última
conocida (forward-fill), nunca se deja el punto vacío. Este forward-fill
se hace UNA sola vez sobre la unión de fechas de la serie de valor y
de los flujos de caja — hacerlo en dos pasadas separadas arrastraría
el "último TRM conocido" de una a la otra y podría contaminar el
resultado si sus fechas no coinciden exactamente.

## Nota — condición de carrera al cambiar de rango rápido en un gráfico

Al construir el gráfico de Pesos COP encontré (y corregí antes de que
llegara a producción) un bug de carrera real: si el fetch del rango
por defecto (al montar el componente) tarda más que el fetch de un
rango que el usuario elige haciendo clic justo después, la respuesta
más vieja puede llegar DESPUÉS y sobrescribir los datos — el botón
queda marcado en el rango nuevo pero el gráfico muestra los datos del
rango viejo. Se corrigió con un `ref` que guarda cuál fue el ÚLTIMO
rango pedido, y cualquier respuesta que no corresponda a ese rango se
descarta silenciosamente. `PerformanceChart` (el gráfico en USD) tiene
el mismo patrón de fetch sin esta protección — no se tocó porque no
fue lo que se pidió, pero el mismo bug le puede pasar ahí también.

---

Borrar un fondeo o una transacción es irreversible y siempre pide
confirmación. Si el fondeo tiene un `transaction_id` vinculado, borrar
la transacción hace cascada (`ON DELETE CASCADE`) y borra también la
fila de `broker_fundings` — por eso `deleteBrokerFunding()` borra la
transacción (no la fila directamente) cuando existe ese vínculo, y solo
borra la fila de `broker_fundings` directamente cuando no lo tiene.

---

## Nota — "Mejor/Peor activo" debe anclarse a cuándo REALMENTE tienes el ticker

Comparar el precio actual contra el inicio del rango elegido (ej. "All"
= dic-2024) rompe si compraste ese ticker DESPUÉS de esa fecha: NOW se
compró por primera vez en abril-2026, y comparándolo contra su precio
de dic-2024 (mucho más alto, de antes de que lo tuvieras) salía
"peor activo (ALL): NOW −50.63%" — cuando en realidad viene ganando
+32.6% desde que lo tienes. `getCurrentHoldingStartDates()` calcula,
por ticker, la fecha del último cruce de 0 a >0 acciones (el inicio de
la racha de tenencia vigente), y el endpoint usa el que sea MÁS TARDE
entre esa fecha y el inicio del rango.

---

## Nota — el calendario de earnings de Finnhub se trunca en 1500 filas, SIN avisar

`/calendar/earnings` no filtra por símbolo — devuelve todas las
empresas del rango de fechas pedido. Probado: hasta con una ventana de
solo 15 días ya llegaba exacto a 1500 resultados (el tope), cortando
tickers reales (MELI y BKNG desaparecían por completo; NU mostraba la
fecha de un trimestre futuro en vez de la próxima real — 11-nov en vez
de 13-ago). Ventanas de 1 día se quedan muy por debajo (~350-500
filas). La función pide día por día (en tandas de 15 para no pasarse
del límite de 60 req/min del free tier) y combina resultados —
confirmado contra el bróker real del usuario: MELI 5-ago, NU 13-ago,
BKNG 4-ago (amc), los tres exactos.

---

## 20. Post-market (derivado, no de `meta.postMarketPrice`)

Finnhub free tier no tiene datos de post-market (`/quote` no trae esos
campos). El resumen `meta.postMarketPrice`/`postMarketChange` de Yahoo
tampoco se pobló en pruebas, ni minutos después del cierre con tickers
muy líquidos — parece no estar disponible en este endpoint no oficial
en este entorno. Pero las velas de 1 minuto SÍ siguen llegando después
del cierre, así que se deriva directamente:

```
cierre_regular = última vela con precio válido EN O ANTES de
                 meta.currentTradingPeriod.regular.end
precio_actual  = última vela con precio válido, sea la que sea
post_market_%  = (precio_actual / cierre_regular − 1) × 100
post_market_$  = (precio_actual − cierre_regular) × acciones
```

Si `precio_actual` es la misma vela que `cierre_regular` (todavía no
hay actividad post-market), no se muestra nada — null, no cero.

Las columnas de post-market en la tabla de posiciones (y la línea bajo
"Valor total del portafolio") solo se calculan y se muestran dentro de
la ventana 4:00pm–8:00pm hora de Nueva York, lun-vie
(`isPostMarketWindow` en `lib/yahoo/client.ts`) — fuera de esa ventana
ni se pide el dato a Yahoo.

---

## 21. Próximos earnings (fecha + antes/después de mercado)

Finnhub `/calendar/earnings` sí está disponible en el free tier (a
diferencia de `/stock/candle`). El endpoint no filtra por símbolo —
devuelve TODAS las empresas del rango de fechas pedido, así que se
pide una vez (hoy → hoy+120 días) y se filtra localmente por los
tickers de tus posiciones abiertas, quedándose con la fecha más
próxima si hay varios trimestres listados. El campo `hour` de Finnhub
puede venir `"bmo"` (antes de apertura), `"amc"` (después de cierre) o
`""` (fecha estimada, horario todavía sin confirmar).

---

## Nota — línea de rendimiento verde/rojo: ni sentinel en 0 ni dos series

Dos intentos fallidos antes de la solución correcta:
1. Clamp a 0 en el lado "apagado" de cada serie (verde/roja) → línea
   plana falsa en 0% cuando todo el período cae del mismo lado.
2. `null` + `connectNulls={false}` para no dibujar el lado apagado →
   sin línea falsa, pero deja un hueco visible justo en cada cruce
   (ninguna de las dos series tiene ambos puntos alrededor del cruce).

Solución: una sola línea con `stroke="url(#gradiente)"`, donde el
`<linearGradient>` tiene un stop por punto (offset = índice/(n−1), ya
que el eje de Recharts reparte los puntos a distancia igual por
índice, no por fecha real) y, en cada cruce de signo entre dos puntos
consecutivos, dos stops pegados en el offset interpolado donde el
valor pasa por 0 — un corte de color nítido, sin mezcla, sin huecos,
sin línea falsa. Ver `buildSignGradientStops` en `PerformanceChart`.

---

## Nota — MTD/YTD deben anclarse al cierre del período ANTERIOR

`MTD` no es "desde el 1° del mes actual" sino "desde el cierre del
**último día del mes anterior**" (`YTD` = desde el cierre del 31 de
diciembre anterior). Con el ancla equivocada (1° de mes / 1° de enero),
un movimiento fuerte que en realidad pertenece al día de cierre del
período anterior queda AFUERA del cálculo — o adentro cuando no
debería, según el caso. Se detectó comparando contra IBKR: mi MTD daba
4.44% vs 8.42% de IBKR (una diferencia de 4pp), mientras 1M (que sí
empieza el día correcto) coincidía casi exacto. El usuario confirmó con
su bróker real que el retorno del día en cuestión fue genuino (3.92%
reportado vs 3.93% calculado) — el bug no estaba en los datos de
precio, sino en qué día usaba como ancla del período. Con
`start.setUTCDate(0)` / `start.setUTCMonth(0, 0)` (trucos de JS para
"día 0" = último día del período anterior), MTD pasó a 8.43% — 0.01pp
de diferencia con IBKR.

`1M`/`3M`/`6M`/`1Y` NO llevan este ajuste — son ventanas móviles
("hoy menos N"), no períodos de calendario, y ya coincidían con IBKR
sin el ancla de cierre anterior.

---

## Nota — dos bugs reales encontrados al validar contra IBKR

1. **La línea del gráfico en "% de rendimiento" NO debe ser
   `(valor/valor_inicial − 1) × 100`.** Esa fórmula cuenta cada depósito
   como si fuera ganancia de inversión — infla el % brutalmente en
   cualquier período con aportes. Debe graficarse `buildTWRCurve()`
   (la curva día a día de la fórmula #15), la misma base que ya usa el
   número TWR de la tarjeta. Antes del fix, un YTD con varios depósitos
   mostraba +16.8% en el gráfico mientras el TWR real era -5.2%.

2. **Tickers de bolsas fuera de NASDAQ/NYSE pueden resolver mal en
   Yahoo sin dar ningún error.** `GSY` (goeasy Ltd., TSX/AMEX en el CSV)
   resolvía silenciosamente al ticker de un ETF de bonos completamente
   distinto — mismo orden de magnitud de precio por pura coincidencia,
   0 días sin datos, ningún error en el log. Solo se detectó comparando
   el precio de Yahoo contra el precio ya registrado en cada transacción
   (ver `lib/yahoo/client.ts` → `TICKER_ALIASES`). Si agregas un ticker
   de otra bolsa (Euronext, TSX, LSE, etc.), verifica el símbolo ahí
   antes de asumir que el histórico es correcto.

---

## 17. Comparación contra índices

```
pct(día) = (valor(día) / valor(primer_día) − 1) × 100
```

Se aplica la misma normalización tanto al portafolio como al índice
elegido (Nasdaq Composite `^IXIC`, Nasdaq 100 `^NDX`, S&P 500 `^GSPC`,
Dow Jones `^DJI`, Russell 2000 `^RUT` — todos vía Yahoo Finance), así se
pueden graficar juntos aunque uno esté en USD y el otro en puntos de
índice. Por eso comparar contra un índice fuerza la vista a "% de
rendimiento": no tiene sentido superponer dólares de tu cartera con
puntos del Nasdaq en el mismo eje.

---

## Nota — qué endpoints de Finnhub son gratis para la ficha de detalle de acción

Al construir el buscador (barra de búsqueda → ficha con estados
financieros, noticias, analistas) validé empíricamente cuáles endpoints
de Finnhub funcionan en el free tier, porque la documentación no siempre
deja claro qué está bloqueado:

- `/search` (autocompletado) — **gratis**.
- `/stock/profile2` (perfil completo) — **gratis**.
- `/stock/metric?metric=all` (P/E, márgenes, ROE, beta, 52 semanas...) — **gratis**.
- `/stock/financials-reported` (estados financieros TAL COMO se
  reportaron a la SEC — balance, resultados, flujo de caja) — **gratis**.
  Contraintuitivo: la versión "derivada" del mismo dato,
  `/stock/financials`, SÍ está bloqueada ("You don't have access to
  this resource") — pero la as-reported no. Por eso el proyecto usa esa.
- `/company-news`, `/stock/recommendation`, `/stock/peers` — **gratis**.
- `/stock/price-target` — bloqueado en free tier (no se usa).

Los márgenes/ROE/ROA/growth de `/stock/metric` ya vienen en puntos de
porcentaje (ej. `netProfitMarginTTM: 27.62` = 27.62%, no 0.2762) — no
hay que multiplicar por 100. Confirmado con datos reales de AAPL antes
de asumir el formato.

## Nota — pestañas de Mercados (Asia/Eur/US/Oil/Bonds/Gold/FX/Crypto/Pre-Mkt)

`/api/market-indices?category=...` valida cada símbolo de Yahoo a mano
antes de usarlo (índices `^AXJO`/`^N225`/`^NSEI`/`^HSI`/`000001.SS`/
`^STOXX`/`^GDAXI`/`^FTSE`/`^FCHI`/`FTSEMIB.MI`; futuros `=F`; FX `=X`;
cripto `-USD`). Un caso real que NO tiene fuente gratis: los rendimientos
de bonos internacionales (Bund/JPN/UK/FRA 10-YR). Yahoo solo publica
gratis el índice de rendimiento del Tesoro de EE.UU. (`^TNX`, ya viene
en % directo, sin necesidad de dividir por 10) — probé ~15 variantes de
ticker para los otros 4 países (formatos tipo `DE10Y=RR`,
`TMBMKDE-10Y`, `^JGB10`, etc.) y ninguna resolvió. Esos 4 quedan con
`symbol: ""` en el backend y la tarjeta muestra "Sin datos" — honesto
en vez de fingir un número.

También: instrumentos de bajo valor (ej. DOGE a $0.07) necesitan más
decimales que el resto — con 2 fijos, el cambio absoluto redondeaba a
"-0.00" y se perdía toda la magnitud del movimiento. `formatValue()` en
`MarketIndices` usa 4 decimales cuando `|valor| < 1`, 2 en el resto.

---

## Advertencia

> Los cálculos de este proyecto son para seguimiento personal.
> No constituyen asesoría financiera ni son adecuados para reportes fiscales
> sin verificación profesional.
