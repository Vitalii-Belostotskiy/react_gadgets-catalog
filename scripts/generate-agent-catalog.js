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
