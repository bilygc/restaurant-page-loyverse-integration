/**
 * All user-facing strings (es-MX) live in ONE place (project invariant).
 * Components must not hardcode copy; import from this module instead.
 * Untrusted text (customer notes, POS notes, item names, dining_option) is
 * NEVER stored here — those come from the API and are always rendered as text
 * by React.
 */
import type { KitchenState, OrderOrigin, SyncStatus } from '@restaurant/shared';

export const M = {
  brandTitle: 'Restaurante',
  brandSubtitle: 'Haz tu pedido',

  // ---- Customer order flow ----
  menuHeading: 'Menú',
  menuLoading: 'Cargando menú…',
  estimateDisclaimer: 'Precios del servidor. El total final lo confirma el servidor al pagar.',
  addButton: 'Agregar',
  cartHeading: 'Tu carrito',
  cartEmpty: 'Agrega productos al carrito para continuar.',
  quantityLabel: 'Cantidad',
  increaseAria: 'Aumentar cantidad de',
  decreaseAria: 'Disminuir cantidad de',
  removeAria: 'Quitar del carrito',
  lineNoteLabel: 'Nota del producto (opcional)',
  lineNotePlaceholder: 'Ej. sin cebolla, término medio',
  subtotalEstimate: 'Subtotal estimado',
  diningOptionLabel: 'Tipo de servicio (opcional)',
  diningOptionPlaceholder: 'Selecciona una opción',
  diningOptions: ['Comer aquí', 'Para llevar'] as const,
  orderNoteLabel: 'Notas del pedido (opcional)',
  orderNotePlaceholder: 'Ej. mesa 4, sin cubiertos',
  simulatePayButton: 'Simular pago',
  processingButton: 'Procesando pago…',
  paymentsSoon: 'Los pagos en línea estarán disponibles pronto.',
  checkoutErrorTitle: 'No se pudo registrar el pedido',
  retry: 'Reintentar',
  orderCreatedHeading: '¡Pedido registrado!',
  orderCreatedNote: 'Pago simulado confirmado por el servidor. Tu pedido ya está en cocina.',
  totalConfirmed: 'Total confirmado',
  kitchenStateLabel: 'Estado en cocina',
  syncStatusLabel: 'Sincronización con Loyverse',
  receiptNumberLabel: 'Recibo Loyverse',
  folioLabel: 'Pedido',
  newOrderButton: 'Hacer otro pedido',
  kitchenLink: 'Ir a la pantalla de cocina',

  // ---- Menu load: honest error / closed states (block checkout) ----
  menuErrorHeading: 'No pudimos cargar el menú',
  menuErrorBody: 'No se pudo conectar con el servicio. Revisa la conexión e inténtalo de nuevo.',
  closedHeading: 'No estamos aceptando pedidos en este momento',
  closedBody: 'El menú no está disponible ahora. Vuelve a intentarlo más tarde.',

  // ---- Kitchen screen ----
  kitchenHeading: 'Pantalla de cocina',
  pinGateHeading: 'Acceso a cocina',
  pinGateSubtitle: 'Ingresa el PIN para ver los pedidos.',
  pinLabel: 'PIN de cocina',
  pinPlaceholder: '••••',
  pinSubmit: 'Entrar',
  pinInvalid: 'PIN incorrecto. Intenta de nuevo.',
  pinHint: 'El PIN solo se usa durante esta sesión; no se guarda ni se comparte.',
  lockButton: 'Bloquear',
  testSoundButton: 'Probar sonido',
  awakeHint: 'Mantén la tablet encendida y desactiva el bloqueo automático durante el servicio.',
  wakeActive: 'Pantalla activa',
  wakeUnsupported: 'Activa "mantener pantalla encendida" en la tablet.',
  connectionError: 'No se pudo actualizar la cocina.',
  retryNow: 'Reintentar ahora',
  loading: 'Cargando pedidos…',
  emptyColumn: 'Sin pedidos',
  originCaption: 'Origen',
  elapsedCaption: 'Tiempo',
  diningCaption: 'Servicio',
  noteCaption: 'Nota',
  receiptCaption: 'Recibo',
  newOrderAnnouncement: 'Nuevo pedido recibido',
  lastUpdatePrefix: 'Actualizado',

  // ---- Generic ----
  genericError: 'Ocurrió un error. Intenta de nuevo.',

  // ---- Label maps (typed against the shared enum sets) ----
  columnTitles: {
    nuevo: 'Nuevo',
    en_preparacion: 'En preparación',
    listo: 'Listo',
    entregado: 'Entregado',
  } as Record<KitchenState, string>,

  stateLabels: {
    nuevo: 'Nuevo',
    en_preparacion: 'En preparación',
    listo: 'Listo',
    entregado: 'Entregado',
  } as Record<KitchenState, string>,

  syncLabels: {
    pending: 'Pendiente',
    synced: 'Sincronizado',
    failed: 'Con reintento',
  } as Record<SyncStatus, string>,

  originLabels: {
    web: 'Web',
    pos: 'POS',
  } as Record<OrderOrigin, string>,

  advanceLabels: {
    nuevo: 'Iniciar preparación',
    en_preparacion: 'Marcar listo',
    listo: 'Marcar entregado',
    entregado: '',
  } as Record<KitchenState, string>,
} as const;
