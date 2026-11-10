/**
 * Pattern-based translation for text that is generated at runtime (relative
 * times, weather warnings, pest-risk sentences, recommendation details).
 *
 * Exact dictionary lookups run first; these rules only see text that is not
 * already a known key. Each rule gets the exact-translation helper so nested
 * fragments (weekday names, crop names, level blurbs) translate too.
 */

export type Vars = Record<string, string | number>;
export type Translate = (text: string, vars?: Vars) => string;

export interface TranslationRule {
  pattern: RegExp;
  render: (match: RegExpMatchArray, t: Translate) => string;
}

export const PATTERNS: TranslationRule[] = [
  /* Relative time */
  {
    pattern: /^(\d+) min ago$/,
    render: (m) => `${m[1]} ମିନିଟ୍ ପୂର୍ବେ`,
  },
  {
    pattern: /^(\d+) h ago$/,
    render: (m) => `${m[1]} ଘଣ୍ଟା ପୂର୍ବେ`,
  },
  {
    pattern: /^(\d+) d ago$/,
    render: (m) => `${m[1]} ଦିନ ପୂର୍ବେ`,
  },

  /* Area formatting */
  {
    pattern: /^([\d.]+) acres · ([\d.]+) ha$/,
    render: (m) => `${m[1]} ଏକର · ${m[2]} ହେ`,
  },
  {
    pattern: /^([\d.]+) acres$/,
    render: (m) => `${m[1]} ଏକର`,
  },

  /* Camera alarm messages */
  {
    pattern: /^Human detected at (.+)$/,
    render: (m, t) => `${t(m[1])} ରେ ମାନବ ଚିହ୍ନଟ`,
  },
  {
    pattern: /^(.+) detected at (.+)$/,
    render: (m, t) => `${t(m[2])} ରେ ${t(m[1])} ଚିହ୍ନଟ`,
  },

  /* Weather warnings — titles */
  {
    pattern: /^Heavy rain expected (.+)$/,
    render: (m, t) => `ପ୍ରବଳ ବର୍ଷା ସମ୍ଭାବନା ${t(m[1])}`,
  },
  {
    pattern: /^Rain likely (.+)$/,
    render: (m, t) => `${t(m[1])} ବର୍ଷା ସମ୍ଭାବନା`,
  },
  {
    pattern: /^High winds (.+)$/,
    render: (m, t) => `${t(m[1])} ପ୍ରବଳ ପବନ`,
  },
  {
    pattern: /^Breezy (.+)$/,
    render: (m, t) => `${t(m[1])} ହାଲୁକା ପବନ`,
  },
  {
    pattern: /^Heat stress (.+)$/,
    render: (m, t) => `${t(m[1])} ଅତ୍ୟଧିକ ଉତ୍ତାପ`,
  },

  /* Weather warnings — details */
  {
    pattern: /^(\d+)% chance, ~([\d.]+) mm\. Delay spraying and check field drainage\.$/,
    render: (m) =>
      `${m[1]}% ସମ୍ଭାବନା, ~${m[2]} ମି.ମି.। ସ୍ପ୍ରେ ବିଳମ୍ବ କରନ୍ତୁ ଓ ଜମି ନିଷ୍କାସନ ଯାଞ୍ଚ କରନ୍ତୁ।`,
  },
  {
    pattern: /^(\d+)% chance\. Plan irrigation and spraying around it\.$/,
    render: (m) =>
      `${m[1]}% ସମ୍ଭାବନା। ଏହା ଆଧାରରେ ଜଳସେଚନ ଓ ସ୍ପ୍ରେ ଯୋଜନା କରନ୍ତୁ।`,
  },
  {
    pattern: /^Up to (\d+) km\/h\. Do not spray and secure young plants\.$/,
    render: (m) =>
      `ପ୍ରାୟ ${m[1]} କି.ମି./ଘଣ୍ଟା। ସ୍ପ୍ରେ କରନ୍ତୁ ନାହିଁ ଓ ଛୋଟ ଗଛ ସୁରକ୍ଷିତ କରନ୍ତୁ।`,
  },
  {
    pattern: /^Up to (\d+) km\/h\. Spray early morning while winds are calm\.$/,
    render: (m) =>
      `ପ୍ରାୟ ${m[1]} କି.ମି./ଘଣ୍ଟା। ପବନ ଶାନ୍ତ ଥିବା ସକାଳେ ସ୍ପ୍ରେ କରନ୍ତୁ।`,
  },
  {
    pattern: /^High of (\d+)°C\. Irrigate before midday to protect the crop\.$/,
    render: (m) =>
      `ସର୍ବାଧିକ ${m[1]}°C। ଫସଲ ରକ୍ଷା ପାଇଁ ମଧ୍ୟାହ୍ନ ପୂର୍ବରୁ ଜଳସେଚନ କରନ୍ତୁ।`,
  },
  {
    pattern: /^Surface soil moisture is (\d+)%\. Consider irrigation soon\.$/,
    render: (m) =>
      `ଭୂପୃଷ୍ଠ ମାଟି ଆର୍ଦ୍ରତା ${m[1]}%। ଶୀଘ୍ର ଜଳସେଚନ ବିଷୟରେ ଭାବନ୍ତୁ।`,
  },

  /* Pest-risk factors */
  {
    pattern: /^(\d+)% average rain chance over the next 3 days$/,
    render: (m) => `ଆଗାମୀ 3 ଦିନରେ ହାରାହାରି ${m[1]}% ବର୍ଷା ସମ୍ଭାବନା`,
  },
  {
    pattern: /^About ([\d.]+) mm of rain expected in 3 days$/,
    render: (m) => `3 ଦିନରେ ପ୍ରାୟ ${m[1]} ମି.ମି. ବର୍ଷା ଆଶା`,
  },
  {
    pattern: /^(\d+) wet days in the 7-day forecast$/,
    render: (m) => `7 ଦିନିଆ ପୂର୍ବାନୁମାନରେ ${m[1]} ଓଦା ଦିନ`,
  },
  {
    pattern: /^Surface soil moisture is high \((\d+)%\)$/,
    render: (m) => `ଭୂପୃଷ୍ଠ ମାଟି ଆର୍ଦ୍ରତା ଅଧିକ (${m[1]}%)`,
  },
  {
    pattern: /^Surface soil moisture is (\d+)%$/,
    render: (m) => `ଭୂପୃଷ୍ଠ ମାଟି ଆର୍ଦ୍ରତା ${m[1]}%`,
  },
  {
    pattern: /^Surface soil is dry \((\d+)%\), favouring mites and thrips$/,
    render: (m) =>
      `ଭୂପୃଷ୍ଠ ମାଟି ଶୁଖିଲା (${m[1]}%), ମାଇଟ୍ ଓ ଥ୍ରିପ୍ସ ପାଇଁ ଅନୁକୂଳ`,
  },
  {
    pattern: /^Average temperature around ([\d.]+)°C suits pest development$/,
    render: (m) =>
      `ହାରାହାରି ତାପମାତ୍ରା ପ୍ରାୟ ${m[1]}°C ପୋକ ବିକାଶ ପାଇଁ ଅନୁକୂଳ`,
  },
  {
    pattern: /^Heat stress at (\d+)°C can weaken the crop's defences$/,
    render: (m) =>
      `${m[1]}°C ଉତ୍ତାପ ଚାପ ଫସଲର ପ୍ରତିରକ୍ଷା ଦୁର୍ବଳ କରିପାରେ`,
  },
  {
    pattern: /^Calm air \(max (\d+) km\/h\) helps pests settle and spread$/,
    render: (m) =>
      `ଶାନ୍ତ ପବନ (ସର୍ବାଧିକ ${m[1]} କି.ମି./ଘଣ୍ଟା) ପୋକ ରହିବା ଓ ବ୍ୟାପିବାରେ ସହାୟକ`,
  },
  {
    pattern: /^The crop is at (.+) — the most sensitive stage$/,
    render: (m, t) => `ଫସଲ ${t(m[1])} ଅବସ୍ଥାରେ — ସବୁଠାରୁ ସମ୍ବେଦନଶୀଳ ଅବସ୍ଥା`,
  },

  /* Pest-risk summary */
  {
    pattern: /^(.+) · day (\d+)\. Weather is not strongly favouring pests right now\.$/,
    render: (m, t) =>
      `${t(m[1])} · ଦିନ ${m[2]}। ବର୍ତ୍ତମାନ ପାଣିପାଗ ପୋକ ପାଇଁ ଅଧିକ ଅନୁକୂଳ ନୁହେଁ।`,
  },
  {
    pattern: /^(.+) · day (\d+)\. (.+)$/,
    render: (m, t) => `${t(m[1])} · ଦିନ ${m[2]}। ${t(m[3])}`,
  },

  /* Scout action naming the first threat */
  {
    pattern: /^Walk the field in the early morning and inspect (.+) hot-spots first\.$/,
    render: (m, t) =>
      t(
        "Walk the field in the early morning and inspect {threat} hot-spots first.",
        { threat: t(m[1]) },
      ),
  },

  /* Shopping suggestion details with a crop name */
  {
    pattern: /^A softer first option for (.+) when pests first appear\. Confirm the target pest and label dose first\.$/,
    render: (m, t) =>
      t(
        "A softer first option for {crop} when pests first appear. Confirm the target pest and label dose first.",
        { crop: t(m[1]) },
      ),
  },
  {
    pattern: /^A steady organic base for (.+)\. Match the quantity to the field size and soil test\.$/,
    render: (m, t) =>
      t(
        "A steady organic base for {crop}. Match the quantity to the field size and soil test.",
        { crop: t(m[1]) },
      ),
  },
];
