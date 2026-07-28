# 📈 Portfolio Tracker

Seguimiento personal de cartera de inversiones en acciones de EE.UU.
**Stack:** Next.js 14 · Supabase (PostgreSQL) · Finnhub API · Tailwind CSS · Vercel

---

## Setup en 5 pasos

### 1. Clonar e instalar dependencias

```bash
git clone <tu-repo>
cd portfolio-tracker
npm install
```

### 2. Crear base de datos en Supabase

1. Ve a [supabase.com](https://supabase.com) → New Project
2. En **SQL Editor**, ejecuta el contenido de `supabase/migrations/001_initial.sql`
3. Ve a **Settings → API** y copia:
   - Project URL
   - `anon` public key
   - `service_role` secret key (⚠️ nunca expongas esta en el frontend)

### 3. Obtener API key de Finnhub

1. Regístrate en [finnhub.io/register](https://finnhub.io/register) (gratis)
2. Copia tu **API Key** desde el dashboard

### 4. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Edita `.env.local` con tus valores:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
FINNHUB_API_KEY=tu_clave_finnhub
```

### 5. Correr en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

---

## Deploy en Vercel (gratis, siempre disponible)

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel

# Agregar variables de entorno en Vercel Dashboard
# Settings → Environment Variables → agregar las 4 variables de .env.local
```

---

## Importar transacciones desde CSV

Formato requerido (encabezados en minúscula):

```csv
date,type,ticker,shares,price,fees,notes
2024-01-15,BUY,AAPL,10,185.50,0,Compra inicial
2024-03-01,BUY,MSFT,5,420.00,0,
2024-06-10,SELL,AAPL,3,195.00,0,Venta parcial
```

- `date`: formato `YYYY-MM-DD`
- `type`: `BUY` o `SELL`
- `fees`: opcional, default 0 (USD)

Descarga la plantilla desde la app en: **Importar CSV → Descargar plantilla**

---

## Estructura del proyecto

```
portfolio-tracker/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Página principal
│   ├── api/                # API routes (servidor)
│   │   ├── prices/         # Proxy Finnhub
│   │   ├── transactions/   # CRUD transacciones
│   │   └── portfolio/      # Cálculos consolidados
│   └── layout.tsx
├── components/modules/     # Componentes por feature
├── lib/
│   ├── finance/            # Cálculos y fórmulas
│   ├── supabase/           # Cliente BD
│   └── finnhub/            # Cliente API de precios
├── types/                  # TypeScript types centrales
├── hooks/                  # Custom hooks
└── supabase/migrations/    # SQL de base de datos
```

---

## Convención de commits

```
feat(holdings): agregar columna de peso en tabla
fix(calculations): corregir fórmula costo promedio con fees
chore(deps): actualizar next a 14.2.5
docs(readme): actualizar instrucciones de deploy
refactor(api): separar lógica de Finnhub en cliente propio
```

---

## Límites del free tier

| Servicio   | Límite gratuito                        |
|------------|----------------------------------------|
| Supabase   | 500MB DB, 2GB bandwidth/mes            |
| Finnhub    | 60 llamadas/minuto                     |
| Vercel     | 100GB bandwidth/mes, deployments ilim. |

Para un portafolio personal, estos límites son más que suficientes.

---

## Roadmap

- [x] **Fase 1** — Core: transacciones, holdings, precios en tiempo real
- [ ] **Fase 2** — Dashboard: gráficas de evolución, distribución
- [ ] **Fase 3** — Análisis: historial filtrable, vs benchmark S&P 500

---

> ⚠️ **Disclaimer:** Este proyecto es para seguimiento personal únicamente.
> No constituye asesoría financiera. Los precios pueden tener retraso.
