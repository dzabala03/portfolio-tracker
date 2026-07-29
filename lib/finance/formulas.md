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

## Advertencia

> Los cálculos de este proyecto son para seguimiento personal.
> No constituyen asesoría financiera ni son adecuados para reportes fiscales
> sin verificación profesional.
