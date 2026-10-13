// Finds the product id most similar to a guessed one,
// e.g. "apple-ipad-air-64gb-rosegold" -> "apple-ipad-air-4th-gen-64gb-rose-gold".
// Tokens with digits (model number, capacity, size) must all match,
// otherwise a wrong model could be opened.
export const findClosestId = (
  requested: string,
  ids: string[],
): string | null => {
  const requestedTokens = requested.toLowerCase().split('-').filter(Boolean);

  if (!requestedTokens.length) {
    return null;
  }

  let bestId: string | null = null;
  let bestScore = 0;
  let bestExtra = Infinity;

  ids.forEach(id => {
    const tokens = id.split('-');
    const compact = tokens.join('');
    // "rosegold" matches "rose-gold", "iphone14" matches "iphone-14"
    const isMatched = (token: string) =>
      tokens.includes(token) || (token.length > 2 && compact.includes(token));

    if (requestedTokens.some(t => /\d/.test(t) && !isMatched(t))) {
      return;
    }

    const score = requestedTokens.filter(isMatched).length;
    const extra = tokens.filter(t => !requested.includes(t)).length;

    if (score > bestScore || (score === bestScore && extra < bestExtra)) {
      bestId = id;
      bestScore = score;
      bestExtra = extra;
    }
  });

  return bestScore >= Math.ceil(requestedTokens.length * 0.6) ? bestId : null;
};
