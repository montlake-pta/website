import {
  createVisitorApi, TransactionError, formFields, hasStock, money, productSelection, stockState, validateConfig,
} from './wix-visitor-api.mjs';

let nextId = 0;
const mounted = new WeakSet();
const NEUTRAL_CONFIRMATION = 'This page does not confirm a payment. If you completed checkout, look for your confirmation email and receipt. If checkout was interrupted, return to your cart or event to review your next step.';

function element(document, tag, text, className) {
  const node = document.createElement(tag);
  if (tag === 'form') node.setAttribute('method', 'post');
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(document, text, primary = false) {
  const node = element(document, 'button', text, `button button-${primary ? 'primary' : 'secondary'}`);
  node.type = 'button';
  return node;
}
function link(document, text, href) {
  const node = element(document, 'a', text, 'button button-secondary');
  node.href = href;
  return node;
}
function field(document, parent, label, { type = 'text', options, required = false, value = '', max, min, maxLength, multiple = false } = {}) {
  const wrapper = element(document, 'div', null, 'transaction-field');
  const id = `transaction-field-${++nextId}`;
  const labelNode = element(document, 'label', `${label}${required ? ' (required)' : ''}`);
  labelNode.htmlFor = id;
  const control = element(document, options ? 'select' : type === 'textarea' ? 'textarea' : 'input');
  control.id = id;
  control.name = id;
  control.required = required;
  if (options) {
    control.multiple = multiple;
    if (!multiple) {
      const placeholder = element(document, 'option', 'Choose an option');
      placeholder.value = '';
      control.append(placeholder);
    }
    for (const option of options) {
      const node = element(document, 'option', typeof option === 'string' ? option : option.label);
      node.value = typeof option === 'string' ? option : option.value;
      node.disabled = Boolean(option.disabled);
      control.append(node);
    }
  } else if (type !== 'textarea') control.type = type;
  if (min != null) control.min = String(min);
  if (max != null) control.max = String(max);
  if (maxLength) control.maxLength = maxLength;
  if (type === 'number') control.step = '1';
  if (type === 'email') control.autocomplete = 'email';
  control.value = String(value);
  wrapper.append(labelNode, control);
  parent.append(wrapper);
  return control;
}
function checkbox(document, parent, text) {
  const wrapper = element(document, 'div', null, 'transaction-field');
  const label = element(document, 'label');
  const input = element(document, 'input');
  input.type = 'checkbox';
  label.append(input, document.createTextNode(text));
  wrapper.append(label);
  parent.append(wrapper);
  return input;
}
function panel(document, slot, heading) {
  for (const placeholder of slot.querySelectorAll('[data-transaction-loading]')) placeholder.remove();
  const root = element(document, 'section', null, 'transaction-panel');
  const title = element(document, 'h2', heading);
  title.id = `transaction-heading-${++nextId}`;
  root.setAttribute('aria-labelledby', title.id);
  const status = element(document, 'p', '', 'transaction-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  status.tabIndex = -1;
  const body = element(document, 'div');
  const recovery = element(document, 'div', null, 'transaction-actions');
  root.append(title, status, body, recovery);
  // Additive enhancement: server-rendered description and no-JS guidance remain.
  slot.append(root);
  let busy = false;
  function tell(message, focus = false) {
    status.textContent = message;
    if (focus) status.focus();
  }
  async function perform(message, action, { focus = true, retry } = {}) {
    if (busy) return;
    busy = true;
    const controls = [...root.querySelectorAll('button,input,select,textarea')].map(node => [node, node.disabled]);
    controls.forEach(([node]) => { node.disabled = true; });
    root.setAttribute('aria-busy', 'true');
    recovery.replaceChildren();
    tell(message);
    try { await action(); }
    catch (error) {
      tell(error instanceof TransactionError ? error.message : 'This action could not be completed. Check your connection and try again.', focus);
      if (retry) {
        const again = button(document, 'Try again');
        again.addEventListener('click', () => retry());
        recovery.append(again);
      }
    } finally {
      busy = false;
      root.setAttribute('aria-busy', 'false');
      controls.forEach(([node, disabled]) => { if (node.isConnected) node.disabled = disabled; });
    }
  }
  return { root, body, recovery, status, tell, perform };
}
function storageNotice(document, body, api) {
  if (!api.persistentSession) body.append(element(document, 'p',
    'Your browser is not saving this guest session. Enable session storage to keep your cart when moving between pages.'));
}
function productPanel(document, slot, api, readOnly = false) {
  const ui = panel(document, slot, readOnly ? 'Current availability' : 'Order this item');
  const id = slot.getAttribute('data-wix-product-id');
  async function load(userInitiated = false) {
    await ui.perform('Checking current price and availability…', async () => {
      const product = await api.product(id);
      ui.body.replaceChildren();
      const stock = product.stock;
      if (readOnly) {
        const availability = product.visible === false ? 'This item is unavailable.' : {
          IN_STOCK: 'In stock', PARTIALLY_OUT_OF_STOCK: 'Some options are out of stock',
          OUT_OF_STOCK: 'Out of stock', UNKNOWN: 'Current availability could not be confirmed.',
        }[stockState(stock)];
        const price = product.visible === false ? 'Price unavailable'
          : money(product.priceData?.discountedPrice ?? product.priceData?.price, product.priceData?.currency);
        const metadata = slot.querySelectorAll('[data-wix-product-metadata]')[0];
        const details = [element(document, 'p', price, 'product-price'), element(document, 'p', availability, 'card-meta')];
        if (metadata) metadata.replaceChildren(...details);
        else ui.body.append(...details);
        const refresh = button(document, 'Refresh availability');
        refresh.addEventListener('click', load);
        ui.body.append(refresh);
        ui.tell('Showing the latest product information.', Boolean(userInitiated));
        return;
      }
      storageNotice(document, ui.body, api);
      if (!hasStock(stock) || product.visible === false) {
        ui.tell('This item is currently out of stock.');
        const again = button(document, 'Check availability again');
        again.addEventListener('click', load);
        ui.body.append(again);
        return;
      }
      const form = element(document, 'form');
      const price = element(document, 'p', money(product.priceData?.discountedPrice ?? product.priceData?.price, product.priceData?.currency));
      form.append(price);
      const choices = new Map();
      for (const option of product.productOptions || []) {
        choices.set(option.name, field(document, form, option.name, {
          required: true,
          options: (option.choices || []).filter(c => c.visible !== false).map(c => ({
            value: c.description || c.value,
            label: `${c.description || c.value}${c.inStock === false ? ' — out of stock' : ''}`,
            disabled: c.inStock === false,
          })),
        }));
      }
      const customText = new Map();
      for (const item of product.customTextFields || []) {
        customText.set(item.title, field(document, form, item.title, { required: item.mandatory, maxLength: item.maxLength || 500 }));
      }
      const count = field(document, form, 'Quantity', { type: 'number', min: 1, max: 100000, value: 1, required: true });
      const actions = element(document, 'div', null, 'transaction-actions');
      const add = button(document, 'Add to cart', true);
      add.type = 'submit';
      const refresh = button(document, 'Refresh availability');
      refresh.addEventListener('click', load);
      actions.append(add, link(document, 'View cart', new URL('cart/', api.config.baseUrl).href), refresh);
      form.append(actions);
      ui.body.append(form);
      const values = controls => Object.fromEntries([...controls].map(([key, node]) => [key, node.value]));
      function selectionState() {
        try {
          const selected = productSelection(product, values(choices), values(customText), count.value);
          add.disabled = false;
          count.max = String(selected.max);
          price.textContent = money(selected.price?.discountedPrice ?? selected.price?.price, selected.price?.currency);
          ui.tell('Available to add to your cart. Final availability and totals are checked at checkout.');
        } catch (error) {
          add.disabled = true;
          ui.tell(error.message);
        }
      }
      form.addEventListener('input', selectionState);
      form.addEventListener('change', selectionState);
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        void ui.perform('Updating your cart…', async () => {
          await api.addProduct(id, values(choices), values(customText), count.value);
          ui.tell('Your cart has been updated. Open your cart to review the items and quantities.', true);
        });
      });
      selectionState();
    }, { focus: Boolean(userInitiated), retry: () => load(true) });
    if (userInitiated) ui.status.focus();
  }
  return load();
}
function cartPanel(document, slot, api, navigate) {
  const ui = panel(document, slot, 'Cart items');
  function draw(cart) {
    ui.body.replaceChildren();
    storageNotice(document, ui.body, api);
    if (!cart.lineItems.length) {
      ui.tell('Your cart is empty.');
      ui.body.append(link(document, 'Browse the shop', new URL('shop/', api.config.baseUrl).href));
      return;
    }
    let unavailable = false;
    for (const item of cart.lineItems) {
      const row = element(document, 'section', null, 'transaction-item');
      const name = item.productName?.translated || item.productName?.original || 'Shop item';
      row.append(element(document, 'h3', name));
      row.append(element(document, 'p', `${money(item.price, cart.currency)} each · Quantity ${item.quantity}`));
      for (const description of item.descriptionLines || []) {
        const label = description.name?.translated || description.name?.original;
        const value = description.plainText?.translated || description.plainText?.original;
        if (label && value) row.append(element(document, 'p', `${label}: ${value}`));
      }
      const available = !item.availability?.status || item.availability.status === 'AVAILABLE';
      if (!available) {
        unavailable = true;
        row.append(element(document, 'p', item.availability?.quantityAvailable > 0
          ? `Only ${item.availability.quantityAvailable} are currently available. Update the quantity before checkout.`
          : 'This item is currently unavailable. Remove it before checkout.'));
      }
      const form = element(document, 'form');
      const count = field(document, form, `Quantity for ${name}`, {
        type: 'number', value: item.quantity, required: true, min: 1,
        max: item.availability?.quantityAvailable > 0 ? item.availability.quantityAvailable : 100000,
      });
      count.disabled = Boolean(item.fixedQuantity);
      const actions = element(document, 'div', null, 'transaction-actions');
      const update = button(document, 'Update quantity');
      update.type = 'submit';
      update.disabled = Boolean(item.fixedQuantity);
      const remove = button(document, `Remove ${name}`);
      actions.append(update, remove);
      form.append(actions);
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        void ui.perform('Updating quantity…', async () => {
          draw(await api.updateQuantity(item._id, count.value));
          ui.tell('Your cart now shows the available quantities and current prices.', true);
        });
      });
      remove.addEventListener('click', () => {
        void ui.perform('Removing item…', async () => {
          draw(await api.removeItem(item._id));
          ui.tell('Item removed. Your cart is up to date.', true);
        });
      });
      row.append(form);
      ui.body.append(row);
    }
    if (cart.subtotal) ui.body.append(element(document, 'p', `Subtotal: ${money(cart.subtotal, cart.currency)}`));
    ui.body.append(element(document, 'p', 'Shipping, taxes, discounts, and the final total are shown at secure checkout. Payment details are collected there, not on this site.'));
    const actions = element(document, 'div', null, 'transaction-actions');
    const checkout = button(document, 'Continue to secure checkout', true);
    checkout.disabled = unavailable;
    checkout.addEventListener('click', () => {
      void ui.perform('Opening secure checkout…', async () => {
        const url = await api.checkout();
        navigate(url);
      });
    });
    const refresh = button(document, 'Refresh cart');
    refresh.addEventListener('click', load);
    actions.append(checkout, refresh, link(document, 'Continue shopping', new URL('shop/', api.config.baseUrl).href));
    ui.body.append(actions);
    ui.tell(unavailable ? 'Review the unavailable items before checkout.' : 'Your cart is up to date.');
  }
  async function load(userInitiated = false) {
    await ui.perform('Loading your cart…', async () => draw(await api.cart()), { focus: Boolean(userInitiated), retry: () => load(true) });
    if (userInitiated) ui.status.focus();
  }
  return load();
}
function formControl(document, form, definition) {
  if (definition.controlType === 'CHECKBOX' && definition.options?.length) {
    const group = element(document, 'fieldset', null, 'transaction-field');
    group.append(element(document, 'legend', `${definition.label}${definition.mandatory ? ' (choose at least one)' : ''}`));
    const controls = definition.options.map(option => [option, checkbox(document, group, option)]);
    form.append(group);
    return () => controls.filter(([, node]) => node.checked).map(([value]) => value);
  }
  const array = definition.type === 'TEXT_ARRAY' || definition.array;
  const control = field(document, form, `${definition.label}${array && !definition.options?.length ? ' — one entry per line' : ''}`, {
    type: array || definition.controlType === 'TEXTAREA' ? 'textarea' :
      definition.type === 'NUMBER' ? 'number' : definition.type === 'DATE_TIME' ? 'datetime-local' :
        /email/i.test(definition.name) ? 'email' : 'text',
    options: definition.options?.length ? definition.options : undefined,
    multiple: array && Boolean(definition.options?.length),
    // Guest-name completeness is conditional on the count and checked by the
    // schema validator; zero additional guests must not require an empty list.
    required: definition.mandatory && !(definition.controlType === 'GUEST_CONTROL' && array),
    maxLength: definition.maxLength || 5000,
    min: definition.controlType === 'GUEST_CONTROL' && definition.type === 'NUMBER' ? 0 : undefined,
    max: definition.controlType === 'GUEST_CONTROL' && definition.type === 'NUMBER' ? 10 : undefined,
    value: definition.controlType === 'GUEST_CONTROL' && definition.type === 'NUMBER' ? 0 : '',
  });
  if (/first.?name/i.test(definition.name)) control.autocomplete = 'given-name';
  if (/last.?name/i.test(definition.name)) control.autocomplete = 'family-name';
  return () => {
    if (array) return definition.options?.length ? [...control.selectedOptions].map(o => o.value) : control.value.split(/\r?\n/).filter(v => v.trim());
    if (definition.type === 'DATE_TIME' && control.value) return new Date(control.value).toISOString();
    return control.value;
  };
}
function plainPolicy(body = '') {
  // Policies are text-only here; no remote HTML enters the live DOM.
  return body.replace(/<br\s*\/?>|<\/(?:p|li|div)>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
function eventPanel(document, slot, api, navigate, readOnly = false) {
  const ui = panel(document, slot, 'Registration');
  const id = slot.getAttribute('data-wix-event-id');
  function drawRsvp(data) {
    const form = element(document, 'form');
    const controls = new Map(formFields(data.form).map(definition => [definition.name, formControl(document, form, definition)]));
    let response;
    if (data.event.registration.rsvp?.responseType === 'YES_AND_NO' && data.state.status !== 'WAITING') {
      response = field(document, form, 'Will you attend?', { required: true, options: [
        { value: 'YES', label: 'Yes, I will attend' }, { value: 'NO', label: 'No, I cannot attend' },
      ] });
    }
    const consent = new Map();
    for (const policy of data.policies) {
      const details = element(document, 'details');
      details.append(element(document, 'summary', policy.name || 'Event policy'), element(document, 'p', plainPolicy(policy.body)));
      form.append(details);
      const control = checkbox(document, form, `I agree to ${policy.name || 'the event policy'} (required).`);
      control.required = true;
      consent.set(policy._id, control);
    }
    const submit = button(document, data.state.status === 'WAITING' ? 'Join the waitlist' : 'Submit RSVP', true);
    submit.type = 'submit';
    const actions = element(document, 'div', null, 'transaction-actions');
    actions.append(submit);
    form.append(actions);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      void ui.perform('Submitting your RSVP…', async () => {
        const result = await api.submitRsvp(id,
          Object.fromEntries([...controls].map(([key, read]) => [key, read()])),
          [...consent].filter(([, node]) => node.checked).map(([key]) => key), response?.value);
        form.replaceChildren();
        ui.tell(result.status === 'WAITING'
          ? 'You have been added to the waitlist, not the confirmed guest list. Watch for updates by email.'
          : result.status === 'NO' ? 'Your response has been recorded: you are not attending.'
            : 'Your RSVP is confirmed. Check your email for the event details.', true);
      });
    });
    ui.body.append(form);
    ui.tell(data.state.message || 'Complete the registration form below. Required fields are marked.');
  }
  function drawTickets(data) {
    if (!data.tickets.length) { ui.tell('There are no tickets available right now.'); return; }
    const form = element(document, 'form');
    const selections = [];
    for (const ticket of data.tickets) {
      const row = element(document, 'fieldset', null, 'transaction-field');
      row.append(element(document, 'legend', ticket.name || 'Event ticket'));
      if (ticket.description) row.append(element(document, 'p', ticket.description));
      const price = ticket.pricing?.fixedPrice || ticket.price;
      row.append(element(document, 'p', ticket.free ? 'Free' : money(price, price?.currency || data.event.registration.tickets?.currency)));
      const count = field(document, row, `Quantity for ${ticket.name || 'this ticket'}`, {
        type: 'number', min: 0, max: Math.min(ticket.limitPerCheckout ?? 20, data.event.registration.tickets?.ticketLimitPerOrder || 20),
        value: 0, required: true,
      });
      count.disabled = Boolean(ticket.saleStatus && ticket.saleStatus !== 'SALE_STARTED');
      let option, donation;
      if (ticket.pricing?.pricingOptions?.options?.length) {
        option = field(document, row, 'Ticket price option', { options: ticket.pricing.pricingOptions.options.map(o => ({
          value: o._id, label: `${o.name}: ${money(o.price, o.price?.currency)}`,
        })) });
      }
      if (ticket.pricing?.pricingType === 'DONATION') {
        donation = field(document, row, `Price per ticket (minimum ${money(ticket.pricing.minPrice, ticket.pricing.minPrice?.currency)})`, {
          type: 'number', min: ticket.pricing.minPrice?.amount || 0, value: ticket.pricing.minPrice?.amount || '',
        });
        donation.step = '0.01';
      }
      selections.push(() => ({ ticketDefinitionId: ticket._id, quantity: count.value,
        ...(option ? { pricingOptionId: option.value } : {}), ...(donation ? { guestPrice: donation.value } : {}) }));
      if (ticket.policy) row.append(element(document, 'p', plainPolicy(ticket.policy)));
      form.append(row);
    }
    form.append(element(document, 'p', `Up to ${data.event.registration.tickets?.ticketLimitPerOrder || 20} tickets per order. Complete guest details, required policies, and payment on the secure checkout page. Tickets are not confirmed until checkout is complete.`));
    const actions = element(document, 'div', null, 'transaction-actions');
    const submit = button(document, 'Continue to ticket checkout', true);
    submit.type = 'submit';
    actions.append(submit);
    form.append(actions);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      void ui.perform('Reserving your selection and opening checkout…', async () => {
        navigate(await api.reserveTickets(id, selections.map(read => read())));
      });
    });
    ui.body.append(form);
    ui.tell('Choose your tickets. Availability is checked again before checkout.');
  }
  async function load(userInitiated = false) {
    await ui.perform('Checking registration details…', async () => {
      const data = await api.event(id);
      ui.body.replaceChildren();
      if (readOnly) {
        ui.tell(data.state.message || {
          rsvp: 'Registration is open. Use the event registration link for details and to respond.',
          tickets: 'Ticket sales are open. Use the event link for current ticketing details.',
          external: 'Registration is handled by the event provider.',
        }[data.state.kind] || 'See the event details for participation information.', Boolean(userInitiated));
        const refresh = button(document, 'Refresh registration details');
        refresh.addEventListener('click', load);
        ui.body.append(refresh);
      } else if (data.state.kind === 'external') {
        const url = new URL(data.url);
        ui.body.append(link(document, `Register with ${url.hostname}`, data.url));
        ui.tell('Registration is handled directly by the event provider.');
      } else if (data.state.kind === 'rsvp') drawRsvp(data);
      else if (data.state.kind === 'tickets') drawTickets(data);
      else ui.tell(data.state.message);
      if (!readOnly && ['rsvp', 'tickets'].includes(data.state.kind)) {
        const refresh = button(document, 'Refresh registration details');
        refresh.addEventListener('click', load);
        ui.body.append(refresh);
      }
    }, { focus: Boolean(userInitiated), retry: () => load(true) });
    if (userInitiated) ui.status.focus();
  }
  return load();
}
function confirmationPanel(document, slot, api) {
  const ui = panel(document, slot, 'Checkout confirmation');
  async function load(userInitiated = false) {
    await ui.perform('Checking the status of your checkout…', async () => {
      let result;
      try { result = await api.confirmation(); } catch { result = { verified: false }; }
      ui.tell(result.verified
        ? result.type === 'tickets' ? 'Your ticket reservation is confirmed. Check your confirmation email for your tickets and receipt.'
          : 'Your checkout is confirmed. Check your confirmation email for the receipt and next steps.'
        : NEUTRAL_CONFIRMATION);
      ui.body.replaceChildren();
      const again = button(document, 'Check status again');
      again.addEventListener('click', load);
      const actions = element(document, 'div', null, 'transaction-actions');
      actions.append(again, link(document, 'View cart', new URL('cart/', api.config.baseUrl).href));
      ui.body.append(actions);
    }, { focus: Boolean(userInitiated), retry: () => load(true) });
    if (userInitiated) ui.status.focus();
  }
  return load();
}

/** Additive enhancement; optional dependencies are for isolated, no-network tests. */
export async function initializeTransactions(config, document = globalThis.document, dependencies = {}) {
  if (!document) return [];
  const slots = [...document.querySelectorAll('[data-wix-product-id],[data-wix-event-id],[data-wix-cart],[data-wix-confirmation]')];
  if (!slots.length) return [];
  let api;
  let readOnly;
  try {
    const publicConfig = validateConfig(config);
    readOnly = publicConfig.readOnly;
    api = dependencies.api || createVisitorApi(publicConfig, { frontendOrigin: document.location?.origin });
  } catch {
    for (const slot of slots) {
      if (mounted.has(slot)) continue;
      mounted.add(slot);
      const ui = panel(document, slot, 'Online services');
      ui.tell(slot.hasAttribute('data-wix-confirmation')
        ? `Online status checking is temporarily unavailable. ${NEUTRAL_CONFIRMATION}`
        : 'Online registration and shopping are temporarily unavailable. Please try again later.');
      const retry = button(document, 'Reload this page');
      retry.addEventListener('click', () => document.defaultView?.location.reload());
      ui.body.append(retry);
    }
    return [];
  }
  const navigate = dependencies.navigate || (url => document.defaultView.location.assign(url));
  return Promise.all(slots.map(slot => {
    if (mounted.has(slot)) return undefined;
    mounted.add(slot);
    if (slot.hasAttribute('data-wix-product-id')) return productPanel(document, slot, api, readOnly);
    if (slot.hasAttribute('data-wix-event-id')) return eventPanel(document, slot, api, navigate, readOnly);
    if (readOnly) {
      panel(document, slot, 'Online information').tell('Online ordering is not enabled on this page.');
      return undefined;
    }
    if (slot.hasAttribute('data-wix-cart')) return cartPanel(document, slot, api, navigate);
    return confirmationPanel(document, slot, api);
  }));
}

/** A fixture can opt out of auto-start before importing this module, then inject
 * its own API through initializeTransactions. This flag never enables services. */
export function bootstrapTransactions(document = globalThis.document) {
  if (!document) return Promise.resolve([]);
  const configElement = document.getElementById('wix-client-config');
  if (configElement?.hasAttribute('data-wix-manual-init')) return Promise.resolve([]);
  let config;
  try { config = JSON.parse(configElement?.textContent || 'null'); } catch { /* visible unavailable state */ }
  return initializeTransactions(config, document);
}

if (typeof document !== 'undefined') {
  const bootstrap = () => { void bootstrapTransactions(document); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
}
