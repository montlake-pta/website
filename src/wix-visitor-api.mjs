import { createClient, OAuthStrategy } from '@wix/sdk';
import { products } from '@wix/stores';
import { currentCart, checkout } from '@wix/ecom';
import { wixEventsV2, forms, rsvpV2, orders, ticketReservations, policies } from '@wix/events';
import { redirects } from '@wix/redirects';

// Official Catalog V1 eCommerce integration:
// https://dev.wix.com/docs/api-reference/business-solutions/stores/catalog-v1/catalog/e-commerce-integration.md
export const STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_HOSTS = new Set(['www.montlakepta.org', 'montlakepta.org']);

export class TransactionError extends Error {
  constructor(code, message) { super(message); this.name = 'TransactionError'; this.code = code; }
}
function requireValue(condition, message, code = 'INVALID_INPUT') {
  if (!condition) throw new TransactionError(code, message);
}
export function validateConfig(config) {
  requireValue(config && UUID.test(config.clientId) && UUID.test(config.siteId),
    'Online registration and shopping are not available yet. Please try again later.', 'CONFIG');
  let base;
  try { base = new URL(config.baseUrl); } catch { /* checked below */ }
  requireValue(base && base.protocol === 'https:' && !base.username && !base.password &&
    !base.search && !base.hash,
  'Online registration and shopping are not available yet. Please try again later.', 'CONFIG');
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/`;
  return { clientId: config.clientId, siteId: config.siteId, baseUrl: base.href };
}
export function callbackUrls(config) {
  const { baseUrl } = validateConfig(config);
  return {
    thankYouPageUrl: new URL('checkout/complete/', baseUrl).href,
    postFlowUrl: new URL('cart/', baseUrl).href,
    cartPageUrl: new URL('cart/', baseUrl).href,
  };
}
export function validateRedirect(value, config, frontendOrigin) {
  let url;
  try { url = new URL(value); } catch { /* reject below */ }
  const base = new URL(validateConfig(config).baseUrl);
  requireValue(url && url.protocol === 'https:' && !url.username && !url.password && !url.port,
    'Secure checkout could not be opened. Please try again later.', 'UNSAFE_REDIRECT');
  requireValue(!LEGACY_HOSTS.has(url.hostname) && url.origin !== base.origin && url.origin !== frontendOrigin,
    'Checkout is temporarily unavailable. Your cart has been kept; please try again later.', 'LEGACY_CHECKOUT_DOMAIN');
  // Only API-created redirect sessions reach this function, never URL query parameters.
  const hosted = url.hostname === 'www.wix.com' || url.hostname === 'checkout.wix.com' ||
    url.hostname === 'www.checkout.wix.com' || url.hostname === 'accounts.wix.com' ||
    /^[a-z0-9-]+\.wixsite\.com$/.test(url.hostname) ||
    /^[a-z0-9-]+\.wixstudio\.com$/.test(url.hostname);
  requireValue(hosted, 'Secure checkout could not be opened. Please try again later.', 'UNSAFE_REDIRECT');
  return url.href;
}
export function validateExternalUrl(value, config, frontendOrigin) {
  let url;
  try { url = new URL(value); } catch { /* reject below */ }
  requireValue(url && url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    !LEGACY_HOSTS.has(url.hostname) && url.origin !== new URL(config.baseUrl).origin &&
    url.origin !== frontendOrigin && !/^(localhost|127\.|10\.|192\.168\.|\[)/.test(url.hostname),
  'The registration provider link is unavailable. Please try again later.', 'UNSAFE_EXTERNAL');
  return url.href;
}
export function quantity(value, max = 100000, min = 1) {
  const n = Number(value);
  requireValue(value !== '' && Number.isSafeInteger(n) && n >= min && n <= max,
    `Enter a whole-number quantity from ${min} to ${max}.`);
  return n;
}
export function money(value, currency) {
  const amount = value?.amount ?? value?.value ?? value;
  if (amount == null || amount === '' || !Number.isFinite(Number(amount)) || !/^[A-Z]{3}$/.test(currency || '')) {
    return 'Price unavailable';
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));
}
function hasStock(stock) {
  if (!stock || stock.inventoryStatus === 'OUT_OF_STOCK') return false;
  if (stock.trackInventory || stock.trackQuantity) return Number(stock.quantity) > 0;
  return stock.inStock === true || ['IN_STOCK', 'PARTIALLY_OUT_OF_STOCK'].includes(stock.inventoryStatus);
}
export function productSelection(product, choices = {}, customText = {}, count = 1) {
  requireValue(UUID.test(product?._id) && product.visible !== false, 'This product is not available.', 'UNAVAILABLE');
  requireValue(hasStock(product.stock), 'This product is out of stock.', 'OUT_OF_STOCK');
  const selected = {};
  for (const option of product.productOptions || []) {
    requireValue(option.name && option.choices?.length, 'Product options could not be loaded.', 'INVALID_PRODUCT');
    const choice = option.choices.find(c => (c.description || c.value) === choices[option.name]);
    requireValue(choice && choice.visible !== false, `Choose ${option.name}.`);
    requireValue(choice.inStock !== false, `The selected ${option.name} is out of stock.`, 'OUT_OF_STOCK');
    selected[option.name] = choice.description || choice.value;
  }
  let stock = product.stock;
  let price = product.priceData;
  const options = {};
  if (product.manageVariants) {
    const variant = product.variants?.find(v => Object.entries(selected).every(([key, val]) => v.choices?.[key] === val));
    requireValue(variant && UUID.test(variant._id), 'This combination is not available.', 'UNAVAILABLE');
    requireValue(variant.variant?.visible !== false && hasStock(variant.stock),
      'This combination is out of stock.', 'OUT_OF_STOCK');
    options.variantId = variant._id;
    stock = variant.stock;
    price = variant.variant?.priceData || price;
  } else if (Object.keys(selected).length) options.options = selected;
  const text = {};
  for (const field of product.customTextFields || []) {
    requireValue(field.title, 'Product personalization could not be loaded.', 'INVALID_PRODUCT');
    const val = String(customText[field.title] ?? '').trim();
    requireValue(!field.mandatory || val, `Enter ${field.title}.`);
    requireValue(val.length <= (field.maxLength || 500), `${field.title} is too long.`);
    if (val) text[field.title] = val;
  }
  if (Object.keys(text).length) options.customTextFields = text;
  const max = stock.trackInventory || stock.trackQuantity ? Math.min(stock.quantity, 100000) : 100000;
  return {
    lineItem: { quantity: quantity(count, max), catalogReference: {
      catalogItemId: product._id, appId: STORES_APP_ID, ...(Object.keys(options).length ? { options } : {}),
    } },
    price, max,
  };
}
export function eventState(event, now = Date.now()) {
  const registration = event?.registration || {};
  const end = event?.dateAndTimeSettings?.endDate || event?.dateAndTimeSettings?.startDate;
  if (event?.status === 'CANCELED') return { kind: 'closed', message: 'This event has been canceled.' };
  if (event?.status === 'ENDED' || (end && !event?.dateAndTimeSettings?.dateAndTimeTbd && new Date(end).getTime() < now)) {
    return { kind: 'closed', message: 'This event has ended. Registration is closed.' };
  }
  if (!['UPCOMING', 'STARTED'].includes(event?.status)) return { kind: 'closed', message: 'Registration is not available for this event.' };
  if (registration.type === 'NONE') return { kind: 'none', message: 'See the event details for participation and ticket information.' };
  if (registration.registrationPaused || registration.registrationDisabled ||
      registration.status?.startsWith('CLOSED') || registration.tickets?.soldOut) {
    return { kind: 'closed', message: 'Registration is closed.' };
  }
  if (registration.allowedGuestTypes === 'MEMBER') return { kind: 'closed', message: 'This event requires a member account. Online guest registration is not available.' };
  if (registration.type === 'EXTERNAL' && registration.status === 'OPEN_EXTERNAL') return { kind: 'external' };
  if (registration.type === 'TICKETING' && registration.status === 'OPEN_TICKETS') return { kind: 'tickets' };
  if (registration.type === 'RSVP' && registration.initialType !== 'TICKETING') {
    if (registration.rsvp?.endDate && new Date(registration.rsvp.endDate).getTime() < now) {
      return { kind: 'closed', message: 'Registration is closed.' };
    }
    if (registration.rsvp?.startDate && new Date(registration.rsvp.startDate).getTime() > now) {
      return { kind: 'closed', message: 'Registration has not opened yet.' };
    }
    if (registration.status === 'OPEN_RSVP_WAITLIST_ONLY') return { kind: 'rsvp', status: 'WAITING', message: 'This event is full. You can join the waitlist.' };
    if (registration.status === 'OPEN_RSVP') return { kind: 'rsvp', status: 'YES' };
  }
  return { kind: 'closed', message: registration.status === 'SCHEDULED_RSVP' ? 'Registration has not opened yet.' : 'Registration is not available right now.' };
}
export function formFields(form) {
  requireValue(Array.isArray(form?.controls) && form.controls.length, 'The registration form could not be loaded.', 'FORM_UNAVAILABLE');
  const names = new Set();
  const fields = [...form.controls].filter(c => !c.deleted).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0)).flatMap(control =>
    (control.inputs || []).map(input => {
      requireValue(input.name && !names.has(input.name), 'The registration form could not be loaded.', 'FORM_UNAVAILABLE');
      names.add(input.name);
      requireValue(['TEXT', 'NUMBER', 'TEXT_ARRAY', 'DATE_TIME', undefined].includes(input.type),
        'This event requires a registration field that is not supported online yet.', 'UNSUPPORTED_FORM');
      return { ...input, controlType: control.type, systemControl: control.system,
        label: input.label || control.label || input.name };
    }));
  requireValue(fields.length, 'The registration form could not be loaded.', 'FORM_UNAVAILABLE');
  return fields;
}
export function rsvpFormResponse(form, answers) {
  const fields = formFields(form);
  const guestFields = fields.filter(f => f.controlType === 'GUEST_CONTROL');
  const countField = guestFields.find(f => f.type === 'NUMBER');
  const namesField = guestFields.find(f => f.type === 'TEXT_ARRAY');
  const inputValues = fields.map(field => {
    const isArray = field.type === 'TEXT_ARRAY' || field.array;
    let values = isArray ? (Array.isArray(answers[field.name]) ? answers[field.name] : []) : [answers[field.name] ?? ''];
    values = values.map(v => String(v).trim()).filter(Boolean);
    const required = field.mandatory && !(field === namesField && countField && Number(answers[countField.name] || 0) === 0);
    requireValue(!required || values.length, `Complete ${field.label}.`);
    requireValue(values.length <= (isArray ? (field.maxSize || 100) : 1), `Too many values for ${field.label}.`);
    for (const value of values) {
      requireValue(value.length <= (field.maxLength || 5000), `${field.label} is too long.`);
      requireValue(!field.options?.length || field.options.includes(value), `Choose an available option for ${field.label}.`);
      if (field.type === 'NUMBER') {
        requireValue(Number.isFinite(Number(value)), `Enter a number for ${field.label}.`);
        if (field.controlType === 'GUEST_CONTROL') quantity(value, 10, 0);
      }
      if (field.type === 'DATE_TIME') requireValue(Number.isFinite(new Date(value).getTime()), `Enter a valid date for ${field.label}.`);
      if (/email/i.test(field.name)) requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Enter a valid email address.');
    }
    return isArray ? { inputName: field.name, values } : { inputName: field.name, value: values[0] || '' };
  });
  if (countField && namesField?.mandatory) {
    requireValue(Number(answers[countField.name] || 0) === (answers[namesField.name] || []).filter(v => String(v).trim()).length,
      'Enter one name for each additional guest.');
  }
  return { inputValues };
}
function rsvpV2Fields(form) {
  const fields = formFields(form);
  // These names and control kinds were confirmed by a read-only public form
  // probe. `system` is optional in the SDK schema; reject an explicit custom
  // marker, but don't require an omitted flag. Never infer identity from labels,
  // input order, or answers outside the returned form.
  const identityFields = fields.filter(f => f.systemControl == null || f.systemControl === true);
  const firstName = identityFields.find(f => f.controlType === 'NAME' && f.name === 'firstName');
  const lastName = identityFields.find(f => f.controlType === 'NAME' && f.name === 'lastName');
  const email = identityFields.find(f => f.controlType === 'INPUT' && f.name === 'email');
  requireValue([firstName, lastName, email].every(f => f && f.type === 'TEXT' && !f.array),
    'The registration identity fields could not be matched. Please try again later.', 'UNSUPPORTED_IDENTITY_FIELDS');
  const guestFields = fields.filter(f => f.controlType === 'GUEST_CONTROL');
  const counts = guestFields.filter(f => f.type === 'NUMBER');
  const names = guestFields.filter(f => f.type === 'TEXT_ARRAY');
  requireValue(!guestFields.length || (counts.length === 1 && names.length <= 1),
    'The additional guest fields could not be matched. Please try again later.', 'UNSUPPORTED_GUEST_FIELDS');
  return { firstName, lastName, email, count: counts[0], names: names[0] };
}
/** Explicit v2 request; the SDK returns an Rsvp directly, not {rsvp: ...}.
 * https://dev.wix.com/docs/api-reference/business-solutions/events/registration/rsvp-v2/create-rsvp.md */
export function rsvpV2Request(eventId, form, answers, responseStatus) {
  const fields = rsvpV2Fields(form);
  const response = rsvpFormResponse(form, answers);
  const values = new Map(response.inputValues.map(input => [input.inputName, input]));
  const identity = {};
  for (const key of ['firstName', 'lastName', 'email']) {
    const value = values.get(fields[key].name)?.value;
    requireValue(typeof value === 'string' && value.length >= (key === 'email' ? 4 : 1) &&
      value.length <= (key === 'email' ? 255 : 50), `Enter a valid ${fields[key].label}.`);
    identity[key] = value;
  }
  requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email), 'Enter a valid email address.');
  const status = responseStatus === 'WAITING' ? 'WAITLIST' : responseStatus;
  requireValue(['YES', 'NO', 'WAITLIST'].includes(status), 'Choose an available RSVP response.');
  const request = { eventId, ...identity, form: response, status };
  if (fields.count) {
    const guestCount = quantity(values.get(fields.count.name)?.value || '0', 10, 0);
    const guestNames = fields.names ? values.get(fields.names.name)?.values || [] : [];
    requireValue(guestNames.length <= Math.min(fields.names?.maxSize ?? 10, 10) &&
      guestNames.every(name => name.length <= 101), 'Check the additional guest names.');
    requireValue((!guestNames.length && !fields.names?.mandatory) || guestNames.length === guestCount,
      'Enter one name for each additional guest.');
    request.additionalGuestDetails = { guestCount, ...(guestNames.length ? { guestNames } : {}) };
  }
  return request;
}
export function ticketSelections(event, definitions, selections) {
  requireValue(eventState(event).kind === 'tickets', 'Ticket sales are closed.', 'CLOSED');
  const tickets = [];
  const seen = new Set();
  for (const selection of selections) {
    const count = quantity(selection.quantity, 50, 0);
    if (!count) continue;
    const ticket = definitions.find(t => t._id === selection.ticketDefinitionId);
    requireValue(ticket && ticket.eventId === event._id && UUID.test(ticket._id) && !seen.has(ticket._id),
      'Choose an available ticket.');
    seen.add(ticket._id);
    requireValue(!ticket.saleStatus || ticket.saleStatus === 'SALE_STARTED', 'This ticket is not on sale.', 'CLOSED');
    requireValue(!ticket.dashboard?.hidden, 'This ticket is unavailable.', 'UNAVAILABLE');
    quantity(count, Math.min(ticket.limitPerCheckout ?? 20, ticket.dashboard?.unsold ?? 50));
    const ticketInfo = {};
    if (ticket.pricing?.pricingOptions?.options?.length) {
      const option = ticket.pricing.pricingOptions.options.find(o => o._id === selection.pricingOptionId);
      requireValue(option && UUID.test(option._id), `Choose a price option for ${ticket.name}.`);
      ticketInfo.pricingOptionId = option._id;
    }
    if (ticket.pricing?.pricingType === 'DONATION') {
      requireValue(/^\d+(\.\d{1,2})?$/.test(String(selection.guestPrice)) &&
        Number(selection.guestPrice) >= Number(ticket.pricing.minPrice?.amount || 0),
      `Enter at least ${money(ticket.pricing.minPrice, ticket.pricing.minPrice?.currency)} for ${ticket.name}.`);
      ticketInfo.guestPrice = String(selection.guestPrice);
    }
    tickets.push({ ticketDefinitionId: ticket._id, quantity: count,
      ...(Object.keys(ticketInfo).length ? { ticketInfo } : {}) });
  }
  requireValue(tickets.length, 'Choose at least one ticket.');
  quantity(tickets.reduce((sum, t) => sum + t.quantity, 0), event.registration.tickets?.ticketLimitPerOrder || 20);
  return tickets;
}
function codeOf(error) {
  return error?.details?.applicationError?.code || error?.details?.errorcode || error?.code || '';
}
function publicError(error, action) {
  if (error instanceof TransactionError) return error;
  const code = codeOf(error);
  if (['PERMISSION_DENIED', 'FORBIDDEN', 'UNAUTHENTICATED'].includes(code) || [401, 403].includes(error?.httpStatus || error?.status)) {
    return new TransactionError('PERMISSION_DENIED', `${action} is not available for your guest session. Please try again later.`);
  }
  if (/STOCK|AVAILABLE|CAPACITY|LIMIT|SOLD_OUT/.test(code)) {
    return new TransactionError('AVAILABILITY_CHANGED', 'Availability has changed. Refresh the details and review your selection.');
  }
  if (/INVALID_FORM|VALIDATION/.test(code)) {
    return new TransactionError('FORM_REJECTED', 'Registration was not accepted. Check the required fields and available choices, then try again.');
  }
  // Never display/log SDK messages: they can contain submitted guest/contact data.
  return new TransactionError('REQUEST_FAILED', `${action} could not be confirmed. Check your connection and try again. If you submitted registration or payment, check your confirmation email before retrying.`);
}
function browserStorage() {
  try { return globalThis.sessionStorage; } catch { return undefined; }
}
export function createVisitorApi(rawConfig, dependencies = {}) {
  const config = validateConfig(rawConfig);
  const storage = dependencies.storage === undefined ? browserStorage() : dependencies.storage;
  const sessionKey = `montlake:wix:visitor:${config.siteId}:${config.clientId}`;
  const flowKey = `${sessionKey}:checkout`;
  let persistent = Boolean(storage);
  function read(key) { try { return JSON.parse(storage?.getItem(key) || 'null'); } catch { return null; } }
  function save(key, value) {
    try { if (!storage) throw new Error(); storage.setItem(key, JSON.stringify(value)); }
    catch { persistent = false; }
  }
  const saved = read(sessionKey);
  const tokens = saved?.refreshToken?.role === 'visitor' && typeof saved.refreshToken.value === 'string' ? saved : undefined;
  const client = dependencies.client || createClient({
    modules: {
      products: { getProduct: products.getProduct, queryProductVariants: products.queryProductVariants,
        getProductOptionsAvailability: products.getProductOptionsAvailability },
      currentCart: {
        getCurrentCart: currentCart.getCurrentCart, addToCurrentCart: currentCart.addToCurrentCart,
        updateCurrentCartLineItemQuantity: currentCart.updateCurrentCartLineItemQuantity,
        removeLineItemsFromCurrentCart: currentCart.removeLineItemsFromCurrentCart,
        createCheckoutFromCurrentCart: currentCart.createCheckoutFromCurrentCart,
      },
      checkout: { getCheckout: checkout.getCheckout },
      wixEventsV2: { getEvent: wixEventsV2.getEvent }, forms: { getForm: forms.getForm },
      rsvpV2: { createRsvp: rsvpV2.createRsvp }, orders: { listAvailableTickets: orders.listAvailableTickets },
      ticketReservations: { createTicketReservation: ticketReservations.createTicketReservation,
        getTicketReservation: ticketReservations.getTicketReservation },
      policies: { queryPolicies: policies.queryPolicies }, redirects: { createRedirectSession: redirects.createRedirectSession },
    },
    auth: OAuthStrategy({ clientId: config.clientId, siteId: config.siteId, ...(tokens ? { tokens } : {}) }),
  });
  if (dependencies.client && tokens) client.auth.setTokens(tokens);
  let ready;
  let queue = Promise.resolve();
  let flow = read(flowKey);
  async function session() {
    if (!ready) {
      ready = (async () => {
        const generated = await client.auth.generateVisitorTokens(client.auth.getTokens());
        client.auth.setTokens(generated);
        save(sessionKey, client.auth.getTokens());
      })().catch(error => { ready = undefined; throw error; });
    }
    return ready;
  }
  function run(action, operation) {
    const result = queue.then(async () => {
      try { await session(); return await operation(); }
      catch (error) { throw publicError(error, action); }
      finally { if (ready) save(sessionKey, client.auth.getTokens()); }
    });
    queue = result.catch(() => {});
    return result;
  }
  async function getProduct(id) {
    requireValue(UUID.test(id), 'This product is unavailable.');
    const result = await client.products.getProduct(id);
    const product = result.product;
    requireValue(product?._id === id, 'Product details could not be loaded.', 'INVALID_RESPONSE');
    if (product.manageVariants) {
      const variants = [];
      for (let offset = 0; ; offset += 100) {
        const page = await client.products.queryProductVariants(id, { paging: { offset, limit: 100 } });
        requireValue(Array.isArray(page.variants), 'Product options could not be loaded.', 'INVALID_RESPONSE');
        variants.push(...page.variants);
        if (page.variants.length < 100 || variants.length >= page.totalResults) break;
        requireValue(offset < 9900, 'There are too many product options to load.', 'INVALID_RESPONSE');
      }
      product.variants = variants;
    }
    return product;
  }
  async function getEvent(id) {
    requireValue(UUID.test(id), 'This event is unavailable.');
    // `fields`, not fieldset/query.fields: installed GetEventOptions.
    const event = await client.wixEventsV2.getEvent(id, { fields: ['REGISTRATION', 'FORM'] });
    requireValue(event?._id === id, 'Event details could not be loaded.', 'INVALID_RESPONSE');
    return event;
  }
  async function getPolicies(id) {
    let page = await client.policies.queryPolicies().eq('eventId', id).limit(100).find();
    const result = [];
    for (;;) {
      result.push(...page.items);
      if (!page.hasNext()) return result;
      requireValue(result.length < 10000, 'Event policies could not be loaded.', 'INVALID_RESPONSE');
      page = await page.next();
    }
  }
  async function availableTickets(id) {
    const definitions = [];
    for (let offset = 0; ; offset += 100) {
      const page = await client.orders.listAvailableTickets({ eventId: id, limit: 100, offset });
      requireValue(Array.isArray(page.definitions), 'Tickets could not be loaded.', 'INVALID_RESPONSE');
      definitions.push(...page.definitions);
      if (page.definitions.length < 100 || definitions.length >= page.metaData?.total) return definitions;
      requireValue(offset < 9900, 'Tickets could not be loaded.', 'INVALID_RESPONSE');
    }
  }
  async function getCart() {
    try {
      const cart = await client.currentCart.getCurrentCart();
      requireValue(Array.isArray(cart?.lineItems), 'Your cart could not be loaded.', 'INVALID_RESPONSE');
      return cart;
    } catch (error) {
      if (['OWNED_CART_NOT_FOUND', 'CART_NOT_FOUND', 'CURRENT_CART_NOT_FOUND'].includes(codeOf(error))) return { lineItems: [] };
      throw error;
    }
  }
  async function redirect(intent) {
    const result = await client.redirects.createRedirectSession({
      ...intent, callbacks: callbackUrls(config),
      preferences: { useGenericWixPages: true, maintainIdentity: true },
    });
    return validateRedirect(result.redirectSession?.fullUrl, config, dependencies.frontendOrigin);
  }
  function remember(value) { flow = { ...value, createdAt: Date.now() }; save(flowKey, flow); }
  const api = {
    config,
    get persistentSession() { return persistent; },
    product: id => run('Loading product details', () => getProduct(id)),
    addProduct: (id, choices, customText, count) => run('Adding to your cart', async () => {
      // Re-read stock immediately before changing the cart. Server still enforces stock.
      const product = await getProduct(id);
      const { lineItem } = productSelection(product, choices, customText, count);
      if (product.productOptions?.length) {
        const availability = await client.products.getProductOptionsAvailability(id, choices);
        requireValue(availability.availableForPurchase === true, 'This combination is out of stock.', 'OUT_OF_STOCK');
      }
      const result = await client.currentCart.addToCurrentCart({ lineItems: [lineItem] });
      requireValue(result.cart?.lineItems?.length, 'Your cart update could not be confirmed.', 'INVALID_RESPONSE');
      return result.cart;
    }),
    cart: () => run('Loading your cart', getCart),
    updateQuantity: (id, count) => run('Updating your cart', async () => {
      requireValue(UUID.test(id), 'This cart item is unavailable.');
      const result = await client.currentCart.updateCurrentCartLineItemQuantity([{ _id: id, quantity: quantity(count) }]);
      requireValue(Array.isArray(result.cart?.lineItems), 'Your cart update could not be confirmed.', 'INVALID_RESPONSE');
      return result.cart;
    }),
    removeItem: id => run('Removing the cart item', async () => {
      requireValue(UUID.test(id), 'This cart item is unavailable.');
      const result = await client.currentCart.removeLineItemsFromCurrentCart([id]);
      requireValue(Array.isArray(result.cart?.lineItems), 'Your cart update could not be confirmed.', 'INVALID_RESPONSE');
      return result.cart;
    }),
    checkout: () => run('Opening checkout', async () => {
      const cart = await getCart();
      requireValue(cart.lineItems.length, 'Your cart is empty.');
      requireValue(cart.lineItems.every(item => !item.availability?.status || item.availability.status === 'AVAILABLE'),
        'Some items are no longer available. Update your cart before checking out.', 'OUT_OF_STOCK');
      const result = await client.currentCart.createCheckoutFromCurrentCart({ channelType: 'WEB' });
      requireValue(UUID.test(result.checkoutId), 'Checkout could not be opened.', 'INVALID_RESPONSE');
      remember({ type: 'cart', id: result.checkoutId });
      return redirect({ ecomCheckout: { checkoutId: result.checkoutId } });
    }),
    event: id => run('Loading registration', async () => {
      const event = await getEvent(id);
      const state = eventState(event);
      if (state.kind === 'external') return { event, state, url: validateExternalUrl(event.registration.external?.url, config, dependencies.frontendOrigin) };
      if (state.kind === 'rsvp') {
        const form = event.form || await client.forms.getForm(id);
        rsvpV2Fields(form);
        return { event, state, form, policies: await getPolicies(id) };
      }
      if (state.kind === 'tickets') return { event, state, tickets: await availableTickets(id) };
      return { event, state };
    }),
    submitRsvp: (id, answers, consentIds = [], response) => run('Registration', async () => {
      const event = await getEvent(id);
      const state = eventState(event);
      requireValue(state.kind === 'rsvp', 'Registration is closed.', 'CLOSED');
      const form = event.form || await client.forms.getForm(id);
      const eventPolicies = await getPolicies(id);
      requireValue(eventPolicies.every(p => consentIds.includes(p._id)), 'Please agree to each event policy.');
      let status = state.status;
      requireValue(response == null || ['YES', 'NO'].includes(response), 'Choose an available RSVP response.');
      if (response === 'NO') {
        requireValue(event.registration.rsvp?.responseType === 'YES_AND_NO',
          'The available RSVP responses have changed. Refresh registration details before submitting.');
        status = 'NO';
      }
      const request = rsvpV2Request(id, form, answers, status);
      // No ModificationOptions, disableNotifications, member/contact IDs, or
      // fallback to the retired v1 endpoint. Wix enforces capacity and form rules.
      const result = await client.rsvpV2.createRsvp(request);
      requireValue(UUID.test(result?._id) && result.eventId === id && ['YES', 'NO', 'WAITLIST'].includes(result.status),
        'Your RSVP could not be confirmed. Check your email before trying again.', 'UNCONFIRMED');
      return { status: result.status === 'WAITLIST' ? 'WAITING' : result.status };
    }),
    reserveTickets: (id, selections) => run('Opening ticket checkout', async () => {
      const event = await getEvent(id);
      const definitions = await availableTickets(id);
      const tickets = ticketSelections(event, definitions, selections);
      requireValue(typeof event.slug === 'string' && /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,149}$/u.test(event.slug),
        'Ticket checkout could not be opened.', 'INVALID_SLUG');
      const reservation = await client.ticketReservations.createTicketReservation({ tickets });
      requireValue(UUID.test(reservation._id) && reservation.status === 'PENDING',
        'Your ticket reservation could not be confirmed. Please check before retrying.', 'UNCONFIRMED');
      remember({ type: 'tickets', id: reservation._id });
      return redirect({ eventsCheckout: { eventSlug: event.slug, reservationId: reservation._id } });
    }),
    confirmation: () => run('Checking confirmation', async () => {
      // Query parameters are not proof of payment and are deliberately never read.
      if (!flow || !UUID.test(flow.id) || Date.now() - flow.createdAt > 86400000 || flow.createdAt > Date.now()) return { verified: false };
      if (flow.type === 'cart') {
        const result = await client.checkout.getCheckout(flow.id);
        return { verified: result._id === flow.id && result.completed === true, type: 'cart' };
      }
      if (flow.type === 'tickets') {
        const result = await client.ticketReservations.getTicketReservation(flow.id);
        return { verified: result._id === flow.id && result.status === 'CONFIRMED', type: 'tickets' };
      }
      return { verified: false };
    }),
  };
  return api;
}
