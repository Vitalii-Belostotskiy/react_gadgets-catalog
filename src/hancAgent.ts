// Bridge between the HANC voice agent widget (public/index.html) and the site.
// The widget dispatches `agent-command` on document; event.preventDefault()
// tells the agent the command was accepted.
import { Phone } from './types/PhoneType';
import { Products } from './types/Products';
import { findClosestId } from './utils/findClosestId';
import phones from './api/phones.json';
import tablets from './api/tablets.json';
import accessories from './api/accessories.json';

interface AgentCommandDetail {
  type: string;
  payload?: { path?: string };
  respond?: (data: unknown) => void;
}

// same data the product page (ItemCard) renders price, capacity and color from
const catalog: Record<string, Phone[]> = {
  phones: phones as Phone[],
  tablets: tablets as Phone[],
  accessories: accessories as Phone[],
};

const pagePaths = [
  '/',
  '/phones',
  '/tablets',
  '/accessories',
  '/favourites',
  '/cart',
];

// spellings the agent may use for existing pages
const pathAliases: Record<string, string> = {
  home: '',
  favorites: 'favourites',
  favourite: 'favourites',
  favorite: 'favourites',
  wishlist: 'favourites',
  basket: 'cart',
  phone: 'phones',
  tablet: 'tablets',
  accessory: 'accessories',
  watches: 'accessories',
};

const colorNames: Record<string, string> = {
  midnightgreen: 'Midnight Green',
  spacegray: 'Space Gray',
  spaceblack: 'Space Black',
  rosegold: 'Rose Gold',
  sierrablue: 'Sierra Blue',
  skyblue: 'Sky Blue',
};

const formatColor = (color: string) =>
  colorNames[color.replace(/[\s-]/g, '')] ||
  color.replace(/(^|\s)\S/g, letter => letter.toUpperCase());

const getCurrentPath = () => window.location.hash.replace(/^#/, '') || '/';

const splitPath = (path: string) =>
  path.split('?')[0].split('/').filter(Boolean);

// the agent says "iPad Air 4", "iPad mini 6", so it often sends short ids
const generationAliases: [RegExp, string][] = [
  [/(^|-)air-4(?=-|$)/, '$1air-4th-gen'],
  [/(^|-)mini-6(?=-|$)/, '$1mini-6th-gen'],
  [/(^|-)mini-5(?=-|$)/, '$1mini-5th-gen'],
  [/(^|-)pro-11(?!-2021)(?=-|$)/, '$1pro-11-2021'],
  [/(^|-)10-2(?!-2020)(?=-|$)/, '$110-2-2020'],
];

const compact = (text: string) => text.replace(/[\s-]/g, '');

// variants of the most specific model named in the id
// ("iphone-11-pro-max" wins over "iphone-11"), or null if none is named
const findModelVariants = (productId: string, models: Phone[]) => {
  const tokens = productId.split('-');
  const namespace = Array.from(new Set(models.map(item => item.namespaceId)))
    .filter(name =>
      name
        .split('-')
        .every(token => token === 'apple' || tokens.includes(token)),
    )
    .sort((a, b) => b.length - a.length)[0];

  return namespace
    ? models.filter(item => item.namespaceId === namespace)
    : null;
};

// the model has no such capacity or color: its variant with the same color,
// otherwise the cheapest one
const pickVariant = (productId: string, variants: Phone[]) => {
  // length of the matched color, so "rose-gold" prefers rosegold over gold
  const colorMatch = (item: Phone) =>
    compact(productId).endsWith(compact(item.color))
      ? compact(item.color).length
      : 0;

  return [...variants].sort(
    (a, b) =>
      colorMatch(b) - colorMatch(a) || a.priceDiscount - b.priceDiscount,
  )[0].id;
};

interface ResolvedPath {
  path: string;
  // false when a similar product or the category page is opened instead
  exact: boolean;
}

const toPageSegment = (segment: string) =>
  Object.prototype.hasOwnProperty.call(pathAliases, segment)
    ? pathAliases[segment]
    : segment;

// the existing product id for a possibly guessed one, or null
const resolveProductId = (productId: string, models: Phone[]) => {
  if (models.some(item => item.id === productId)) {
    return productId;
  }

  const fullId = generationAliases.reduce(
    (id, [pattern, replacement]) => id.replace(pattern, replacement),
    productId,
  );
  const variants = findModelVariants(fullId, models);
  const candidates = (variants || models).map(item => item.id);
  const id = findClosestId(fullId, candidates);

  if (!id && variants) {
    return pickVariant(fullId, variants);
  }

  return id;
};

// returns the page to open for the agent's path, or null if neither
// the product nor the page is recognised
const resolvePath = (path: string): ResolvedPath | null => {
  const [segment = '', productId, ...rest] = splitPath(path.toLowerCase());
  const category = toPageSegment(segment);
  const cleanPath = category ? `/${category}` : '/';

  if (!pagePaths.includes(cleanPath)) {
    return null;
  }

  const models = catalog[category];

  if (!productId || !models) {
    return { path: cleanPath, exact: !productId };
  }

  const id = resolveProductId(productId, models);

  if (!id) {
    return { path: cleanPath, exact: false };
  }

  return {
    path: `${cleanPath}/${id}`,
    exact: id === productId && !rest.length,
  };
};

// HANC has no commands for changing the cart, so the agent "opens" action
// paths: /cart/add/<id>, /cart/remove/<id>, /cart/set/<id>?qty=<n>,
// /favourites/add/<id>, /favourites/remove/<id>. AppProvider registers
// the functions doing it.
type ShopListName = 'cart' | 'favourites';
type ShopActionResult = 'added' | 'already' | 'removed' | 'missing' | 'updated';

export interface ShopActions {
  add: (list: ShopListName, itemId: string) => ShopActionResult;
  remove: (list: ShopListName, itemId: string) => ShopActionResult;
  // quantity 0 removes the product from the cart
  setQuantity: (itemId: string, quantity: number) => ShopActionResult;
}

let shopActions: ShopActions | null = null;

export const registerShopActions = (actions: ShopActions | null) => {
  shopActions = actions;
};

const actionAliases: Record<string, 'add' | 'remove' | 'set'> = {
  add: 'add',
  remove: 'remove',
  delete: 'remove',
  set: 'set',
  quantity: 'set',
  qty: 'set',
  update: 'set',
};

const maxQuantity = 99;

// "?qty=3" (also quantity, count) or a number after the id: /cart/set/<id>/3
const getQuantity = (path: string, parts: string[]) => {
  const query = path.split('?')[1] || '';
  const fromQuery = query.match(/(?:^|&)(?:qty|quantity|count)=(\d+)/);
  const fromPath = parts.find(part => /^\d+$/.test(part));
  const value = fromQuery ? fromQuery[1] : fromPath;

  return value === undefined ? null : Math.min(Number(value), maxQuantity);
};

const allModels = Object.values(catalog).flat();

// handles an action path, or returns null if the path is not an action
const runShopAction = (path: string) => {
  const [segment = '', action = '', ...rest] = splitPath(path.toLowerCase());
  const list = toPageSegment(segment);
  const verb = Object.prototype.hasOwnProperty.call(actionAliases, action)
    ? actionAliases[action]
    : null;

  // favourites have no quantity
  if (
    (list !== 'cart' && list !== 'favourites') ||
    !verb ||
    (verb === 'set' && list !== 'cart')
  ) {
    return null;
  }

  const quantity = list === 'cart' ? getQuantity(path, rest) : null;
  // the agent may add the category: /cart/add/phones/<id>
  const productId = rest
    .filter(part => !catalog[toPageSegment(part)] && !/^\d+$/.test(part))
    .pop();
  const id = productId ? resolveProductId(productId, allModels) : null;
  const model = allModels.find(item => item.id === id);
  let result: ShopActionResult | 'not_found' | 'no_quantity' = 'not_found';

  if (model && shopActions) {
    // "add 3 watches" sets the quantity too
    if (verb === 'set' || (verb === 'add' && quantity !== null)) {
      result =
        quantity === null
          ? 'no_quantity'
          : shopActions.setQuantity(model.id, quantity);
    } else {
      result = shopActions[verb](list, model.id);
    }
  }

  const product = model && {
    id: model.id,
    name: model.name,
    price: model.priceDiscount,
  };

  return {
    // the page does not change, so this is where the visitor already is
    opened: getCurrentPath(),
    action: `${list}_${verb}`,
    result,
    // false when a similar product was used instead of the asked one
    exact: Boolean(model) && model?.id === productId,
    product: product || null,
  };
};

const getProduct = (path: string) => {
  const [category, productId, ...rest] = splitPath(path);
  const model =
    productId && !rest.length
      ? catalog[category]?.find(item => item.id === productId)
      : undefined;

  if (!model) {
    return null;
  }

  // build the name from capacity and color, so it always matches the page
  const modelName = model.name.split(model.capacity)[0].trim();

  return {
    id: model.id,
    category: model.category,
    name: `${modelName} ${model.capacity} ${formatColor(model.color)}`,
    capacity: model.capacity,
    color: formatColor(model.color),
    price: model.priceDiscount,
    regularPrice: model.priceRegular,
    currency: 'USD',
    screen: model.screen,
    resolution: model.resolution,
    processor: model.processor,
    ram: model.ram,
    camera: model.camera,
    zoom: model.zoom,
    capacityAvailable: model.capacityAvailable,
    colorsAvailable: model.colorsAvailable.map(formatColor),
  };
};

const readStorage = <T>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || '') ?? fallback;
  } catch {
    return fallback;
  }
};

// AppContext keeps the cart in localStorage: `cart` may hold the same product
// several times, the real quantity is in `itemCounts`
const getCartState = () => {
  const cart = readStorage<Products[]>('cart', []);
  const itemCounts = readStorage<Record<number, number>>('itemCounts', {});
  const unique = cart.filter(
    (item, index) => cart.findIndex(other => other.id === item.id) === index,
  );

  const items = unique.map(item => ({
    id: item.itemId,
    name: item.name,
    capacity: item.capacity,
    color: formatColor(item.color),
    price: item.price,
    quantity: itemCounts[item.id] || 1,
  }));

  // totals are counted here: the agent is unreliable with arithmetic
  return {
    items,
    total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    currency: 'USD',
  };
};

const getFavourites = () =>
  readStorage<Products[]>('favourites', []).map(item => ({
    id: item.itemId,
    category: item.category,
    path: `/${item.category}/${item.itemId}`,
    name: item.name,
    capacity: item.capacity,
    color: formatColor(item.color),
    price: item.price,
    regularPrice: item.fullPrice,
  }));

const handleAgentCommand = (event: Event) => {
  const { type, payload, respond } = (event as CustomEvent<AgentCommandDetail>)
    .detail;

  switch (type) {
    case 'navigate': {
      const requested = String(payload?.path || '');

      // external links and empty paths are not the site's business
      if (!requested.startsWith('/') || requested.startsWith('//')) {
        break;
      }

      // always accept a site path: a navigate left unhandled makes the agent
      // stop opening pages until the end of the call
      event.preventDefault();

      const shopAction = runShopAction(requested);

      if (shopAction) {
        const favourites = getFavourites();
        const favouritesState = {
          favourites,
          favouritesTotal: favourites.reduce(
            (sum, item) => sum + item.price,
            0,
          ),
        };
        const listState = shopAction.action.startsWith('cart')
          ? { cart: getCartState() }
          : favouritesState;

        // the visitor stays on the current page, the header counters update;
        // the changed list goes back with the result, so the agent does not
        // rely on an older cart state
        respond?.({ ...shopAction, ...listState });
        break;
      }

      const resolved = resolvePath(requested);

      if (resolved) {
        // hash change only: a page reload would drop the call
        window.location.hash = `#${resolved.path}`;
      }

      respond?.({
        opened: resolved ? resolved.path : getCurrentPath(),
        exact: resolved ? resolved.exact : false,
      });
      break;
    }

    case 'page_context': {
      const path = getCurrentPath();
      const favourites = getFavourites();
      const { items, total, count } = getCartState();

      event.preventDefault();
      // there is no separate command for favourites, so they come with
      // the page context, together with the cart
      respond?.({
        path,
        title: document.title,
        product: getProduct(path),
        favourites,
        favouritesTotal: favourites.reduce((sum, item) => sum + item.price, 0),
        cart: { items, total, count },
      });
      break;
    }

    case 'cart_state':
      event.preventDefault();
      respond?.(getCartState());
      break;

    default:
      break;
  }
};

declare global {
  interface Window {
    hancAgentHandler?: (event: Event) => void;
  }
}

export const initHancAgent = () => {
  // replace the previous listener if the module is re-run (hot reload)
  if (window.hancAgentHandler) {
    document.removeEventListener('agent-command', window.hancAgentHandler);
  }

  window.hancAgentHandler = handleAgentCommand;
  document.addEventListener('agent-command', handleAgentCommand);
};
