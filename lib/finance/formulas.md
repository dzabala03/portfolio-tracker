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

## Advertencia

> Los cálculos de este proyecto son para seguimiento personal.
> No constituyen asesoría financiera ni son adecuados para reportes fiscales
> sin verificación profesional.
