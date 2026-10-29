# Задача для Claude Code: подключить голосового продавца HANC к сайту (react_gadgets-catalog)

Контекст: проект на React с HashRouter (GitHub Pages). Голосовой агент HANC в браузерном звонке умеет просить сайт открыть страницу и спрашивать, что сейчас открыто у посетителя. Агент ошибается в цене и памяти, потому что берёт их из базы знаний, а не с реальной страницы. Нужно, чтобы сайт сам отвечал агенту точными данными открытого товара.

## Что сделать

1. Виджет и обработчик команд агента подключены один раз, на уровне приложения, не на странице товара.
   - Виджет — в `public/index.html` внутри `<body>`, перед `</body>`. Кроме виджета, в `index.html` никакого кода агента нет:
     ```html
     <hanc-ai-floating-call agent-id="6acdd5039237ec81fad90df0" theme="purple" voice-service-url="https://voice.hanc.ai"></hanc-ai-floating-call>
     <script src="https://unpkg.com/hanc-webrtc-widgets" async type="text/javascript"></script>
     ```
   - Обработчик события `agent-command` — в модуле `src/hancAgent.ts`, функция `initHancAgent()` вызывается один раз при старте в `src/index.tsx`. Подписка на `document`, не пересоздаётся при смене страницы, не дублируется при hot reload (прежний обработчик снимается).

2. Обработчик `agent-command` (`event.detail = { type, payload, respond }`):
   - `type === 'navigate'`: `payload.path` начинается с `/`. Перейти без перезагрузки страницы, иначе звонок оборвётся: `window.location.hash = '#' + path`. Вызвать `event.preventDefault()` (это сигнал агенту «принято»). Путь вида `/phones/apple-iphone-14-pro-128gb-spaceblack`, `/tablets/...`, `/accessories/...`, а также `/`, `/phones`, `/tablets`, `/accessories`, `/favourites`, `/cart`.
     - Синонимы страниц приводятся к настоящим адресам: `/favorites`, `/wishlist` → `/favourites`; `/home` → `/`; `/basket` → `/cart`; `/watches` → `/accessories`. Регистр не важен.
     - Если агент придумал неточный адрес товара (например `/tablets/apple-ipad-air-64gb-rosegold`), открыть ближайший существующий товар (`/tablets/apple-ipad-air-4th-gen-64gb-rose-gold`, функция `src/utils/findClosestId.ts`). Части адреса с цифрами (модель, память, размер) должны совпасть точно, иначе товар не подбирается.
     - Сокращения поколений разворачиваются: `air-4` → `air-4th-gen`, `mini-6` → `mini-6th-gen`, `mini-5` → `mini-5th-gen`, `pro-11` → `pro-11-2021`, `10-2` → `10-2-2020`. Если модель узнана, а такой памяти или цвета нет, открыть вариант того же цвета, иначе самый дешёвый.
     - `preventDefault()` вызывать на **любой** путь, начинающийся с `/`: без него агент до конца звонка перестаёт открывать страницы. Неизвестная модель → страница раздела; неизвестный раздел → страница не меняется. Внешние ссылки (`https://…`, `//…`) и пустой путь игнорировать без `preventDefault()`.
     - Ответ `respond({ opened, exact })`, `exact: false`, если открыт похожий товар или раздел.
     - Адреса-действия (своих команд для корзины у HANC нет): `/cart/add/<id>`, `/cart/remove/<id>`, `/cart/set/<id>?qty=<n>` (количество в корзине; также `quantity=`, `count=` или `/cart/set/<id>/<n>`, `add` с количеством работает как `set`, `qty=0` удаляет товар, `set` без количества → `no_quantity`; результат `updated` или `added`), `/favourites/add/<id>`, `/favourites/remove/<id>` (синонимы разделов и `delete` вместо `remove` тоже работают, категория в пути допускается: `/cart/add/phones/<id>`). Товар ищется по всему каталогу так же, как выше. Действие повторяемое: добавление уже добавленного ничего не меняет. Страница после действия не меняется (посетитель видит изменение по счётчику в шапке), ответ `respond({ opened, action, result, exact, product })`, где `result` — `added`, `already`, `removed`, `updated`, `missing` (товара нет в списке) или `not_found` (товар не найден). Корзину и избранное меняют функции, которые `AppProvider` регистрирует через `registerShopActions`, а не прямая запись в localStorage — иначе React не узнает об изменении.
   - `type === 'page_context'`: `event.preventDefault()` и
     `respond({ path, title, product, favourites, favouritesTotal, cart })`, где
     - `path` = текущий путь из hash без `#` (например `/phones/apple-iphone-14-pro-128gb-spaceblack`);
     - `title` = `document.title`;
     - `favourites` = список избранного посетителя (массив объектов `id`, `category`, `path`, `name`, `capacity`, `color`, `price`, `regularPrice`), берётся из состояния избранного приложения; пустой массив, если избранное пусто. Агент по просьбе в промпте запрашивает контекст страницы и читает именно это поле;
     - `favouritesTotal` = сумма текущих цен (`price`) всех товаров избранного, число в долларах, посчитанная в коде сайта, а не агентом; `cart` = `{ items, total, count }` с тем же правилом для корзины, `count` — общее число штук (в звонке агент ошибся в арифметике: назвал 5145 вместо 6147);
     - `product` = данные открытого товара, если путь вида `/{category}/{id}`. Найти товар по `id` (последний сегмент пути) в тех же данных, из которых страница товара рисует цену, память и цвет (в проекте это карточки товаров: у них поля `id`, `category`, `namespaceId`, `name`, `capacity`, `color`, `priceDiscount`, `priceRegular`, `screen`, `resolution`, `processor`, `ram`, `camera`, `zoom`, `cell`, `capacityAvailable`, `colorsAvailable`). Никакие данные не придумывать и не брать из другого источника, чем страница.
       Формат ответа:
       ```js
       product: {
         id, category, name,            // name лучше собрать как "<модель> <capacity> <color>", поле name в данных иногда неточное
         capacity, color,
         price: priceDiscount,          // текущая цена в долларах США, число
         regularPrice: priceRegular,    // обычная цена до скидки, число
         currency: 'USD',
         screen, resolution, processor, ram, camera, zoom,
         capacityAvailable, colorsAvailable
       }
       ```
       Если товара по пути нет, отдать `product: null`.
   - `type === 'cart_state'`: `event.preventDefault()` и `respond({ items, total, count, currency: 'USD' })` из состояния корзины приложения (количество и товары: `id`, `name`, `capacity`, `color`, `price`, `quantity`). Корзина хранится в localStorage (`cart` — товары, один товар может повторяться; `itemCounts` — количество по `id`), читать оттуда, не дублируя логику.

3. Не ломать существующую логику, роутинг, стили. Не добавлять новых зависимостей. Названия файлов и способ доступа к данным подобрать по структуре проекта, сначала прочитать `src` и найти, откуда страница товара берёт цену.

4. Данные о товарах: единственный источник правды — данные страницы товара (`src/api/phones.json`, `tablets.json`, `accessories.json`). `src/api/products.json` (список, главная, корзина) должен совпадать с ними по цене, названию, памяти, цвету и RAM; экран в `products.json` — в коротком формате (`6.1' OLED`), чтобы не ломать карточки.

5. База знаний агента — `agent-catalog.md` в корне проекта. Он генерируется из данных страниц командой `node scripts/generate-agent-catalog.js`; после любой правки `src/api/*.json` пересоздать и заново загрузить в HANC. Для каждой модели: сводка (все объёмы по возрастанию с явным самым маленьким и самым большим, цвета, диапазон цен), характеристики и строки вариантов с полным названием модели, ценой и точным `path`. В начале — список страниц сайта и блок «Newest models» (по тому же правилу, что блок «Brand new models» на главной).

6. Инструкция агента в HANC должна содержать:
   - открывать товар только по точному `path` из базы знаний, адреса не придумывать;
   - чтобы узнать, что в избранном, запрашивать контекст страницы (поле `favourites`);
   - никогда не складывать цены самому: сумма избранного — `favouritesTotal`, сумма корзины — `cart.total`, число товаров в корзине — `cart.count`;
   - менять корзину и избранное через адреса-действия; перед добавлением в корзину назвать товар и цену и дождаться согласия посетителя.

## Как проверить

- Открыть сайт локально и из консоли выполнить:
  ```js
  document.dispatchEvent(new CustomEvent('agent-command', { detail: { type: 'navigate', payload: { path: '/phones/apple-iphone-14-pro-128gb-spaceblack' }, respond: console.log }, cancelable: true }))
  ```
  Страница товара открывается без перезагрузки, hash меняется.
- Затем:
  ```js
  document.dispatchEvent(new CustomEvent('agent-command', { detail: { type: 'page_context', payload: {}, respond: console.log }, cancelable: true }))
  ```
  В консоли `product.price` и `product.capacity`/`color` совпадают с тем, что показано на странице (для 14 Pro 128GB Space Black: $980 и обычная $1056).
- Проверить несколько товаров из разных категорий (телефон, планшет, часы, у часов цвет `space gray` с пробелом) и путь без товара (`/phones`) → `product: null`.
- Проверить, что при смене страниц обработчик не регистрируется повторно (один вызов `respond` на одно событие).
- `navigate` на `/favorites` открывает `/favourites`, на `/tablets/apple-ipad-air-64gb-rosegold` — `/tablets/apple-ipad-air-4th-gen-64gb-rose-gold`, на `/laptops` — не открывается (`defaultPrevented === false`).
- Добавить несколько товаров в избранное и корзину (в том числе со страницы товара и с количеством больше 1): `favouritesTotal`, `cart.total` и `cart.count` в `page_context` совпадают с суммами на страницах избранного и корзины; в корзине нет `$NaN`.
- `navigate` на `/cart/add/apple-ipad-air-4-64gb-sky-blue` → `result: 'added'`, в корзине `apple-ipad-air-4th-gen-64gb-sky-blue` с количеством 1, страница не сменилась, счётчик в шапке обновился; повтор → `already`, количество по-прежнему 1; `/cart/remove/…` → `removed`, повтор → `missing`; `/cart/add/apple-iphone-15` → `not_found`, корзина не меняется. То же для `/favourites/add|remove/…`.

## Деплой

Сайт публикуется на GitHub Pages (`https://vitalii-belostotskiy.github.io/react_gadgets-catalog/`). После изменений собрать и опубликовать тем же способом, что и раньше (`npm run deploy`, если такой скрипт есть в package.json). Делать коммит и пуш только после моего подтверждения.
