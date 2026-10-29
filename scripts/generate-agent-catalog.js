// Generates agent-catalog.md: the product list for the voice agent's knowledge base.
// Specs come from the product page data, so the agent says what the page shows.
// Run after changing src/api/*.json: node scripts/generate-agent-catalog.js
const fs = require('fs');
const path = require('path');
const products = require('../src/api/products.json');

const pages = {
  phones: require('../src/api/phones.json'),
  tablets: require('../src/api/tablets.json'),
  accessories: require('../src/api/accessories.json'),
};

const titles = {
  phones: 'Phones',
  tablets: 'Tablets',
  accessories: 'Accessories (smart watches)',
};

const colorNames = {
  midnightgreen: 'Midnight Green',
  spacegray: 'Space Gray',
  spaceblack: 'Space Black',
  rosegold: 'Rose Gold',
  sierrablue: 'Sierra Blue',
  skyblue: 'Sky Blue',
};

const formatColor = color =>
  colorNames[color.replace(/[\s-]/g, '')] ||
  color.replace(/(^|\s)\S/g, letter => letter.toUpperCase());

const modelName = item => item.name.split(item.capacity)[0].trim();

// "1TB" -> 1024, "512GB" -> 512, "44mm" -> 44
const toNumber = size => parseFloat(size) * (/TB/i.test(size) ? 1024 : 1);

const lines = [
  '# Gizmo Galaxy — product catalog',
  '',
  'Open a product only by its exact path from this list (navigate to the path).',
  'Never build or guess a path yourself.',
  'Site pages: / (home), /phones, /tablets, /accessories, /favourites, /cart.',
  'Prices are in USD. "was" is the price before discount.',
  'To learn what the visitor sees now, or what is in their favourites, ' +
    'request the page context; for the cart, request the cart state.',
];

// action paths handled by src/hancAgent.ts (HANC has no cart commands)
lines.push(
  '',
  '## Cart and favourites actions',
  '',
  'To change the cart or favourites, navigate to one of these paths, ' +
    'where <product-id> is the last part of the product path from this list:',
  '',
  '- add to cart: /cart/add/<product-id>',
  '- remove from cart: /cart/remove/<product-id>',
  '- set how many pieces of a product are in the cart: ' +
    '/cart/set/<product-id>?qty=<number> (qty=0 removes it; ' +
    'adds the product if it is not in the cart yet)',
  '- add to favourites: /favourites/add/<product-id>',
  '- remove from favourites: /favourites/remove/<product-id>',
  '',
  'Example: to add Apple iPhone 14 Pro 256GB Gold to the cart, navigate to ' +
    '/cart/add/apple-iphone-14-pro-256gb-gold; to add it to favourites, ' +
    'navigate to /favourites/add/apple-iphone-14-pro-256gb-gold.',
  'The cart and favourites are two different lists. When the visitor asks ' +
    'for favourites (избранное, обране, wishlist, the heart button), use only ' +
    'a /favourites/... path, never a /cart/... path, and the other way round. ' +
    'Check the "action" field of the result: favourites_add means the product ' +
    'went to favourites, cart_add means it went to the cart.',
  'Before adding to the cart, name the exact product and price and ask ' +
    'the visitor to confirm. Adding a product already in the cart does not ' +
    'add a second one (the result is "already"): to change the quantity, use ' +
    '/cart/set with the total number the visitor wants, e.g. "make it three" ' +
    'means qty=3. Say the new quantity only after the result is "updated" or ' +
    '"added", taking it from "quantity" in the returned cart. ' +
    'The page does not change after the action.',
  'The result of an action already contains the updated list: "cart" ' +
    '(items, total, count) after a cart action, "favourites" and ' +
    '"favouritesTotal" after a favourites action. Answer about the change ' +
    'from it, there is no need to request anything else.',
  'The cart and favourites change during the call. Never answer what is in ' +
    'them from memory: every time the visitor asks about them, request the ' +
    'cart state (or the page context for favourites) again and answer only ' +
    'from the new result.',
);

// same rule as the "Brand new models" block on the home page (HomePage.tsx)
const newModels = [
  ...new Set(
    products
      .filter(item => item.name.includes('Apple iPhone 14'))
      .map(modelName),
  ),
];

lines.push(
  '',
  '## Newest models',
  '',
  `The newest phones in the store are ${newModels.join(', ')} (2022). ` +
    'When asked about the newest or latest model, offer these. ' +
    'Do not judge novelty by price.',
);

Object.entries(titles).forEach(([category, title]) => {
  const variants = pages[category];
  const models = [...new Set(variants.map(item => item.namespaceId))];

  lines.push('', `## ${title} (${models.length} models)`);

  models
    .map(namespaceId => variants.filter(v => v.namespaceId === namespaceId))
    .sort((a, b) => modelName(a[0]).localeCompare(modelName(b[0])))
    .forEach(items => {
      const first = items[0];
      const specsOf = item => ({
        Year: products.find(p => p.itemId === item.id).year,
        Screen: item.screen,
        Resolution: item.resolution,
        Processor: item.processor,
        RAM: item.ram,
        Camera: item.camera,
        Zoom: item.zoom,
        Connectivity: item.cell.join(', '),
        'Key features': item.description.map(d => d.title).join('; '),
      });
      // specs that differ between variants go to each variant's line
      const varying = Object.keys(specsOf(first)).filter(key =>
        items.some(item => specsOf(item)[key] !== specsOf(first)[key]),
      );
      const specs = Object.entries(specsOf(first))
        .filter(([key, value]) => value && !varying.includes(key))
        .map(([key, value]) => `${key}: ${value.toString().replace(/\.$/, '')}`);

      // spelled out, so the agent does not have to compare "1TB" with "512GB"
      const sizes = [...new Set(items.map(item => item.capacity))].sort(
        (a, b) => toNumber(a) - toNumber(b),
      );
      const colors = [...new Set(items.map(item => formatColor(item.color)))];
      const prices = items.map(item => item.priceDiscount);
      const sizeLabel = category === 'accessories' ? 'Case sizes' : 'Storage';
      const summary =
        `${modelName(first)} options. ${sizeLabel}: ${sizes.join(', ')}` +
        (sizes.length > 1
          ? ` (smallest ${sizes[0]}, largest ${sizes[sizes.length - 1]})`
          : '') +
        `. Colors: ${colors.join(', ')}. ` +
        `Price: from $${Math.min(...prices)} to $${Math.max(...prices)}.`;

      lines.push(
        '',
        `### ${modelName(first)}`,
        '',
        summary,
        '',
        `${modelName(first)} specs. ${specs.join('. ')}.`,
        '',
      );

      items
        .sort(
          (a, b) =>
            toNumber(a.capacity) - toNumber(b.capacity) || a.color.localeCompare(b.color),
        )
        .forEach(item => {
          const was =
            item.priceRegular > item.priceDiscount
              ? `, was $${item.priceRegular}`
              : '';
          const own = varying
            .filter(key => specsOf(item)[key])
            .map(key => `; ${key}: ${specsOf(item)[key]}`)
            .join('');

          lines.push(
            `- ${modelName(first)} ${item.capacity}, ${formatColor(item.color)} — ` +
              `$${item.priceDiscount}${was}${own} — path: /${category}/${item.id}`,
          );
        });
    });
});

const out = path.join(__dirname, '..', 'agent-catalog.md');

fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`Written ${products.length} products to ${out}`);
