import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createVisitorApi, productSelection, eventState, rsvpFormResponse, rsvpV2Request, ticketSelections,
  validateConfig, callbackUrls, validateRedirect, validateExternalUrl, STORES_APP_ID, money,
} from '../src/wix-visitor-api.mjs';
import { initializeTransactions, bootstrapTransactions } from '../src/wix-transactions.mjs';

const id = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const config = { clientId: id(1), siteId: id(2), baseUrl: 'https://montlake-pta.github.io/website/' };
const product = () => ({
  _id: id(3), name: 'School shirt', visible: true, manageVariants: false,
  stock: { inventoryStatus: 'IN_STOCK', trackInventory: true, quantity: 4 },
  priceData: { currency: 'USD', price: 20, discountedPrice: 15 },
});
const event = (type = 'RSVP') => ({
  _id: id(4), title: 'School gathering', slug: 'school-gathering', status: 'UPCOMING',
  dateAndTimeSettings: { startDate: new Date('2099-01-01T00:00:00Z') },
  registration: { type, initialType: type, status: type === 'TICKETING' ? 'OPEN_TICKETS' : `OPEN_${type}`,
    allowedGuestTypes: 'VISITOR_OR_MEMBER', rsvp: { responseType: 'YES_ONLY' }, tickets: { ticketLimitPerOrder: 5 } },
});
const form = () => ({ controls: [
  { type: 'NAME', system: true, orderIndex: 0, inputs: [
    { name: 'firstName', label: 'First name', mandatory: true, type: 'TEXT', maxLength: 50 },
    { name: 'lastName', label: 'Last name', mandatory: true, type: 'TEXT', maxLength: 50 },
  ] },
  { type: 'INPUT', system: true, orderIndex: 1, inputs: [{ name: 'email', label: 'Email', mandatory: true, type: 'TEXT' }] },
  { type: 'DROPDOWN', orderIndex: 2, inputs: [{ name: 'meal', label: 'Meal', mandatory: true, options: ['Vegetarian', 'Standard'] }] },
  { type: 'CHECKBOX', orderIndex: 3, inputs: [{ name: 'activities', label: 'Activities', type: 'TEXT_ARRAY', maxSize: 2, options: ['Art', 'Music'] }] },
] });
const answers = () => ({ firstName: 'Test', lastName: 'Guest', email: 'guest@example.test', meal: 'Vegetarian', activities: ['Art'] });
const ticket = () => ({ _id: id(5), eventId: id(4), name: 'Admission', saleStatus: 'SALE_STARTED', limitPerCheckout: 3, price: { amount: '10', currency: 'USD' } });
const cart = () => ({ _id: id(6), currency: 'USD', lineItems: [
  { _id: id(7), quantity: 1, productName: { original: 'School shirt' }, price: { amount: '15' }, availability: { status: 'AVAILABLE' } },
] });
function memoryStorage() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, val) => data.set(key, val) };
}
function fakeClient() {
  const calls = [];
  let tokens = { accessToken: {}, refreshToken: {} };
  const wrap = (name, fn) => async (...args) => { calls.push([name, ...args]); return typeof fn === 'function' ? fn(...args) : structuredClone(fn); };
  const client = {
    auth: {
      getTokens: () => tokens,
      setTokens: value => { tokens = value; },
      generateVisitorTokens: wrap('tokens', old => old?.refreshToken?.value ? old : ({
        accessToken: { value: 'test-access', expiresAt: 9999999999 }, refreshToken: { value: 'test-refresh', role: 'visitor' },
      })),
    },
    products: {
      getProduct: wrap('getProduct', () => ({ product: product() })),
      queryProductVariants: wrap('variants', { variants: [], totalResults: 0 }),
      getProductOptionsAvailability: wrap('availability', { availableForPurchase: true }),
    },
    currentCart: {
      getCurrentCart: wrap('cart', cart),
      addToCurrentCart: wrap('add', () => ({ cart: cart() })),
      updateCurrentCartLineItemQuantity: wrap('quantity', () => ({ cart: cart() })),
      removeLineItemsFromCurrentCart: wrap('remove', { cart: { lineItems: [] } }),
      createCheckoutFromCurrentCart: wrap('checkout', { checkoutId: id(8) }),
    },
    checkout: { getCheckout: wrap('getCheckout', { _id: id(8), completed: false }) },
    wixEventsV2: { getEvent: wrap('event', () => ({ ...event(), form: form() })) },
    forms: { getForm: wrap('form', form) },
    policies: { queryPolicies: () => ({
      eq(key, value) { calls.push(['policyFilter', key, value]); return this; },
      limit(value) { calls.push(['policyLimit', value]); return this; },
      find: wrap('policies', () => ({ items: [], hasNext: () => false })),
    }) },
    rsvpV2: { createRsvp: wrap('rsvp', { _id: id(9), eventId: id(4), status: 'YES' }) },
    orders: { listAvailableTickets: wrap('tickets', () => ({ definitions: [ticket()], metaData: { total: 1 } })) },
    ticketReservations: {
      createTicketReservation: wrap('reserve', { _id: id(10), status: 'PENDING' }),
      getTicketReservation: wrap('getReservation', { _id: id(10), status: 'PENDING' }),
    },
    redirects: { createRedirectSession: wrap('redirect', { redirectSession: { fullUrl: 'https://checkout.wix.com/checkout/session' } }) },
  };
  return { client, calls, wrap };
}
function setup() {
  const fixture = fakeClient();
  const storage = memoryStorage();
  return { ...fixture, storage, api: createVisitorApi(config, { client: fixture.client, storage }) };
}
function rejectCode(code) { return error => error.code === code; }

test('validates public config and derives nested callbacks without reading query strings', () => {
  assert.equal(validateConfig({ ...config, baseUrl: config.baseUrl.slice(0, -1) }).baseUrl, config.baseUrl);
  assert.deepEqual(callbackUrls(config), {
    thankYouPageUrl: `${config.baseUrl}checkout/complete/`, postFlowUrl: `${config.baseUrl}cart/`, cartPageUrl: `${config.baseUrl}cart/`,
  });
  for (const baseUrl of ['http://example.test/', 'https://user:password@example.test/', `${config.baseUrl}?next=evil`]) {
    assert.throws(() => validateConfig({ ...config, baseUrl }), rejectCode('CONFIG'));
  }
  assert.throws(() => validateConfig({ ...config, clientId: 'not-a-client' }));
  assert.deepEqual(Object.keys(validateConfig({ ...config, apiKey: 'must-not-be-forwarded' })).sort(), ['baseUrl', 'clientId', 'siteId']);
});
test('the final frontend domain is valid for callbacks but never for hosted checkout destinations', () => {
  for (const baseUrl of ['https://www.montlakepta.org/', 'https://montlakepta.org/', 'https://www.montlakepta.org/preview/website/']) {
    const finalConfig = { ...config, baseUrl };
    assert.equal(validateConfig(finalConfig).baseUrl, baseUrl);
    assert.deepEqual(callbackUrls(finalConfig), {
      thankYouPageUrl: `${baseUrl}checkout/complete/`, postFlowUrl: `${baseUrl}cart/`, cartPageUrl: `${baseUrl}cart/`,
    });
    assert.equal(validateRedirect('https://checkout.wix.com/checkout/session', finalConfig), 'https://checkout.wix.com/checkout/session');
    for (const destination of ['https://www.montlakepta.org/checkout/', 'https://montlakepta.org/checkout/']) {
      assert.throws(() => validateRedirect(destination, finalConfig), rejectCode('LEGACY_CHECKOUT_DOMAIN'));
    }
  }
});
test('only official HTTPS hosted checkout destinations are accepted', () => {
  for (const url of ['https://checkout.wix.com/checkout', 'https://pta.wixsite.com/site/checkout', 'https://www.wix.com/checkout']) {
    assert.equal(validateRedirect(url, config), url);
  }
  for (const url of ['http://checkout.wix.com/', 'javascript:alert(1)', '//checkout.wix.com/', 'https://checkout.wix.com.evil.test/',
    'https://checkout.wix.com@evil.test/', 'https://evil.test/', 'https://checkout.wix.com:8443/']) {
    assert.throws(() => validateRedirect(url, config), rejectCode('UNSAFE_REDIRECT'));
  }
  for (const url of ['https://www.montlakepta.org/checkout', 'https://montlakepta.org/checkout', `${config.baseUrl}checkout`]) {
    assert.throws(() => validateRedirect(url, config), rejectCode('LEGACY_CHECKOUT_DOMAIN'));
  }
  assert.throws(() => validateRedirect('https://pta.wixsite.com/checkout', config, 'https://pta.wixsite.com'), rejectCode('LEGACY_CHECKOUT_DOMAIN'));
});
test('external registration uses the direct validated provider URL', async () => {
  const { api, client, wrap } = setup();
  client.wixEventsV2.getEvent = wrap('event', { ...event('EXTERNAL'), registration: {
    ...event('EXTERNAL').registration, external: { url: 'https://fevo-enterprise.com/event/Montlake' },
  } });
  assert.equal((await api.event(id(4))).url, 'https://fevo-enterprise.com/event/Montlake');
  for (const url of ['javascript:alert(1)', 'https://www.montlakepta.org/events-1/event', `${config.baseUrl}events/x/`, 'https://127.0.0.1/']) {
    assert.throws(() => validateExternalUrl(url, config));
  }
});
test('product stock, required choices, quantity, variant and personalization are enforced', () => {
  const item = product();
  assert.equal(productSelection(item).lineItem.catalogReference.appId, STORES_APP_ID);
  for (const count of [0, -1, 1.5, '', 5, NaN]) assert.throws(() => productSelection(item, {}, {}, count));
  assert.throws(() => productSelection({ ...item, stock: undefined }), rejectCode('OUT_OF_STOCK'));
  assert.throws(() => productSelection({ ...item, stock: { inventoryStatus: 'OUT_OF_STOCK', inStock: true } }), rejectCode('OUT_OF_STOCK'));
  item.productOptions = [{ name: 'Color', choices: [{ value: '#0000ff', description: 'Blue' }, { description: 'Red', inStock: false }] }];
  item.customTextFields = [{ title: 'Name on shirt', mandatory: true, maxLength: 15 }];
  assert.throws(() => productSelection(item));
  assert.throws(() => productSelection(item, { Color: 'Blue' }));
  assert.throws(() => productSelection(item, { Color: 'Red' }, { 'Name on shirt': 'Test' }));
  const selected = productSelection(item, { Color: 'Blue' }, { 'Name on shirt': 'Test' }, 2);
  assert.deepEqual(selected.lineItem.catalogReference.options, { options: { Color: 'Blue' }, customTextFields: { 'Name on shirt': 'Test' } });
  item.manageVariants = true;
  item.variants = [{ _id: id(11), choices: { Color: 'Blue' }, stock: { trackQuantity: true, quantity: 2 }, variant: { visible: true, priceData: { price: 25, currency: 'USD' } } }];
  assert.equal(productSelection(item, { Color: 'Blue' }, { 'Name on shirt': 'Test' }).lineItem.catalogReference.options.variantId, id(11));
  assert.throws(() => productSelection(item, { Color: 'Blue' }, { 'Name on shirt': 'Test' }, 3));
});
test('adding a product re-reads live inventory and sends only official catalog reference', async () => {
  const { api, calls, client, wrap } = setup();
  await api.addProduct(id(3), {}, {}, 2);
  assert.deepEqual(calls.find(c => c[0] === 'add'), ['add', { lineItems: [
    { quantity: 2, catalogReference: { catalogItemId: id(3), appId: STORES_APP_ID } },
  ] }]);
  client.products.getProduct = wrap('getProduct', { product: { ...product(), stock: { inventoryStatus: 'OUT_OF_STOCK' } } });
  await assert.rejects(api.addProduct(id(3), {}, {}, 1), rejectCode('OUT_OF_STOCK'));
  assert.equal(calls.filter(c => c[0] === 'add').length, 1);
});
test('duplicate product titles do not change catalog identity', async () => {
  const { api, calls, client, wrap } = setup();
  client.products.getProduct = wrap('getProduct', requested => ({ product: { ...product(), _id: requested, name: 'Same title' } }));
  await api.addProduct(id(3), {}, {}, 1);
  await api.addProduct(id(30), {}, {}, 1);
  assert.deepEqual(calls.filter(c => c[0] === 'add').map(c => c[1].lineItems[0].catalogReference.catalogItemId), [id(3), id(30)]);
});
test('managed variants are paginated; option availability is checked before adding', async () => {
  const { api, calls, client, wrap } = setup();
  const item = { ...product(), manageVariants: true, productOptions: [{ name: 'Size', choices: [{ description: 'M' }] }] };
  client.products.getProduct = wrap('getProduct', { product: item });
  client.products.queryProductVariants = wrap('variants', (_id, { paging }) => ({
    variants: paging.offset === 0 ? Array.from({ length: 100 }, (_, n) => ({ _id: id(n + 100), choices: { Size: 'L' } }))
      : [{ _id: id(12), choices: { Size: 'M' }, stock: { inStock: true }, variant: { visible: true } }],
    totalResults: 101,
  }));
  await api.addProduct(id(3), { Size: 'M' }, {}, 1);
  assert.deepEqual(calls.filter(c => c[0] === 'variants').map(c => c[2].paging.offset), [0, 100]);
  assert.deepEqual(calls.find(c => c[0] === 'availability'), ['availability', id(3), { Size: 'M' }]);
  assert.equal(calls.find(c => c[0] === 'add')[1].lineItems[0].catalogReference.options.variantId, id(12));
});
test('cart updates/removals use visitor current-cart operations and preserve returned quantities', async () => {
  const { api, calls, client, wrap } = setup();
  client.currentCart.updateCurrentCartLineItemQuantity = wrap('quantity', { cart: { ...cart(), lineItems: [{ ...cart().lineItems[0], quantity: 2 }] } });
  assert.equal((await api.updateQuantity(id(7), 3)).lineItems[0].quantity, 2);
  assert.deepEqual(calls.find(c => c[0] === 'quantity'), ['quantity', [{ _id: id(7), quantity: 3 }]]);
  assert.deepEqual((await api.removeItem(id(7))).lineItems, []);
  assert.deepEqual(calls.find(c => c[0] === 'remove'), ['remove', [id(7)]]);
});
test('only a known missing visitor cart becomes an empty cart; authorization failures remain errors', async () => {
  const { api, client } = setup();
  client.currentCart.getCurrentCart = async () => { throw { details: { applicationError: { code: 'OWNED_CART_NOT_FOUND' } } }; };
  assert.deepEqual((await api.cart()).lineItems, []);
  client.currentCart.getCurrentCart = async () => { throw { status: 403, message: 'private SDK error' }; };
  await assert.rejects(api.cart(), error => error.code === 'PERMISSION_DENIED' && !error.message.includes('private'));
  client.currentCart.getCurrentCart = async () => { throw { status: 404 }; };
  await assert.rejects(api.cart(), rejectCode('REQUEST_FAILED'));
});
test('checkout uses current cart, WEB sales channel, generic hosted pages and new-site callbacks', async () => {
  const { api, calls } = setup();
  assert.equal(await api.checkout(), 'https://checkout.wix.com/checkout/session');
  assert.deepEqual(calls.find(c => c[0] === 'checkout'), ['checkout', { channelType: 'WEB' }]);
  assert.deepEqual(calls.find(c => c[0] === 'redirect')[1], {
    ecomCheckout: { checkoutId: id(8) }, callbacks: callbackUrls(config), preferences: { useGenericWixPages: true, maintainIdentity: true },
  });
});
test('checkout cannot proceed with empty or unavailable items or a legacy redirect', async () => {
  const { api, client, wrap } = setup();
  client.currentCart.getCurrentCart = wrap('cart', { lineItems: [] });
  await assert.rejects(api.checkout());
  client.currentCart.getCurrentCart = wrap('cart', { lineItems: [{ availability: { status: 'NOT_AVAILABLE' } }] });
  await assert.rejects(api.checkout(), rejectCode('OUT_OF_STOCK'));
  client.currentCart.getCurrentCart = wrap('cart', cart);
  client.redirects.createRedirectSession = wrap('redirect', { redirectSession: { fullUrl: 'https://www.montlakepta.org/checkout' } });
  await assert.rejects(api.checkout(), rejectCode('LEGACY_CHECKOUT_DOMAIN'));
});
test('past, canceled, draft, disabled, member-only and scheduled events are non-actionable', () => {
  assert.equal(eventState(event()).kind, 'rsvp');
  for (const status of ['ENDED', 'CANCELED', 'DRAFT']) assert.equal(eventState({ ...event(), status }).kind, 'closed');
  assert.equal(eventState({ ...event(), dateAndTimeSettings: { startDate: new Date('2000-01-01') } }).kind, 'closed');
  for (const patch of [{ registrationDisabled: true }, { registrationPaused: true }, { allowedGuestTypes: 'MEMBER' }, { status: 'SCHEDULED_RSVP' }, { status: 'CLOSED_AUTOMATICALLY' }]) {
    assert.equal(eventState({ ...event(), registration: { ...event().registration, ...patch } }).kind, 'closed');
  }
  assert.equal(eventState({ ...event(), registration: { type: 'NONE' } }).kind, 'none');
  assert.equal(eventState({ ...event(), registration: { ...event().registration, status: 'OPEN_RSVP_WAITLIST_ONLY' } }).status, 'WAITING');
});
test('event GET uses installed readonly fields options; form fallback and policies use live APIs', async () => {
  const { api, client, calls, wrap } = setup();
  client.wixEventsV2.getEvent = wrap('event', () => event());
  const result = await api.event(id(4));
  assert.equal(result.form.controls.length, 4);
  assert.deepEqual(calls.find(c => c[0] === 'event'), ['event', id(4), { fields: ['REGISTRATION', 'FORM'] }]);
  assert.deepEqual(calls.find(c => c[0] === 'form'), ['form', id(4)]);
  assert.ok(calls.some(c => c[0] === 'policyFilter' && c[1] === 'eventId' && c[2] === id(4)));
});
test('RSVP fields retain required custom choices and reject invalid/missing fields', () => {
  const valid = rsvpFormResponse(form(), answers());
  assert.deepEqual(valid.inputValues.find(v => v.inputName === 'activities'), { inputName: 'activities', values: ['Art'] });
  for (const patch of [{ meal: 'Invented' }, { firstName: '' }, { email: 'invalid' }, { activities: ['Not an option'] }]) {
    assert.throws(() => rsvpFormResponse(form(), { ...answers(), ...patch }));
  }
  assert.throws(() => rsvpFormResponse({ controls: [] }, answers()), rejectCode('FORM_UNAVAILABLE'));
  assert.throws(() => rsvpFormResponse({ controls: [{ inputs: [{ name: 'address', type: 'ADDRESS' }] }] }, {}), rejectCode('UNSUPPORTED_FORM'));
});
test('guest count/name fields and policy consent are not silently dropped', async () => {
  const extra = { type: 'GUEST_CONTROL', inputs: [
    { name: 'count', label: 'Additional guests', type: 'NUMBER' },
    { name: 'names', label: 'Guest names', type: 'TEXT_ARRAY', mandatory: true, maxSize: 2 },
  ] };
  assert.throws(() => rsvpFormResponse({ controls: [...form().controls, extra] }, { ...answers(), count: 2, names: ['One'] }));
  assert.equal(rsvpFormResponse({ controls: [...form().controls, extra] }, { ...answers(), count: 2, names: ['One', 'Two'] }).inputValues.find(v => v.inputName === 'count').value, '2');
  assert.doesNotThrow(() => rsvpFormResponse({ controls: [...form().controls, extra] }, { ...answers(), count: 0, names: [] }));
  const { api, client, calls } = setup();
  client.policies.queryPolicies = () => ({ eq() { return this; }, limit() { return this; }, async find() { return { items: [{ _id: id(15), name: 'Policy' }], hasNext: () => false }; } });
  await assert.rejects(api.submitRsvp(id(4), answers(), []));
  assert.equal(calls.filter(c => c[0] === 'rsvp').length, 0);
  await api.submitRsvp(id(4), answers(), [id(15)]);
  assert.equal(calls.filter(c => c[0] === 'rsvp').length, 1);
});
test('v2 identity comes from matching system inputs, not labels, ordering or arbitrary answers', () => {
  const metadata = form();
  metadata.controls[0].inputs.reverse();
  metadata.controls[0].inputs.forEach(input => { input.label = 'Localized label'; });
  const request = rsvpV2Request(id(4), metadata, { ...answers(), firstName: '  Alex  ', lastName: ' Rivera ' }, 'YES');
  assert.equal(request.firstName, 'Alex');
  assert.equal(request.lastName, 'Rivera');
  for (const key of ['firstName', 'lastName', 'email']) {
    assert.equal(request[key], request.form.inputValues.find(value => value.inputName === key).value);
  }
  assert.equal('additionalGuestDetails' in request, false);
  const customNames = form();
  customNames.controls[0].system = false;
  assert.throws(() => rsvpV2Request(id(4), customNames, answers(), 'YES'), rejectCode('UNSUPPORTED_IDENTITY_FIELDS'));
  const unrecognized = form();
  unrecognized.controls[0].inputs[0].name = 'unrecognizedInput';
  assert.throws(() => rsvpV2Request(id(4), unrecognized, { ...answers(), unrecognizedInput: 'Alex' }, 'YES'),
    rejectCode('UNSUPPORTED_IDENTITY_FIELDS'));
  for (const patch of [{ firstName: '' }, { lastName: 'x'.repeat(51) }, { email: 'invalid' }]) {
    assert.throws(() => rsvpV2Request(id(4), metadata, { ...answers(), ...patch }, 'YES'));
  }
});
test('v2 additional guests match typed form inputs and never invent guest names', async () => {
  const guestControl = { type: 'GUEST_CONTROL', inputs: [
    { name: 'partyCount', label: 'Extra people', type: 'NUMBER' },
    { name: 'partyNames', label: 'Names', type: 'TEXT_ARRAY', mandatory: true, maxSize: 3 },
  ] };
  const metadata = { controls: [...form().controls, guestControl] };
  const submitted = { ...answers(), partyCount: '2', partyNames: [' Jordan Lee ', 'Sam Rivera'] };
  const request = rsvpV2Request(id(4), metadata, submitted, 'WAITING');
  assert.deepEqual(request.additionalGuestDetails, { guestCount: 2, guestNames: ['Jordan Lee', 'Sam Rivera'] });
  assert.equal(request.status, 'WAITLIST');
  assert.deepEqual(request.form.inputValues.find(value => value.inputName === 'partyNames').values,
    request.additionalGuestDetails.guestNames);
  assert.deepEqual(rsvpV2Request(id(4), metadata, { ...answers(), partyCount: 0, partyNames: [] }, 'YES')
    .additionalGuestDetails, { guestCount: 0 });
  for (const patch of [{ partyCount: 11 }, { partyCount: 1 }, { partyNames: [] }, { partyNames: ['Name', 'x'.repeat(102)] }]) {
    assert.throws(() => rsvpV2Request(id(4), metadata, { ...submitted, ...patch }, 'YES'));
  }
  const countOnly = { controls: [...form().controls, { ...guestControl, inputs: [guestControl.inputs[0]] }] };
  assert.deepEqual(rsvpV2Request(id(4), countOnly, { ...answers(), partyCount: 2 }, 'YES').additionalGuestDetails, { guestCount: 2 });
  assert.equal('additionalGuestDetails' in rsvpV2Request(id(4), form(), submitted, 'YES'), false);
  const { api, client, wrap, calls } = setup();
  client.wixEventsV2.getEvent = wrap('event', { ...event(), form: metadata });
  await api.submitRsvp(id(4), submitted);
  assert.deepEqual(calls.find(c => c[0] === 'rsvp')[1].additionalGuestDetails,
    { guestCount: 2, guestNames: ['Jordan Lee', 'Sam Rivera'] });
});
test('the read-only Welcome Back form metadata maps mandatory guest count and optional names to v2', async () => {
  // Public schema from the authenticated read-only probe. Submitted identities,
  // responses, and every SDK operation in this test are synthetic mocks.
  const eventId = '91563613-7f0e-4dd3-a491-4d8d028b2e32';
  const metadata = { controls: [
    { type: 'NAME', inputs: [
      { name: 'firstName', type: 'TEXT', mandatory: true },
      { name: 'lastName', type: 'TEXT', mandatory: true },
    ] },
    { type: 'INPUT', inputs: [{ name: 'email', type: 'TEXT', mandatory: true }] },
    { type: 'GUEST_CONTROL', inputs: [
      { name: 'additionalGuests', type: 'NUMBER', mandatory: true },
      { name: 'guestNames', type: 'TEXT_ARRAY', mandatory: false, array: true },
    ] },
  ] };
  const submitted = { firstName: 'Test', lastName: 'Guest', email: 'guest@example.test', additionalGuests: '2', guestNames: [] };
  const request = rsvpV2Request(eventId, metadata, submitted, 'YES');
  assert.deepEqual(request.additionalGuestDetails, { guestCount: 2 });
  assert.deepEqual(request.form.inputValues, [
    { inputName: 'firstName', value: 'Test' },
    { inputName: 'lastName', value: 'Guest' },
    { inputName: 'email', value: 'guest@example.test' },
    { inputName: 'additionalGuests', value: '2' },
    { inputName: 'guestNames', values: [] },
  ]);
  assert.deepEqual(rsvpV2Request(eventId, metadata, { ...submitted, additionalGuests: '0' }, 'YES')
    .additionalGuestDetails, { guestCount: 0 });
  assert.deepEqual(rsvpV2Request(eventId, metadata, { ...submitted, guestNames: ['Jordan Lee', 'Sam Rivera'] }, 'YES')
    .additionalGuestDetails, { guestCount: 2, guestNames: ['Jordan Lee', 'Sam Rivera'] });
  assert.throws(() => rsvpV2Request(eventId, metadata, { ...submitted, additionalGuests: '' }, 'YES'));
  const { api, client, wrap, calls } = setup();
  client.wixEventsV2.getEvent = wrap('event', { ...event(), _id: eventId, form: metadata });
  client.rsvpV2.createRsvp = wrap('rsvp', { _id: id(9), eventId, status: 'YES' });
  assert.equal((await api.event(eventId)).state.kind, 'rsvp');
  assert.deepEqual(await api.submitRsvp(eventId, submitted), { status: 'YES' });
  assert.deepEqual(calls.find(call => call[0] === 'rsvp'), ['rsvp', request]);
});
test('v2 NO responses are sent only when exposed by live registration settings', async () => {
  const { api, client, wrap, calls } = setup();
  client.wixEventsV2.getEvent = wrap('event', { ...event(), form: form(), registration: {
    ...event().registration, rsvp: { responseType: 'YES_AND_NO' },
  } });
  client.rsvpV2.createRsvp = wrap('rsvp', { _id: id(9), eventId: id(4), status: 'NO' });
  assert.deepEqual(await api.submitRsvp(id(4), answers(), [], 'NO'), { status: 'NO' });
  assert.equal(calls.find(c => c[0] === 'rsvp')[1].status, 'NO');
  client.wixEventsV2.getEvent = wrap('event', { ...event(), form: form() });
  await assert.rejects(api.submitRsvp(id(4), answers(), [], 'NO'));
  assert.equal(calls.filter(c => c[0] === 'rsvp').length, 1, 'Never silently turn a declined response into attendance');
});
test('visitor RSVP uses explicit v2 identity fields and direct SDK response without privileged bypass', async () => {
  const { api, client, calls, wrap } = setup();
  assert.deepEqual(await api.submitRsvp(id(4), answers()), { status: 'YES' });
  const request = calls.find(c => c[0] === 'rsvp')[1];
  assert.deepEqual(Object.keys(request).sort(), ['email', 'eventId', 'firstName', 'form', 'lastName', 'status']);
  assert.equal(calls.find(c => c[0] === 'rsvp').length, 2, 'No optional bypass arguments are passed');
  assert.equal(request.firstName, answers().firstName);
  assert.equal(request.lastName, answers().lastName);
  assert.equal(request.email, answers().email);
  assert.deepEqual(request.form, rsvpFormResponse(form(), answers()));
  assert.equal(request.status, 'YES');
  assert.equal(request.eventId, id(4));
  client.rsvpV2.createRsvp = wrap('rsvp', {});
  await assert.rejects(api.submitRsvp(id(4), answers()), rejectCode('UNCONFIRMED'));
  client.rsvpV2.createRsvp = wrap('rsvp', { rsvp: { _id: id(9), eventId: id(4), status: 'YES' } });
  await assert.rejects(api.submitRsvp(id(4), answers()), rejectCode('UNCONFIRMED'));
  client.rsvpV2.createRsvp = wrap('rsvp', { _id: id(9), eventId: id(99), status: 'YES' });
  await assert.rejects(api.submitRsvp(id(4), answers()), rejectCode('UNCONFIRMED'));
  client.rsvp = { createRsvp: () => assert.fail('Never fall back to v1') };
  client.rsvpV2.createRsvp = async () => { throw { status: 403, message: 'contact data must not be displayed' }; };
  await assert.rejects(api.submitRsvp(id(4), answers()), error => error.code === 'PERMISSION_DENIED' && !error.message.includes('contact'));
});
test('RSVP honors live closure and waitlist and never falls back to admin endpoints', async () => {
  const { api, client, calls, wrap } = setup();
  client.wixEventsV2.getEvent = wrap('event', { ...event(), status: 'ENDED' });
  await assert.rejects(api.submitRsvp(id(4), answers()), rejectCode('CLOSED'));
  assert.equal(calls.filter(c => c[0] === 'rsvp').length, 0);
  client.wixEventsV2.getEvent = wrap('event', { ...event(), form: form(), registration: { ...event().registration, status: 'OPEN_RSVP_WAITLIST_ONLY' } });
  client.rsvpV2.createRsvp = wrap('rsvp', { _id: id(9), eventId: id(4), status: 'WAITLIST' });
  assert.deepEqual(await api.submitRsvp(id(4), answers()), { status: 'WAITING' });
  assert.equal(calls.find(c => c[0] === 'rsvp')[1].status, 'WAITLIST');
  client.rsvpV2.createRsvp = wrap('rsvp', { _id: id(9), eventId: id(4), status: 'WAITING' });
  await assert.rejects(api.submitRsvp(id(4), answers()), rejectCode('UNCONFIRMED'));
});
test('ticket checkout creates a visitor reservation and lets hosted checkout collect guest/payment details', async () => {
  const { api, client, calls, wrap } = setup();
  client.wixEventsV2.getEvent = wrap('event', () => event('TICKETING'));
  await api.reserveTickets(id(4), [{ ticketDefinitionId: id(5), quantity: 2 }]);
  assert.deepEqual(calls.find(c => c[0] === 'reserve'), ['reserve', { tickets: [{ ticketDefinitionId: id(5), quantity: 2 }] }]);
  assert.deepEqual(calls.find(c => c[0] === 'redirect')[1].eventsCheckout, { eventSlug: 'school-gathering', reservationId: id(10) });
  assert.deepEqual(calls.find(c => c[0] === 'tickets'), ['tickets', { eventId: id(4), limit: 100, offset: 0 }]);
});
test('ticket counts, pricing options, donation minima, empty inventories and invalid slugs fail safely', async () => {
  assert.throws(() => ticketSelections(event('TICKETING'), [], [{ ticketDefinitionId: id(5), quantity: 1 }]));
  assert.throws(() => ticketSelections(event('TICKETING'), [ticket()], [{ ticketDefinitionId: id(5), quantity: 4 }]));
  const priced = { ...ticket(), pricing: { pricingOptions: { options: [{ _id: id(20), price: { amount: '5', currency: 'USD' } }] } } };
  assert.throws(() => ticketSelections(event('TICKETING'), [priced], [{ ticketDefinitionId: id(5), quantity: 1 }]));
  assert.equal(ticketSelections(event('TICKETING'), [priced], [{ ticketDefinitionId: id(5), quantity: 1, pricingOptionId: id(20) }])[0].ticketInfo.pricingOptionId, id(20));
  const donation = { ...ticket(), pricing: { pricingType: 'DONATION', minPrice: { amount: '10', currency: 'USD' } } };
  assert.throws(() => ticketSelections(event('TICKETING'), [donation], [{ ticketDefinitionId: id(5), quantity: 1, guestPrice: '1' }]));
  const { api, client, wrap, calls } = setup();
  client.wixEventsV2.getEvent = wrap('event', { ...event('TICKETING'), slug: '../old-page' });
  await assert.rejects(api.reserveTickets(id(4), [{ ticketDefinitionId: id(5), quantity: 1 }]), rejectCode('INVALID_SLUG'));
  assert.equal(calls.filter(c => c[0] === 'reserve').length, 0);
});
test('session generation is shared and cart data is never stored with guest tokens', async () => {
  const { api, calls, storage } = setup();
  await Promise.all([api.cart(), api.cart(), api.product(id(3))]);
  assert.equal(calls.filter(c => c[0] === 'tokens').length, 1);
  assert.equal(storage.data.size, 1);
  const saved = JSON.parse([...storage.data.values()][0]);
  assert.deepEqual(Object.keys(saved).sort(), ['accessToken', 'refreshToken']);
  assert.equal(saved.refreshToken.role, 'visitor');
  assert.equal(api.persistentSession, true);
  const reloaded = fakeClient();
  const nextPage = createVisitorApi(config, { client: reloaded.client, storage });
  await nextPage.cart();
  assert.deepEqual(reloaded.calls.find(c => c[0] === 'tokens')[1], saved);
  const { client } = fakeClient();
  const noStorage = createVisitorApi(config, { client, storage: { getItem() { throw Error(); }, setItem() { throw Error(); } } });
  await noStorage.cart();
  assert.equal(noStorage.persistentSession, false);
});
test('checkout confirmation never trusts query params, an order id, or an incomplete checkout', async () => {
  const { api, calls, client, wrap } = setup();
  assert.deepEqual(await api.confirmation('?payment=success&orderId=forged'), { verified: false });
  assert.equal(calls.filter(c => c[0] === 'getCheckout').length, 0);
  await api.checkout();
  assert.equal((await api.confirmation()).verified, false);
  client.checkout.getCheckout = wrap('getCheckout', { _id: id(8), completed: true });
  assert.equal((await api.confirmation()).verified, true);
  client.checkout.getCheckout = wrap('getCheckout', { _id: id(99), completed: true });
  assert.equal((await api.confirmation()).verified, false);
});
test('confirmation requires a confirmed reservation, not merely a pending ticket hold', async () => {
  const { api, client, wrap } = setup();
  client.wixEventsV2.getEvent = wrap('event', () => event('TICKETING'));
  await api.reserveTickets(id(4), [{ ticketDefinitionId: id(5), quantity: 1 }]);
  assert.equal((await api.confirmation()).verified, false);
  client.ticketReservations.getTicketReservation = wrap('getReservation', { _id: id(10), status: 'CONFIRMED' });
  assert.equal((await api.confirmation()).verified, true);
});
test('money comes from real currency and values, never a fabricated zero', () => {
  assert.equal(money(undefined, 'USD'), 'Price unavailable');
  assert.equal(money('15', undefined), 'Price unavailable');
  assert.equal(money({ amount: '0' }, 'USD'), '$0.00');
  assert.equal(money({ value: '12.50' }, 'USD'), '$12.50');
});
test('browser entry imports on Node and source avoids HTML injection or private logging', async () => {
  assert.deepEqual(await initializeTransactions(config, undefined), []);
  for (const file of ['src/wix-visitor-api.mjs', 'src/wix-transactions.mjs']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\.innerHTML\s*=|insertAdjacentHTML|console\.(log|error|warn)|WIX_API_KEY/);
  }
});

// Small inert DOM for controller state/keyboard tests. No browser, user profile,
// remote resources, or real Wix traffic is involved.
class TestNode {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.children = [];
    this.attributes = new Map(); this.listeners = new Map(); this.disabled = false;
    this.value = ''; this.checked = false; this._text = '';
  }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children.forEach(n => { n.parentNode = null; }); this.children = []; this._text = ''; this.append(...nodes); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(' '); }
  setAttribute(key, val) { this.attributes.set(key, String(val)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  hasAttribute(key) { return this.attributes.has(key); }
  addEventListener(name, fn) { const listeners = this.listeners.get(name) || []; listeners.push(fn); this.listeners.set(name, listeners); }
  get isConnected() { return this === this.ownerDocument || Boolean(this.parentNode?.isConnected); }
  get selectedOptions() { return this.children.filter(n => n.selected || (!this.multiple && n.value === this.value)); }
  focus() { this.ownerDocument.activeElement = this; }
  reportValidity() { return true; }
  async fire(type) {
    for (const fn of this.listeners.get(type) || []) await fn({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
  }
  querySelectorAll(selector) {
    const selectors = selector.split(',');
    const matches = node => selectors.some(s => s.startsWith('[')
      ? node.hasAttribute(s.slice(1, -1)) : node.tagName === s.toUpperCase());
    return this.children.flatMap(node => [...(matches(node) ? [node] : []), ...node.querySelectorAll(selector)]);
  }
}
class TestDocument extends TestNode {
  constructor(attribute) {
    super('document'); this.ownerDocument = this; this.location = { origin: 'https://montlake-pta.github.io' };
    this.defaultView = { location: { assign() {}, reload() {} } };
    this.slot = this.createElement('div'); this.slot.setAttribute(attribute, attribute.includes('-id') ? id(attribute.includes('product') ? 3 : 4) : '');
    this.slot.append(this.createTextNode('Server-rendered details remain readable.'));
    this.append(this.slot);
  }
  createElement(tag) { return new TestNode(tag, this); }
  createTextNode(text) { const node = new TestNode('#text', this); node.textContent = text; return node; }
  getElementById(id) { return this.querySelectorAll('script').find(node => node.id === id) || null; }
}
const buttons = document => document.querySelectorAll('button');
const namedButton = (document, label) => buttons(document).find(n => n.textContent === label);
const inputByLabel = (document, name) => {
  const label = document.querySelectorAll('label').find(n => n.textContent.startsWith(name));
  return document.querySelectorAll('input,select,textarea').find(n => n.id === label?.htmlFor);
};

test('missing or malformed public configuration does not initialize any visitor API', async () => {
  const invalidConfigs = [undefined, null, {}, { ...config, clientId: '' },
    { ...config, clientId: 'pending-owner-setup' }, { ...config, siteId: '' },
    { ...config, baseUrl: 'https://example.test/?clientId=pretend' }];
  for (const attribute of ['data-wix-product-id', 'data-wix-event-id', 'data-wix-cart']) {
    for (const invalid of invalidConfigs) {
      const document = new TestDocument(attribute);
      let accessed = 0;
      const dependencies = { get api() { accessed += 1; throw new Error('API must not be initialized'); } };
      await initializeTransactions(invalid, document, dependencies);
      assert.equal(accessed, 0);
      assert.match(document.textContent, /Server-rendered details remain readable/);
      assert.match(document.textContent, /temporarily unavailable/);
      assert.equal(document.querySelectorAll('form,input,select,textarea').length, 0);
      assert.equal(buttons(document).length, 1);
      assert.ok(namedButton(document, 'Reload this page'));
      await initializeTransactions(invalid, document, dependencies);
      assert.equal(document.querySelectorAll('h2').length, 1);
    }
  }
});
test('the missing-config recovery reloads the page without inventing a client or a redirect', async () => {
  const document = new TestDocument('data-wix-cart');
  let reloads = 0;
  document.defaultView.location.reload = () => { reloads += 1; };
  document.defaultView.location.assign = () => assert.fail('Missing config must not initiate a redirect');
  await initializeTransactions(null, document);
  await namedButton(document, 'Reload this page').fire('click');
  assert.equal(reloads, 1);
  assert.throws(() => createVisitorApi(null, {
    get client() { assert.fail('Invalid config must not construct an SDK client'); },
  }), rejectCode('CONFIG'));
});
test('missing configuration keeps payment confirmation neutral even with forged success parameters', async () => {
  const document = new TestDocument('data-wix-confirmation');
  document.location.search = '?payment=success&orderId=forged';
  await initializeTransactions(undefined, document);
  assert.match(document.textContent, /Online status checking is temporarily unavailable/);
  assert.match(document.textContent, /does not confirm a payment/);
  assert.match(document.textContent, /confirmation email and receipt/);
  assert.equal(document.querySelectorAll('form').length, 0);
});
test('manual bootstrap opt-out leaves fixture slots unmounted until explicit API injection', async () => {
  const document = new TestDocument('data-wix-cart');
  const script = document.createElement('script');
  script.id = 'wix-client-config';
  script.setAttribute('data-wix-manual-init', '');
  script.textContent = JSON.stringify(config);
  document.append(script);
  await bootstrapTransactions(document);
  assert.equal(document.querySelectorAll('h2').length, 0);
  const { api, calls } = setup();
  const destinations = [];
  await initializeTransactions(config, document, { api, navigate: url => destinations.push(url) });
  assert.match(document.textContent, /Cart items/);
  assert.equal(calls.filter(call => call[0] === 'cart').length, 1);
  await namedButton(document, 'Continue to secure checkout').fire('click');
  assert.deepEqual(destinations, ['https://checkout.wix.com/checkout/session']);
});
test('malformed bootstrap JSON produces the explicit unavailable state', async () => {
  const document = new TestDocument('data-wix-event-id');
  const script = document.createElement('script');
  script.id = 'wix-client-config';
  script.textContent = '{invalid-json';
  document.append(script);
  await bootstrapTransactions(document);
  assert.match(document.textContent, /temporarily unavailable/);
  assert.equal(document.querySelectorAll('form').length, 0);
});
test('product UI preserves static content and has a real non-actionable out-of-stock state', async () => {
  const document = new TestDocument('data-wix-product-id');
  const { api, client, wrap } = setup();
  client.products.getProduct = wrap('getProduct', { product: { ...product(), stock: { inventoryStatus: 'OUT_OF_STOCK' } } });
  await initializeTransactions(config, document, { api });
  assert.match(document.textContent, /Server-rendered details remain readable/);
  assert.match(document.textContent, /currently out of stock/);
  assert.equal(namedButton(document, 'Add to cart'), undefined);
  assert.ok(namedButton(document, 'Check availability again'));
  await namedButton(document, 'Check availability again').fire('click');
  assert.match(document.activeElement.textContent, /out of stock/);
  await initializeTransactions(config, document, { api });
  assert.equal(document.querySelectorAll('h2').length, 1, 'initialization is idempotent');
});
test('optioned UI labels required fields and prevents submission before a valid selection', async () => {
  const document = new TestDocument('data-wix-product-id');
  const { api, client, wrap } = setup();
  client.products.getProduct = wrap('getProduct', { product: { ...product(), productOptions: [{ name: 'Size', choices: [{ description: 'M' }] }] } });
  await initializeTransactions(config, document, { api });
  const add = namedButton(document, 'Add to cart');
  assert.equal(add.disabled, true);
  const size = inputByLabel(document, 'Size');
  assert.equal(size.required, true);
  size.value = 'M';
  await document.querySelectorAll('form')[0].fire('change');
  assert.equal(add.disabled, false);
});
test('cart UI disables controls during mutation, avoids duplicate submits and focuses confirmed status', async () => {
  const document = new TestDocument('data-wix-cart');
  const { api, client, calls } = setup();
  let finish;
  client.currentCart.updateCurrentCartLineItemQuantity = async (...args) => {
    calls.push(['quantity', ...args]);
    return new Promise(resolve => { finish = resolve; });
  };
  await initializeTransactions(config, document, { api });
  const formNode = document.querySelectorAll('form')[0];
  const update = namedButton(document, 'Update quantity');
  await formNode.fire('submit');
  assert.equal(update.disabled, true);
  await formNode.fire('submit');
  assert.equal(calls.filter(c => c[0] === 'quantity').length, 1);
  finish({ cart: cart() });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(document.activeElement.textContent, /cart now shows/);
  assert.equal(namedButton(document, 'Update quantity').disabled, false);
});
test('failed registration retains typed fields, restores controls and does not display confirmation', async () => {
  const document = new TestDocument('data-wix-event-id');
  const { api, client } = setup();
  client.rsvpV2.createRsvp = async () => { throw { status: 403 }; };
  await initializeTransactions(config, document, { api });
  inputByLabel(document, 'First name').value = 'Test';
  inputByLabel(document, 'Last name').value = 'Guest';
  inputByLabel(document, 'Email').value = 'guest@example.test';
  inputByLabel(document, 'Meal').value = 'Vegetarian';
  await document.querySelectorAll('form')[0].fire('submit');
  assert.equal(inputByLabel(document, 'First name').value, 'Test');
  assert.equal(namedButton(document, 'Submit RSVP').disabled, false);
  assert.match(document.activeElement.textContent, /not available for your guest session/);
  assert.doesNotMatch(document.textContent, /Your RSVP is confirmed/);
});
test('closed event UI does not create dead registration links; GET failure offers retry', async () => {
  const { api, client, wrap } = setup();
  client.wixEventsV2.getEvent = wrap('event', { ...event(), status: 'ENDED' });
  const document = new TestDocument('data-wix-event-id');
  await initializeTransactions(config, document, { api });
  assert.match(document.textContent, /event has ended/);
  assert.equal(document.querySelectorAll('form,a').length, 0);
  const failed = new TestDocument('data-wix-event-id');
  client.wixEventsV2.getEvent = async () => { throw new Error('network failure'); };
  await initializeTransactions(config, failed, { api });
  assert.ok(namedButton(failed, 'Try again'));
  assert.match(failed.textContent, /Server-rendered details remain readable/);
});
test('confirmation UI remains neutral if the permitted visitor verification API fails', async () => {
  const document = new TestDocument('data-wix-confirmation');
  document.location.search = '?payment=success&orderId=forged';
  await initializeTransactions(config, document, { api: {
    config, confirmation: async () => { throw new Error('forbidden'); },
  } });
  assert.match(document.textContent, /does not confirm a payment/);
  assert.doesNotMatch(document.textContent, /Your checkout is confirmed/);
  assert.ok(namedButton(document, 'Check status again'));
});
