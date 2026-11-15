# **Plan**

1. **Inversión inicial:** lo que cobras por desarrollar e implementar la plataforma.
2. **Costos recurrentes de operación:** lo que el restaurante pagará mensualmente para mantener la página, backend, base de datos, dominio y servicios funcionando.

Voy a plantearte una arquitectura que no sea excesivamente costosa, pero que tenga suficiente capacidad para operar un restaurante de manera profesional.

# **1. Arquitectura de infraestructura**

Mi propuesta sería utilizar servicios administrados en la nube. No compraría un servidor físico ni contrataría un VPS para comenzar.

**Dominio del restaurante**

www\.restaurante.com

**Vercel — Frontend**

Next.js · Menú · Carrito · Checkout

**Render — Backend**

Node.js + NestJS (TypeScript) · API · Webhooks · Loyverse

**Supabase**

PostgreSQL

**Stripe**

Procesamiento de pagos

**Loyverse**

POS y ventas

**Notificaciones**

Correo y alertas

Esta arquitectura permite que cada servicio tenga una responsabilidad independiente. Si después crece el restaurante, puedes aumentar recursos sin reconstruir todo el sistema.

# **2. Desglose de costos por servicio**

Los precios siguientes son referencias de las tarifas publicadas actualmente. Para facilitar los cálculos usaré un tipo de cambio presupuestal de **$18 MXN por dólar**, no una cotización cambiaria en tiempo real. Los cargos finales pueden variar por IVA y tipo de cambio bancario.

## **A. Hosting del frontend: Vercel**

**Vercel**

Alojamiento de Next.js

Plan recomendado: Pro

| Concepto          | Costo                     |
| ----------------- | ------------------------- |
| Hobby             | Gratis, para uso personal |
| Pro               | USD $20/mes               |
| Aproximado en MXN | $360/mes                  |

¿Por qué Pro? Porque es un proyecto comercial. Incluye colaboración, infraestructura de producción y $20 USD de crédito de uso mensual.

Página: [Vercel Pricing](https://vercel.com/pricing).

## **B. Hosting del backend: Render**

**Render**

Node.js + NestJS

Plan recomendado: Pro workspace + compute

Aquí alojarías:

- API REST (NestJS, con módulos separados para pedidos, pagos, menú, integración con Loyverse y notificaciones).
- Integración con Loyverse.
- Webhooks de Stripe (requieren acceso al cuerpo crudo de la petición para validar la firma).
- Procesamiento de pedidos.
- Procesos de sincronización y reintentos.

Render cobra por el workspace y por los recursos de cómputo. La tarifa depende del cómputo contratado, no del framework, así que cambiar de Fastify a NestJS no modifica el precio.

| Concepto                     | Costo mensual |
| ---------------------------- | ------------- |
| Workspace Pro                | USD $25       |
| Backend pequeño              | USD $7        |
| Backend con 1 CPU y 2 GB RAM | USD $25       |
| Total                        | USD $32–50    |

Aproximadamente $576–$900 MXN al mes.

**Consideración por usar NestJS:** NestJS consume más memoria y tarda más en arrancar que un servidor mínimo. Esto importa en dos puntos:

- **Tamaño del servicio:** antes de elegir el servicio de $7, hay que medir el consumo de memoria real de la API ya construida y confirmar la memoria del plan en la página de precios de Render. Si queda justo, el servicio de $25 es la opción segura.
- **Arranque y webhooks:** si el servicio se reinicia, un arranque lento puede hacer que Stripe reintente webhooks. Esto es aceptable porque el procesamiento es idempotente, pero se debe incluir en las pruebas.

Para iniciar utilizaría el servicio de $7 solo si el tráfico es reducido y las pruebas de carga y de memoria, hechas con la API en NestJS, lo permiten. Para una operación con mayor concurrencia elegiría el de $25.

Nota técnica: NestJS usa Express como plataforma HTTP por defecto. Existe un adaptador para Fastify, pero no se usará salvo que haya una razón de rendimiento comprobada.

Fuente: [Render Pricing](https://render.com/pricing).

## **C. Base de datos: Supabase**

**Supabase**

PostgreSQL, almacenamiento y servicios backend

| Plan | Costo       |
| ---- | ----------- |
| Free | USD $0      |
| Pro  | USD $25/mes |

Recomendado para producción

El plan Pro incluye:

- 8 GB de almacenamiento de base de datos.
- 100 GB de almacenamiento de archivos.
- 250 GB de transferencia de datos.
- Respaldos diarios con retención de 7 días.
- Soporte por correo.

Incluye crédito de cómputo para una instancia Micro en el primer proyecto.

Costo aproximado: **$450 MXN/mes**.

Página: [Supabase Pricing](https://supabase.com/pricing).

## **D. Procesamiento de pagos: Stripe**

**Stripe**

Cobros con tarjeta

Este es uno de los costos más importantes porque depende directamente de cuánto venda el restaurante.

Sin mensualidad en el plan estándar

Tarifas publicadas para tarjetas nacionales en México:

- 3.6% del importe.
- $3 MXN adicionales por transacción.
- Las tarifas publicadas excluyen IVA.
- No hay cuota mensual ni costo de instalación.

Tarjetas internacionales tienen un 0.5% adicional y la conversión de divisas puede sumar otro 2%.

**Ejemplos prácticos:**

| Venta  | Comisión antes de IVA |
| ------ | --------------------- |
| $150   | $8.40                 |
| $250   | $12.00                |
| $300   | $13.80                |
| $500   | $21.00                |
| $1,000 | $39.00                |

Ejemplo con una venta de $300:

- Comisión: $13.80.
- IVA de la comisión (16%): $2.21.
- Costo total aproximado: $16.01.

La comisión se descuenta del dinero que recibe el restaurante. No es un pago fijo mensual.

Puedes consultar las tarifas en [Stripe México](https://stripe.com/mx/pricing).

## **E. Dominio del restaurante**

**Cloudflare Registrar**

Dominio y DNS

Ejemplos de precios publicados:

| Extensión | Costo anual |
| --------- | ----------- |
| .com      | USD $11.17  |
| .com.mx   | USD $16.75  |

Equivalente aproximado: $201–$302 MXN anuales.

Cloudflare también ofrece DNS y protección básica con un plan gratuito.

Página: [Cloudflare Registrar](https://pricing.registrar.cloudflare.com/).

## **F. Correos electrónicos y notificaciones**

**Resend**

Confirmaciones de pedidos y pagos

Lo utilizaría para enviar:

- Confirmación de compra.
- Comprobante de pedido.
- Notificación de pago.
- Aviso de pedido listo.

| Plan | Costo       |
| ---- | ----------- |
| Free | USD $0      |
| Pro  | USD $20/mes |

El plan gratuito incluye 3,000 correos mensuales, con límite de 100 diarios. Para un restaurante pequeño probablemente sea suficiente.

Página: [Resend Pricing](https://resend.com/pricing).

# **3. Otros servicios que puedes necesitar**

Estos no necesariamente requieren una suscripción desde el primer día.

| Servicio                    | Alternativa       | Costo inicial      |
| --------------------------- | ----------------- | ------------------ |
| DNS y CDN                   | Cloudflare Free   | $0                 |
| Monitoreo de errores        | Sentry Free       | $0                 |
| Monitoreo de disponibilidad | Better Stack Free | $0                 |
| Imágenes del menú           | Supabase Storage  | Incluido en cuotas |
| Certificado SSL             | Vercel / Render   | $0                 |
| Respaldos                   | Supabase Pro      | Incluidos          |
| Repositorio Git             | GitHub Free       | $0                 |

El objetivo es no contratar servicios innecesarios que aumenten el costo mensual del cliente.

# **4. ¿Cuánto terminaría pagando el restaurante al mes?**

Esta sería mi estimación para una sucursal con tráfico bajo o moderado.

**Infraestructura recomendada**

| Vercel Pro                   | $360    |
| ---------------------------- | ------- |
| Render Pro + backend pequeño | $576    |
| Supabase Pro                 | $450    |
| Dominio (prorrateado)        | $17–$25 |
| Resend                       | $0      |
| Cloudflare                   | $0      |
| Monitoreo                    | $0      |

Total mensual estimado

# **$1,403–$1,421 MXN**

Sin comisiones de pago, impuestos adicionales ni sobreconsumos. Conversión presupuestal de USD a MXN.

Si el backend requiere el servicio de $25 en lugar del de $7, el costo subiría aproximadamente $324 MXN mensuales. Con NestJS, esa posibilidad es más probable que con un servidor mínimo, por lo que conviene confirmarla con la medición de memoria antes de cotizar al cliente.

Yo presupuestaría **$1,500–$1,800 MXN mensuales** para infraestructura, dejando cierto margen para variaciones cambiarias y consumos.

## **5. ¿Y cuánto cuesta realmente operar con Loyverse?**

Esta es una buena noticia: Loyverse KDS es gratuito y también incluye el POS básico y las integraciones.

Los complementos opcionales son:

| Complemento                   | Costo       |
| ----------------------------- | ----------- |
| Historial de ventas ilimitado | USD $5/mes  |
| Gestión de empleados          | USD $25/mes |
| Inventario avanzado           | USD $25/mes |
| Loyverse KDS                  | Gratis      |
| Loyverse POS                  | Gratis      |

Precios por tienda, sin impuestos.

No los agregaría al presupuesto si el restaurante ya tiene contratados los servicios que necesita.

También hay que considerar el costo de una tablet Android o iPad para cocina, si todavía no tiene una.

# **6. ¿Qué le cobraría yo al restaurante por mantenimiento?**

Aquí viene algo importante desde tu perspectiva como desarrollador.

No debes limitarte a entregar el proyecto y dejar que el cliente administre los servicios por su cuenta sin ofrecerle soporte.

Te propongo tres modalidades:

| Modalidad                                     | Cuota mensual |
| --------------------------------------------- | ------------- |
| Solo infraestructura                          | $1,500–$1,800 |
| Infraestructura + mantenimiento básico        | $4,000–$5,000 |
| Administración integral y soporte prioritario | $6,000–$8,000 |

La segunda modalidad incluiría:

- Supervisión del funcionamiento.
- Corrección de errores.
- Revisión de webhooks y pagos.
- Revisión de sincronización con Loyverse.
- Actualizaciones menores, incluidas las actualizaciones de dependencias de NestJS y Node.js.
- Soporte técnico en horario acordado.

Las nuevas funcionalidades se cotizan aparte.

**Mi recomendación:** cobra $4,500 MXN mensuales por mantenimiento y administración, más los costos de infraestructura y comisiones de pago por cuenta del restaurante.

# **7. Simulador de costos de Stripe**

Te dejo un pequeño cálculo para que puedas mostrar al cliente cómo las comisiones cambian según sus ventas.

**Calcula las comisiones estimadas**

Ventas mensuales

**$190,000 MXN**

Ticket promedio

**$375 MXN**

Transacciones estimadas

**507**

Comisión Stripe antes de IVA

**$8,361**

IVA de la comisión

**$1,337.76**

Costo estimado total de procesamiento

# **$9,698.76 MXN**

Estimación para tarjetas nacionales, con 3.6% + $3 por operación y 16% de IVA sobre la comisión. No incluye contracargos ni otros servicios adicionales.

# **8. Cómo presentaría esto en tu propuesta comercial**

Yo pondría una sección llamada **Costos de operación de la plataforma** con estas condiciones:

| Concepto           | Quién lo paga |
| ------------------ | ------------- |
| Desarrollo inicial | Restaurante   |
| Dominio            | Restaurante   |
| Vercel             | Restaurante   |
| Render             | Restaurante   |
| Supabase           | Restaurante   |
| Stripe             | Restaurante   |
| Loyverse           | Restaurante   |
| Mantenimiento      | Restaurante   |

Y algo que considero fundamental: **las cuentas de Vercel, Render, Supabase, Stripe y el dominio deberían pertenecer al restaurante**, aunque tú tengas acceso como administrador técnico.

Así no te conviertes en intermediario de sus pagos y el cliente conserva el control de su infraestructura.

También separaría tus herramientas de desarrollo multiagente (modelos, APIs de IA y harness) de los costos de producción. No son un gasto recurrente necesario para que la tienda funcione una vez entregada.

# **9. POC: integración con Loyverse y pantalla de cocina propia**

## **9.1 Objetivo**

Validar, antes de comprometer el alcance, que el sitio web puede registrar sus ventas en Loyverse a través de la API y que la cocina puede seguir esas ventas en una **pantalla propia**.

La premisa de partida es que los recibos creados mediante la API de Loyverse **no envían la orden al KDS de Loyverse**. Por eso el diseño del POC es:

- **Loyverse** funciona como registro de ventas (recibos, reportes, inventario).
- **Una pantalla propia de cocina** funciona como KDS y muestra **todas** las órdenes, sin importar su origen:
  - las hechas desde el sitio web;
  - las hechas en el POS de Loyverse (integradas a la pantalla).

Esta premisa debe confirmarse en la primera prueba del POC (H2), con evidencia.

**Dentro del alcance:** creación de recibos por API, lectura de ventas hechas en el POS, pantalla de cocina, pago simulado, manejo de fallos de Loyverse.

**Fuera del alcance:** Stripe real, correos, diseño final de la interfaz, cuentas de clientes, reembolsos, sincronización de inventario y de menú, varias sucursales.

## **9.2 Arquitectura del POC**

```
Sitio web (Next.js) ──► API (NestJS) ──► Supabase (PostgreSQL)
                          │
                          ├─ PaymentGateway (SIMULADO, sustituye a Stripe)
                          └─ PosGateway ──► API de Loyverse (crear recibo)

POS de Loyverse ──► webhook de recibos (o consulta periódica) ──► API ──► Supabase

Pantalla de cocina (/cocina, en tablet) ◄── API (consulta periódica o SSE) ◄── Supabase
```

Decisiones del POC:

- Los pedidos web se muestran en cocina desde **nuestra base de datos**, sin depender de que Loyverse responda.
- Los pedidos del POS entran a nuestra base cuando la API de Loyverse los expone.
- El estado de cocina (nuevo, en preparación, listo, entregado) vive solo en nuestra base. Loyverse no se actualiza con ese estado.
- La actualización de la pantalla usa consulta periódica o SSE. Supabase Realtime solo se evalúa si lo anterior no alcanza.

## **9.3 Flujos que se prueban**

**Flujo A: pedido web**

1. El cliente arma el carrito y pulsa "Simular pago".
2. La API recalcula el total, registra el pedido y lo marca como pagado con el pago simulado.
3. La API crea el recibo en Loyverse y guarda el identificador del recibo.
4. El pedido aparece en la pantalla de cocina con el origen "Web".

**Flujo B: venta hecha en el POS de Loyverse**

1. El personal registra una venta en el POS.
2. Loyverse notifica por webhook (o la API consulta recibos nuevos periódicamente).
3. La API obtiene el recibo, lo convierte en pedido de cocina y lo guarda.
4. Aparece en la pantalla con el origen "POS".

**Flujo C: cocina avanza el pedido**

La cocina cambia el estado desde la pantalla. El cambio se guarda en nuestra base. Los pedidos web y los del POS se tratan igual.

**Flujo D: Loyverse falla**

Se desconecta o se invalida el token de Loyverse y se crea un pedido web. Se espera que el pedido siga apareciendo en cocina y que la creación del recibo quede en cola de reintentos.

## **9.4 Hipótesis y criterios de éxito**

| Id | Qué se prueba | Criterio de éxito |
| -- | ------------- | ----------------- |
| H1 | La API crea un recibo a partir de un pedido web, con tienda, tipo de pago y artículos mapeados | El recibo aparece en el back office de Loyverse con los artículos, cantidades y total correctos |
| H2 | Un recibo creado por API **no** llega al KDS de Loyverse | Captura o video del KDS sin la orden. Queda como evidencia en el ADR |
| H3 | Las ventas del POS llegan a nuestra API | Por webhook o por consulta periódica, con la latencia medida. Se confirma si el recibo creado por la API también dispara el webhook, para evitar duplicados |
| H4 | Momento en que una orden del POS es visible por API | Se documenta si aparece al enviarla a cocina o solo al cobrarla. Si solo aparece al cobrar, se documenta la limitación y la alternativa |
| H5 | El recibo trae lo que cocina necesita | Artículos, cantidades, modificadores, notas, tipo de servicio (mesa, llevar), número de orden y hora |
| H6 | Resiliencia ante fallos de Loyverse | Con Loyverse caído, el pedido web sigue en cocina y el recibo se reintenta hasta crearse. No se pierde ni se duplica ningún pedido |
| H7 | Latencia de extremo a extremo | Meta inicial: pedido web visible en cocina en menos de 5 s. Pedido del POS visible en menos de 15 s. Las metas se ajustan con los resultados |
| H8 | Sin duplicados | Un pedido web no aparece dos veces en cocina cuando su recibo regresa por webhook o por consulta periódica (se deduplica por el identificador del recibo) |

Antes de construir, `librarian` confirma en la documentación de Loyverse el método de autenticación, los eventos de webhook disponibles, los límites de uso y cualquier requisito del plan de la cuenta. Lo que la documentación no confirme se prueba en el POC.

## **9.5 Pago simulado (salvaguardas)**

- El código usa una interfaz `PaymentGateway`. En el POC, la implementación es un mock que marca el pedido como pagado.
- El mock se activa con una variable de entorno (por ejemplo `PAYMENT_MODE=mock`). La API **no arranca** si el mock está activo en producción.
- El botón "Simular pago" solo se muestra fuera de producción.
- El POC no usa llaves ni cuentas de Stripe. Al integrar Stripe, solo cambia la implementación del gateway.
- Ningún pedido del POC debe mezclarse con ventas reales.

## **9.6 Entorno y datos**

- Se usa una **cuenta de Loyverse de pruebas**, separada de la del restaurante. Los recibos de prueba afectan reportes e inventario.
- Si hay que usar la cuenta real del cliente, se hace solo con una tienda y artículos de prueba, y se anulan los recibos al terminar.
- El webhook necesita una URL pública: un entorno de pruebas en Render o un túnel temporal.
- Las credenciales van solo en variables de entorno. Nunca en el repositorio ni en los registros.
- La pantalla de cocina se prueba en una tablet real (Android o iPad), con la pantalla encendida durante todo el servicio y con alerta sonora para pedidos nuevos.

## **9.7 Alcance técnico mínimo**

**Base de datos (propuesta, la confirma el agente de base de datos):**

- Pedidos con origen (`web` o `pos`), estado de cocina, identificador del recibo de Loyverse y estado de sincronización.
- Partidas del pedido con nombre y precio como se vendieron.
- Eventos recibidos de Loyverse, únicos por identificador de recibo, para evitar duplicados.
- Mapeo entre artículos del menú y artículos o variantes de Loyverse.
- Cola de reintentos para crear recibos.

**Pantalla `/cocina`:**

- Columnas: nuevo, en preparación, listo.
- Cada tarjeta muestra el origen, el número de orden, los artículos con notas y el tiempo transcurrido.
- Botón para avanzar el estado y alerta sonora al llegar un pedido.
- Acceso con un PIN simple (el POC no incluye autenticación completa).

## **9.8 Criterios de decisión**

| Resultado | Decisión |
| --------- | -------- |
| H1, H5, H6 y H8 se cumplen, y H3 funciona por webhook o por consulta periódica | **Adelante**: la pantalla propia entra al alcance y se cotiza |
| H4 muestra que las órdenes del POS solo se ven al cobrar | **Adelante con ajuste**: se documenta la limitación y se evalúan alternativas (por ejemplo, que el personal capture las órdenes de mesa en la pantalla propia, o que la pantalla muestre las del POS solo al cobrar) |
| H1 falla por limitaciones de la API o del plan de Loyverse | **Replantear**: usar Loyverse solo como POS en el local y llevar los pedidos web en nuestro propio sistema, con registro manual o diferido en Loyverse |
| H6 falla (se pierden pedidos) | **No avanzar** hasta corregir. Es una condición obligatoria |

## **9.9 Entregables, duración y costo**

- Demo funcional de los flujos A, B, C y D.
- Un registro de decisión (ADR) en `docs/adr/` con los resultados de H1 a H8, las capturas de evidencia y la decisión tomada.
- Lista de limitaciones y riesgos encontrados.
- Ajuste del alcance y de la cotización (pantalla de cocina, reintentos, mantenimiento).
- Duración estimada: **3 a 5 días hábiles**. Es una estimación, no una medición.
- Costo recurrente nuevo: ninguno esperado. Loyverse y Supabase Free bastan para el POC. Si se necesita un entorno público para el webhook, se usa un servicio de Render de bajo costo o un túnel temporal.

## **9.10 Cómo se ejecuta con los agentes**

La compuerta de riesgo abierto del orquestador se libera cuando existe el ADR con resultados exitosos. Cadena sugerida:

1. `librarian`: investiga la API de Loyverse y define qué debe verificar cada hipótesis.
2. `oracle`: confirma el diseño del POC y los criterios de decisión.
3. `dba`: crea el esquema mínimo en el Supabase local.
4. `dev`: implementa el gateway simulado, el gateway de Loyverse, el módulo de cocina y los reintentos.
5. `frontend`: construye la pantalla `/cocina` y el flujo mínimo del sitio.
6. `code-review`: revisa seguridad (tokens, webhook, el candado del pago simulado).
7. `writer`: registra el ADR con los resultados.

Las pruebas H1 a H5 y H7 se ejecutan en Loyverse real y las hace una persona. Los agentes preparan el código y los guiones de prueba.

## **Mi conclusión**

Para este restaurante presentaría el proyecto de esta manera:

- Desarrollo e implementación: aproximadamente $110,000 MXN. Este estimado se calculó con Fastify; NestJS añade estructura inicial (módulos, inyección de dependencias, configuración), así que conviene revisarlo antes de cotizar.
- Infraestructura: presupuesto de $1,500–$1,800 MXN mensuales.
- Mantenimiento: $4,500 MXN mensuales.
- Comisiones Stripe: variables según las ventas.

Advertencias finales:

1. Con la premisa actual (los recibos creados por la API no llegan al KDS de Loyverse), la solución es una pantalla de cocina propia. Su viabilidad se valida con el POC de la sección 9 antes de comprometer el alcance. Esa pantalla no está incluida en el costo de infraestructura calculado ni, probablemente, en el estimado de desarrollo; el POC permitirá cotizarla.
2. Con NestJS, hay que medir la memoria y el tiempo de arranque de la API en Render antes de decidir entre el servicio de $7 y el de $25.

Esto te permite ofrecer una solución profesional y, sobre todo, evitar absorber tú los gastos operativos del negocio.