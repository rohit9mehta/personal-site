// The strip along the top: tea and coffee, in a few of the world's languages,
// drifting by. Tea in turmeric, coffee in cream.

type Word = [text: string, lang: string];

const TEA: Word[] = [
  ['चाय', 'hi'],
  ['chá', 'pt'],
  ['চা', 'bn'],
  ['çay', 'tr'],
  ['தேநீர்', 'ta'],
  ['شاي', 'ar'],
  ['ચા', 'gu'],
  ['чай', 'ru'],
  ['ਚਾਹ', 'pa'],
  ['茶', 'zh'],
  ['ചായ', 'ml'],
  ['thé', 'fr'],
  ['چائے', 'ur'],
  ['차', 'ko'],
  ['ಚಹಾ', 'kn'],
  ['té', 'es'],
  ['chai', 'en'],
];

const COFFEE: Word[] = [
  ['कॉफ़ी', 'hi'],
  ['café', 'fr'],
  ['காப்பி', 'ta'],
  ['kahve', 'tr'],
  ['قهوة', 'ar'],
  ['koffie', 'nl'],
  ['কফি', 'bn'],
  ['кофе', 'ru'],
  ['咖啡', 'zh'],
  ['caffè', 'it'],
  ['コーヒー', 'ja'],
  ['cà phê', 'vi'],
  ['ಕಾಫಿ', 'kn'],
  ['kahawa', 'sw'],
  ['καφές', 'el'],
  ['Kaffee', 'de'],
  ['coffee', 'en'],
];

function words(): HTMLElement {
  const run = document.createElement('div');
  run.className = 'ticker__run';
  for (let i = 0; i < Math.max(TEA.length, COFFEE.length); i++) {
    for (const [list, kind] of [
      [TEA, 'tea'],
      [COFFEE, 'coffee'],
    ] as const) {
      const word = list[i];
      if (!word) continue;
      const span = document.createElement('span');
      span.className = `ticker__word ticker__word--${kind}`;
      span.lang = word[1];
      span.dir = 'auto';
      span.textContent = word[0];
      run.append(span);
    }
  }
  return run;
}

export function fillTicker(track: HTMLElement): void {
  // Two identical runs: the track slides left by one run's width, then loops.
  track.append(words(), words());
}
