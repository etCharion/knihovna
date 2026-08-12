/**
 * Čtení čárových kódů z kamery telefonu.
 *
 * Používají se dva postupy:
 *  1. BarcodeDetector — nativní funkce prohlížeče (Chrome na Androidu).
 *     Je rychlá, nic se nestahuje.
 *  2. ZXing — knihovna v JavaScriptu, která se natáhne až když první
 *     možnost chybí (typicky Safari na iPhonu).
 *
 * Kamera jde v prohlížeči zapnout jen přes HTTPS, což GitHub Pages splňuje.
 */

// Knihovna je přibalená v repozitáři, ne z cizího CDN — aplikace tak funguje
// i offline a při skenování nic neodchází na server třetí strany.
const ZXING_SOUBOR = new URL('../vendor/zxing.min.js', import.meta.url).href;
const FORMATY = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

let stream = null;
let stopka = null;      // funkce, která zastaví běžící dekódování
let bezi = false;

/** Jeden a ten samý kód umí kamera přečíst 30× za sekundu — tohle to utlumí. */
function omezOpakovani(zpetneVolani, prodlevaMs = 2500) {
  let posledniKod = null;
  let posledniCas = 0;
  return (kod) => {
    const ted = Date.now();
    if (kod === posledniKod && ted - posledniCas < prodlevaMs) return;
    posledniKod = kod;
    posledniCas = ted;
    zpetneVolani(kod);
  };
}

function nactiSkript(url) {
  return new Promise((splneno, chyba) => {
    const skript = document.createElement('script');
    skript.src = url;
    skript.onload = splneno;
    skript.onerror = () => chyba(new Error('Nepodařilo se stáhnout knihovnu pro čtení kódů.'));
    document.head.appendChild(skript);
  });
}

async function nativniPodpora() {
  if (!('BarcodeDetector' in window)) return false;
  try {
    const podporovane = await window.BarcodeDetector.getSupportedFormats();
    return podporovane.includes('ean_13');
  } catch {
    return false;
  }
}

async function dekodujNativne(video, onKod) {
  const detektor = new window.BarcodeDetector({
    formats: FORMATY.filter((f) => f !== 'upc_e'),
  });
  let aktivni = true;

  const krok = async () => {
    if (!aktivni) return;
    try {
      if (video.readyState >= 2) {
        const nalezy = await detektor.detect(video);
        if (nalezy.length) onKod(nalezy[0].rawValue);
      }
    } catch {
      /* jeden nepovedený snímek nevadí, zkusí se další */
    }
    if (aktivni) requestAnimationFrame(krok);
  };

  requestAnimationFrame(krok);
  return () => {
    aktivni = false;
  };
}

async function dekodujZxing(video, onKod) {
  if (!window.ZXing) await nactiSkript(ZXING_SOUBOR);
  const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = window.ZXing;

  // Omezení na formáty čárových kódů, které se na knihách vyskytují — čtečka
  // pak nezkouší QR a spol. a stíhá víc snímků za sekundu.
  //
  // Záměrně se nenastavuje TRY_HARDER: v této verzi ZXingu při plynulém čtení
  // z kamery zabrání rozpoznání EAN-13 úplně (ověřeno na testovacím videu).
  const napovedy = new Map();
  napovedy.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
  ]);

  // Druhý parametr je prodleva mezi pokusy v milisekundách.
  const ctecka = new BrowserMultiFormatReader(napovedy, 150);
  // decodeFromStream si obraz do <video> připojí a spustí sám.
  await ctecka.decodeFromStream(stream, video, (vysledek) => {
    if (vysledek) onKod(vysledek.getText());
  });

  return () => ctecka.reset();
}

/** Krátké pípnutí a zavibrování, ať je poznat, že se kód načetl. */
export function potvrzeniSkenu() {
  try {
    const zvuk = new (window.AudioContext || window.webkitAudioContext)();
    const oscilator = zvuk.createOscillator();
    const hlasitost = zvuk.createGain();
    oscilator.type = 'sine';
    oscilator.frequency.value = 880;
    hlasitost.gain.setValueAtTime(0.15, zvuk.currentTime);
    hlasitost.gain.exponentialRampToValueAtTime(0.001, zvuk.currentTime + 0.18);
    oscilator.connect(hlasitost).connect(zvuk.destination);
    oscilator.start();
    oscilator.stop(zvuk.currentTime + 0.18);
    setTimeout(() => zvuk.close(), 400);
  } catch {
    /* zvuk je jen bonus */
  }
  navigator.vibrate?.(60);
}

export function jeSpusten() {
  return bezi;
}

/** Zapne zadní kameru a začne hlídat čárové kódy. */
export async function spust(video, onKod) {
  if (bezi) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Tento prohlížeč neumí pracovat s kamerou.');
  }

  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });

  video.setAttribute('playsinline', 'true'); // bez tohohle iPhone spustí video přes celou obrazovku
  video.muted = true;

  const hlaseni = omezOpakovani(onKod);

  if (await nativniPodpora()) {
    try {
      video.srcObject = stream;
      await video.play();
      stopka = await dekodujNativne(video, hlaseni);
    } catch (chyba) {
      // Prohlížeč se k funkci hlásí, ale nefunguje — pořád zbývá ZXing.
      console.warn('Nativní čtečka selhala, přepínám na ZXing.', chyba);
      stopka = await dekodujZxing(video, hlaseni);
    }
  } else {
    stopka = await dekodujZxing(video, hlaseni);
  }

  bezi = true;
}

export function zastav(video) {
  stopka?.();
  stopka = null;
  stream?.getTracks().forEach((stopa) => stopa.stop());
  stream = null;
  if (video) video.srcObject = null;
  bezi = false;
}

export function maSvetlo() {
  const stopa = stream?.getVideoTracks()[0];
  return !!stopa?.getCapabilities?.().torch;
}

export async function prepniSvetlo(zapnout) {
  const stopa = stream?.getVideoTracks()[0];
  if (!stopa?.getCapabilities?.().torch) return false;
  await stopa.applyConstraints({ advanced: [{ torch: zapnout }] });
  return true;
}
