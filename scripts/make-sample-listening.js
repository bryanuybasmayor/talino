#!/usr/bin/env node
/**
 * Generate realistic Filipino social listening data for ZYN Philippines demo.
 * Uses a seeded PRNG so output is identical every run.
 * Run: node scripts/make-sample-listening.js
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SEED_DIR = join(ROOT, 'data', 'seed');

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function weightedPick(items) {
  const total = items.reduce((s, i) => s + i[1], 0);
  let r = rand() * total;
  for (const [val, w] of items) { r -= w; if (r <= 0) return val; }
  return items[items.length - 1][0];
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Constants ─────────────────────────────────────────────────────────────
const PERIOD_START = new Date('2026-01-01');
const PERIOD_END = new Date('2026-10-22');
const TOTAL_DAYS = Math.ceil((PERIOD_END - PERIOD_START) / 86400000);

const CAMPAIGNS = [
  { name: 'ZYN Summer Cebu', start: '2026-03-20', end: '2026-03-22', spike: 3.5 },
  { name: 'ZYN Summer in Siargao', start: '2026-04-15', end: '2026-04-17', spike: 3.0 },
  { name: 'ZYN Summer in Boracay', start: '2026-05-10', end: '2026-05-12', spike: 3.5 },
  { name: 'ZYN Mega Ball 2026', start: '2026-06-13', end: '2026-06-14', spike: 6.0 },
  { name: 'ZYN Vogue Labs', start: '2026-02-01', end: '2026-09-30', spike: 1.0 },
  { name: 'ZYN Preview Ball', start: '2026-09-13', end: '2026-09-13', spike: 4.0 },
];

const PLATFORMS = [
  ['Facebook', 35], ['TikTok', 30], ['Instagram', 15],
  ['X', 8], ['YouTube', 5], ['Forums', 4], ['News', 3],
];

const CITIES = [
  [{ city: 'Manila', region: 'NCR' }, 18],
  [{ city: 'Quezon City', region: 'NCR' }, 12],
  [{ city: 'Makati', region: 'NCR' }, 10],
  [{ city: 'Cebu City', region: 'Central Visayas' }, 15],
  [{ city: 'Davao City', region: 'Davao Region' }, 10],
  [{ city: 'Baguio', region: 'CAR' }, 5],
  [{ city: 'Iloilo City', region: 'Western Visayas' }, 5],
  [{ city: 'Cagayan de Oro', region: 'Northern Mindanao' }, 4],
  [{ city: 'Angeles City', region: 'Central Luzon' }, 4],
  [{ city: 'Calamba', region: 'CALABARZON' }, 3],
  [{ city: 'Bacoor', region: 'CALABARZON' }, 2],
  [{ city: 'Boracay', region: 'Western Visayas' }, 3],
  [{ city: 'Siargao', region: 'Caraga' }, 2],
  [{ city: 'General Santos', region: 'SOCCSKSARGEN' }, 2],
  [{ city: 'Zamboanga City', region: 'Zamboanga Peninsula' }, 2],
  [{ city: 'Bacolod', region: 'Western Visayas' }, 3],
];

const LANGUAGES = [['Filipino', 35], ['Taglish', 30], ['English', 25], ['Cebuano', 10]];

const TOPICS = [
  'event experience', 'product & flavor', 'price & availability',
  'health & safety', 'age & legality', 'celebrity / LANU',
  'competitor comparison', 'other',
];

// Topic distribution weights (normal period)
const TOPIC_WEIGHTS_ZYN = [
  ['event experience', 25], ['product & flavor', 20], ['price & availability', 12],
  ['health & safety', 8], ['age & legality', 5], ['celebrity / LANU', 15],
  ['competitor comparison', 5], ['other', 10],
];

const TOPIC_WEIGHTS_PLOOM = [
  ['event experience', 15], ['product & flavor', 30], ['price & availability', 10],
  ['health & safety', 5], ['age & legality', 3], ['celebrity / LANU', 5],
  ['competitor comparison', 20], ['other', 12],
];

// Sentiment by topic
const SENTIMENT_BY_TOPIC = {
  'event experience': [['positive', 65], ['neutral', 25], ['negative', 10]],
  'product & flavor': [['positive', 45], ['neutral', 30], ['negative', 25]],
  'price & availability': [['negative', 55], ['neutral', 30], ['positive', 15]],
  'health & safety': [['negative', 60], ['neutral', 25], ['positive', 15]],
  'age & legality': [['negative', 70], ['neutral', 20], ['positive', 10]],
  'celebrity / LANU': [['positive', 70], ['neutral', 20], ['negative', 10]],
  'competitor comparison': [['neutral', 40], ['positive', 30], ['negative', 30]],
  'other': [['neutral', 50], ['positive', 30], ['negative', 20]],
};

// Emotion by sentiment
const EMOTION_BY_SENTIMENT = {
  positive: [['joy', 38], ['excitement', 34], ['trust', 18], ['surprise', 8], ['neutral', 2]],
  neutral: [['neutral', 40], ['trust', 25], ['surprise', 20], ['joy', 8], ['sadness', 7]],
  negative: [['anger', 28], ['disgust', 20], ['fear', 18], ['sadness', 26], ['surprise', 8]],
};

// ── Fictional handles ─────────────────────────────────────────────────────
const HANDLE_POOLS = {
  Facebook: [
    'Manila Nightlife Hub', 'Pinoy Vape Community', 'Cebu Events Daily',
    'Davao Lifestyle PH', 'Juan Dela Cruz', 'Maria Santos',
    'Kuya Tekno Reviews', 'Ate Beauty Tips PH', 'Tita Marge Reviews',
    'PH Party Scene', 'Boracay Vibes Official', 'Siargao Life PH',
    'Metro Manila Buzz', 'Iloilo Food & Fun', 'Baguio Cool Spots',
    'CDO Nightlife', 'Pampanga Eats', 'Laguna Living', 'Cavite Daily',
    'Bacolod Happenings', 'Gen Z Pilipinas', 'Tambay Corner PH',
    'Usapang Kalye', 'Trending Pinoy', 'Chismis Central PH',
    'Ka-Vape Forum PH', 'Lifestyle Manila', 'Event Junkies PH',
    'Pinoy Health Watch', 'Concerned Parents PH',
  ],
  TikTok: [
    '@manila.nightout', '@cebu.foodie', '@davao.lifestyle',
    '@pinoy.vape.hub', '@tita_reviews_ph', '@kuya_tech_ph',
    '@ate_beauty_tips', '@juan_vlogs_23', '@maria.clara.ph',
    '@boracay.vibes', '@siargao.surfer', '@metro.buzz.ph',
    '@iloilo.eats', '@baguio.cool', '@cdo.nightlife',
    '@pampanga.foodtrip', '@laguna.living', '@cavite.daily',
    '@bacolod.happenings', '@genz.pilipinas', '@tambay.corner',
    '@usapang.kalye', '@trending.pinoy', '@chismis.central',
    '@party.scene.ph', '@lifestyle.mnl', '@event.junkie.ph',
    '@pinoy.health.watch', '@concerned.parent.ph', '@vape.review.ph',
  ],
  Instagram: [
    '@manila_nightout', '@cebu_foodie', '@davao_lifestyle_ph',
    '@pinoy_vape_hub', '@tita_reviews', '@kuya_tech_reviews',
    '@ate_beauty', '@juan_vlogs', '@maria_clara_ph',
    '@boracay_vibes_', '@siargao_surfer_', '@metro_buzz_ph',
    '@iloilo_eats_', '@baguio_cool_', '@cdo_nightlife_',
    '@pampanga_food', '@laguna_living_', '@cavite_daily_',
    '@bacolod_happenings_', '@genz_pilipinas', '@tambay_corner_',
    '@usapang_kalye_', '@trending_pinoy_', '@chismis_central_',
    '@party_scene_ph', '@lifestyle_mnl_', '@event_junkie_ph',
    '@pinoy_health_watch_', '@concerned_parent_ph', '@vape_review_ph',
  ],
  X: [
    '@manila_nightout', '@pinoy_vape', '@tita_reviews_ph',
    '@kuya_tech_ph', '@juan_vlogs23', '@maria_clara',
    '@metro_buzz', '@trending_pinoy', '@chismis_central',
    '@genz_pinas', '@tambay_corner', '@usapang_kalye',
    '@ph_health_watch', '@concerned_parent', '@vape_review',
  ],
  YouTube: [
    'Manila Night Out TV', 'Pinoy Vape Reviews', 'Kuya Tech PH',
    'Ate Beauty Channel', 'Juan Vlogs', 'Cebu Foodie TV',
    'Davao Lifestyle Channel', 'PH Event Coverage', 'Trending Pinoy TV',
    'Vape Review PH', 'Health Watch PH', 'Concerned Citizens PH',
  ],
  Forums: [
    'Ka-Vape Forum', 'PH Lifestyle Hub', 'Manila Underground',
    'Pinoy Reddit Community', 'Cebu Online Forum', 'Davao Talk',
    'Vape Nation PH', 'Health Forum PH', 'Parent Talk PH',
    'Tambayan Online', 'Usapang Bayan', 'Chikahan Corner',
  ],
  News: [
    'PhilStar Digital', 'Rappler Tech', 'Manila Bulletin Lifestyle',
    'Inquirer.net', 'ABS-CBN Digital', 'GMA News Online',
    'CNN Philippines', 'BusinessWorld', 'The Philippine Star',
    'Sunstar Cebu', 'Mindanao Times', 'PNA News',
  ],
};

// Top voices — high-impact organic accounts
const TOP_VOICES = [
  { handle: '@manila.nightout', platform: 'TikTok', reachMult: 50, engMult: 40 },
  { handle: '@pinoy.vape.hub', platform: 'TikTok', reachMult: 40, engMult: 35 },
  { handle: '@tita_reviews_ph', platform: 'TikTok', reachMult: 35, engMult: 30 },
  { handle: 'Manila Nightlife Hub', platform: 'Facebook', reachMult: 30, engMult: 25 },
  { handle: '@cebu_foodie', platform: 'Instagram', reachMult: 25, engMult: 20 },
  { handle: 'Pinoy Vape Reviews', platform: 'YouTube', reachMult: 45, engMult: 15 },
  { handle: '@trending_pinoy', platform: 'X', reachMult: 20, engMult: 25 },
  { handle: 'Ka-Vape Forum', platform: 'Forums', reachMult: 15, engMult: 10 },
  { handle: 'PhilStar Digital', platform: 'News', reachMult: 60, engMult: 5 },
  { handle: '@genz.pilipinas', platform: 'TikTok', reachMult: 30, engMult: 35 },
];

// ── Text templates ────────────────────────────────────────────────────────
const TEXTS = {
  'event experience': {
    English: [
      'Just came from the {event}, the vibe was absolutely insane! #ZYN #ZYNPhilippines',
      'The {event} was one of the best events I\'ve been to this year. Well organized!',
      '{event} did not disappoint. Great music, great crowd, great everything.',
      'Had an amazing time at {event}! Can\'t wait for the next one #ZYNMegaBall',
      'The setup at {event} was next level. ZYN really knows how to throw a party.',
      'Best event of the summer goes to {event} hands down #ZYNSummer',
      '{event} was packed! Everyone was having a great time.',
    ],
    Filipino: [
      'Grabe yung {event}! Sobrang saya! Hindi ko makakalimutan! #ZYN',
      'Ang ganda ng {event}! Sulit na sulit ang punta! #ZYNPhilippines',
      'Nag-enjoy talaga kami sa {event}. Sana may next ulit!',
      'Ang laki ng {event}! Daming tao pero masaya pa rin! #ZYNMegaBall',
      'Sobrang worth it pumunta sa {event}. Ang galing ng production!',
      'Ang saya ng {event}! Best event ng taon para sa akin!',
    ],
    Taglish: [
      '{event} was so lit! Best event ever talaga! #ZYN #ZYNPhilippines',
      'OMG the {event} was amazing! Sobrang enjoy ko! #ZYNMegaBall',
      'Had the best time sa {event}! The vibes were immaculate talaga',
      'Went to {event} last night and it was everything! Grabe ang production!',
      '{event} exceeded my expectations! So worth it pumunta! #ZYNSummer',
      'The {event} experience was top tier! Sana every month may ganito!',
    ],
    Cebuano: [
      'Nindot kaayo ang {event}! Lingaw kaayo mi! #ZYN',
      'Grabe ka nindot sa {event}! Worth it jud ang pag-adto!',
      'Ang {event} maoy best event sa Cebu this year! #ZYNPhilippines',
      'Lingaw kaayo sa {event}! Daghan kaayo tao pero okay ra!',
    ],
  },
  'product & flavor': {
    English: [
      'Finally tried ZYN and I\'m impressed with the flavor options. The mint is clean.',
      'ZYN pouches are actually pretty good. Smooth nicotine hit without the smoke.',
      'Not sure about the new ZYN flavor. Tastes a bit artificial to me.',
      'ZYN is my go-to now. Way better than traditional cigarettes.',
      'The ZYN citrus flavor is underrated. Give it a try! #SmokeFree',
      'Tried ZYN for the first time. The flavor is okay but the buzz is strong.',
      'ZYN packaging is sleek. Love the compact design.',
    ],
    Filipino: [
      'Nag-try ako ng ZYN, okay naman yung flavor. Masarap yung mint!',
      'Ang sarap ng ZYN citrus! Ito na paborito ko! #ZYN',
      'Hindi ko trip yung bagong flavor ng ZYN. Parang artificial.',
      'Mas gusto ko ZYN kesa sa sigarilyo. Walang usok!',
      'Ang ganda ng packaging ng ZYN. Compact at madaling dalhin.',
      'Sulit ba ang ZYN? Nag-iisip ako mag-switch from smoking.',
    ],
    Taglish: [
      'ZYN mint flavor is so refreshing! Mas gusto ko to kesa sa iba',
      'Tried all ZYN flavors na and citrus is still the best for me',
      'The ZYN experience is different talaga. No smoke, no smell, just vibes',
      'Not gonna lie, ZYN pouches are actually legit. Clean nicotine hit!',
      'ZYN is changing the game talaga. Goodbye cigarettes! #NicotinePouch',
    ],
    Cebuano: [
      'Nindot ang flavor sa ZYN! Lami ang mint!',
      'Nag-try ko sa ZYN, okay ra man. Lahi sa sigarilyo.',
      'Pila na ba ang presyo sa ZYN karon? Gusto nako mo-try.',
    ],
  },
  'price & availability': {
    English: [
      'ZYN prices went up again. Getting expensive for a daily habit.',
      'Where can I buy ZYN in {city}? Can\'t find it anywhere!',
      'ZYN is too expensive compared to regular cigarettes. Not worth it.',
      'Finally found ZYN at the convenience store near me! Limited stocks though.',
      'Why is ZYN so hard to find outside Metro Manila? We need more stores!',
      'ZYN price increase is ridiculous. Might switch to something cheaper.',
      'Wish ZYN was more affordable. Great product but the price is a barrier.',
    ],
    Filipino: [
      'Magkano na ba ZYN ngayon? Ang mahal na! Nagtaas na naman!',
      'Saan ba makakabili ng ZYN sa {city}? Wala akong mahanap!',
      'Ang mahal ng ZYN! Hindi practical sa budget ko.',
      'Bakit ang hirap hanapin ng ZYN sa probinsya? Sa Manila lang ba meron?',
      'Nagtaas na naman presyo ng ZYN. Kailan ba titigil?',
      'Sana mag-sale ang ZYN. Ang mahal kasi talaga.',
    ],
    Taglish: [
      'ZYN prices are getting out of hand na. Ang mahal na talaga!',
      'Can\'t find ZYN anywhere sa {city}! Laging out of stock!',
      'The price of ZYN is too much na. Might go back to smoking tbh',
      'Sana mas maraming stores mag-carry ng ZYN. Hirap hanapin!',
      'ZYN is great but the price point is not sustainable for me',
    ],
    Cebuano: [
      'Pila na ba ang presyo sa ZYN karon? Mahal na kaayo!',
      'Asa man makapalit ug ZYN diri sa Cebu? Wala man ko makita!',
      'Mahal ra kaayo ang ZYN. Dili practical sa budget.',
    ],
  },
  'health & safety': {
    English: [
      'Is ZYN actually safer than smoking? I need real studies, not marketing.',
      'Worried about the long-term effects of ZYN. Anyone have info?',
      'ZYN says it\'s smoke-free but is it really safe? #HealthRisk',
      'My doctor said nicotine pouches like ZYN are still addictive. Be careful.',
      'Just because ZYN has no smoke doesn\'t mean it\'s harmless. Do your research.',
      'Concerned about ZYN and oral health. Anyone experienced gum problems?',
      'ZYN might be less harmful than cigarettes but it\'s still nicotine addiction.',
    ],
    Filipino: [
      'Safe ba talaga ang ZYN? O marketing lang? Nag-aalala ako.',
      'Ang sabi ng doktor ko, addictive pa rin ang ZYN kahit walang usok.',
      'Natatakot ako sa long-term effects ng ZYN. May studies ba?',
      'Hindi porke walang usok, safe na. Mag-ingat sa ZYN.',
      'Bakit walang warning label ang ZYN tungkol sa health risks?',
      'Nag-aalala ako sa kalusugan ng mga gumagamit ng ZYN.',
    ],
    Taglish: [
      'Is ZYN really safe? Parang ang daming claims pero walang proof',
      'My friend got addicted to ZYN. It\'s still nicotine guys, be careful!',
      'ZYN is marketed as safer pero is it really? I have my doubts',
      'The health effects of ZYN are still unknown. Natatakot ako honestly',
      'Just because it\'s smoke-free doesn\'t mean it\'s risk-free. Think about it.',
    ],
    Cebuano: [
      'Safe ba jud ang ZYN? Nabalaka ko sa health effects.',
      'Ang doktor nako nag-ingon nga addictive gihapon ang ZYN.',
      'Dili tungod kay walay aso, safe na. Mag-amping sa ZYN.',
    ],
  },
  'age & legality': {
    English: [
      'Saw teenagers buying ZYN at the mall. Where are the age checks?',
      'ZYN needs stricter age verification. Too many minors using it.',
      'Is it even legal to sell ZYN to minors? This needs regulation!',
      'My 16-year-old nephew is using ZYN. This is a problem! #UnderageVaping',
      'ZYN marketing targets young people. This should be illegal!',
      'Schools should ban ZYN. Kids are bringing it to class!',
      'The government needs to regulate ZYN sales to minors immediately.',
    ],
    Filipino: [
      'Bakit ang daming bata na gumagamit ng ZYN? Hindi ba bawal?',
      'Nakita ko mga teenager bumibili ng ZYN. Walang age check!',
      'Dapat i-regulate ang ZYN! Ang daming menor de edad na gumagamit!',
      'Anak ko nakita ko may ZYN sa bag. 15 years old pa lang!',
      'Bawal ba ang ZYN sa mga bata? Kailangan ng batas para dito!',
      'Ang daming estudyante gumagamit ng ZYN sa school. Nakakatakot!',
    ],
    Taglish: [
      'So many kids are using ZYN na! Where are the regulations?! #Bawal',
      'Saw a group of high school students with ZYN. This is alarming!',
      'ZYN should have stricter age verification. Ang daming bata gumagamit!',
      'My kid\'s classmates are all using ZYN. Nakakatakot as a parent!',
      'The ZYN age problem is getting worse. Government needs to act now!',
    ],
    Cebuano: [
      'Daghan na kaayo bata gamit ZYN! Dili ba bawal ni?',
      'Nakita nako mga teenager nagpalit ug ZYN. Walay age check!',
      'Kinahanglan i-regulate ang ZYN! Daghan menor de edad naggamit!',
    ],
  },
  'celebrity / LANU': {
    English: [
      'Heart Evangelista at the ZYN event looking stunning as always!',
      'Donny Pangilinan repping ZYN! Love to see it! #ZYNPreviewBall',
      'Niana Guerrero\'s ZYN content is so creative. She makes it look cool!',
      'The ZYN x celebrity collabs are fire! Great marketing strategy.',
      'Saw Maris Racal at the ZYN Mega Ball. She was gorgeous!',
      'ZYN really got the best influencers for their campaigns.',
    ],
    Filipino: [
      'Ang ganda ni Heart Evangelista sa ZYN event! Sobrang elegant!',
      'Si Donny Pangilinan ang bago ambassador ng ZYN! Gwapo talaga!',
      'Nakita ko si Niana Guerrero sa ZYN Mega Ball! Ang cute!',
      'Ang gagaling ng mga influencers ng ZYN! Sulit ang marketing!',
      'Si Maris Racal sa ZYN event, ang pretty talaga!',
    ],
    Taglish: [
      'Heart Evangelista at the ZYN event was everything! So gorgeous naman!',
      'Donny Pangilinan for ZYN is the perfect choice! Bagay na bagay!',
      'Niana Guerrero\'s ZYN content is so fun! Love her energy talaga!',
      'The celebrity lineup at {event} was insane! Star-studded talaga!',
      'ZYN really knows how to pick their ambassadors. All A-listers!',
    ],
    Cebuano: [
      'Gwapa kaayo si Heart Evangelista sa ZYN event!',
      'Si Donny Pangilinan ambassador sa ZYN! Gwapo jud!',
      'Nindot ang mga celebrity sa ZYN Mega Ball!',
    ],
  },
  'competitor comparison': {
    English: [
      'Tried both ZYN and Ploom. ZYN has better flavors but Ploom\'s device is sleeker.',
      'Ploom vs ZYN: honestly Ploom\'s design is more premium looking.',
      'ZYN is better than Ploom for nicotine pouches. No contest.',
      'Switching from Ploom to ZYN. Better flavor selection.',
      'Ploom has better marketing in my area but ZYN tastes better.',
      'ZYN or Ploom? Both have pros and cons. Hard to choose.',
    ],
    Filipino: [
      'Mas maganda ang ZYN kesa sa Ploom pagdating sa flavor.',
      'Ploom vs ZYN — mas maganda ang design ng Ploom pero mas masarap ang ZYN.',
      'Nag-switch ako from Ploom to ZYN. Mas maraming flavor choices!',
      'Ploom o ZYN? Pareho naman may pros and cons.',
    ],
    Taglish: [
      'ZYN vs Ploom — for me ZYN wins sa flavor pero Ploom is sleeker',
      'Tried Ploom and ZYN. Honestly, ZYN is better overall for me',
      'Ploom\'s design is nicer pero ZYN has more flavor options naman',
      'Can\'t decide between ZYN and Ploom. Both are good naman eh',
    ],
    Cebuano: [
      'Mas nindot ang ZYN kaysa Ploom sa flavor.',
      'Ploom vs ZYN — lahi ra ang design pero pareho ra man.',
    ],
  },
  other: {
    English: [
      'Saw a ZYN ad on my feed. Interesting product concept.',
      'ZYN Philippines is growing fast. Interesting to watch.',
      'Anyone else notice ZYN is everywhere now?',
      'ZYN booth at the mall was giving out samples.',
      'The ZYN brand aesthetic is really clean and modern.',
    ],
    Filipino: [
      'Nakita ko ang ZYN sa mall. Ang daming tao sa booth nila.',
      'Ang bilis lumaki ng ZYN sa Pilipinas. Dami na gumagamit.',
      'May ZYN ad sa feed ko. Interesting ang product.',
      'Ang ganda ng branding ng ZYN. Modern at malinis.',
    ],
    Taglish: [
      'ZYN is everywhere na! Ang bilis ng growth nila sa PH',
      'Saw a ZYN booth sa mall. Ang daming freebies!',
      'The ZYN brand is really growing fast here in the Philippines',
    ],
    Cebuano: [
      'Nakita nako ang ZYN sa mall. Daghan tao sa booth.',
      'Kusog kaayo mo-grow ang ZYN diri sa Pilipinas.',
    ],
  },
};

// Ploom-specific texts
const PLOOM_TEXTS = {
  English: [
    'Ploom\'s new device looks really premium. Might give it a try.',
    'Ploom PH is stepping up their game with the Manila Gin Festival collab.',
    'The Ploom Aqua Halo is interesting. Fresh design concept.',
    'Ploom\'s events are more exclusive and curated. Different vibe from ZYN.',
    'Ploom Special Edition Red looks amazing. Love the design.',
    'Ploom is targeting a more premium market segment. Smart move.',
  ],
  Filipino: [
    'Ang ganda ng bagong Ploom device! Premium talaga ang dating.',
    'Ploom sa Manila Gin Festival, ang classy ng setup nila.',
    'Maganda ang Ploom Aqua Halo. Fresh ang design.',
    'Mas exclusive ang events ng Ploom. Iba ang vibe.',
  ],
  Taglish: [
    'Ploom\'s design is really premium looking! Mas sleek kesa sa iba',
    'The Ploom x Manila Gin Festival collab was classy talaga',
    'Ploom is going for that premium market. Smart strategy naman',
    'Ploom Special Edition Red is fire! Ang ganda ng design!',
  ],
  Cebuano: [
    'Nindot ang design sa Ploom! Premium kaayo tan-awon.',
    'Ploom sa Manila Gin Festival, classy kaayo.',
  ],
};

// Hashtags by topic
const HASHTAGS = {
  'event experience': ['#ZYN', '#ZYNPhilippines', '#ZYNMegaBall', '#ZYNSummer', '#PreviewBall', '#ZYNMegaBall2026'],
  'product & flavor': ['#ZYN', '#NicotinePouch', '#SmokeFree', '#ZYNPhilippines', '#VapeLife'],
  'price & availability': ['#ZYN', '#ZYNPhilippines', '#Mahal'],
  'health & safety': ['#HealthRisk', '#ZYN', '#NicotineAddiction', '#SmokeFree'],
  'age & legality': ['#Bawal', '#UnderageVaping', '#ZYN', '#RegulateNow', '#ProtectTheYouth'],
  'celebrity / LANU': ['#ZYN', '#ZYNMegaBall', '#PreviewBall', '#ZYNPhilippines', '#Celebrity'],
  'competitor comparison': ['#ZYN', '#Ploom', '#NicotinePouch', '#VapeLife'],
  other: ['#ZYN', '#ZYNPhilippines'],
};

// ── Generate mentions ─────────────────────────────────────────────────────
function generateDate() {
  const dayOffset = randInt(0, TOTAL_DAYS);
  const d = new Date(PERIOD_START.getTime() + dayOffset * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * Pick a campaign context first, then derive the date.
 * This produces realistic event spikes without letting long-running
 * programmes (Vogue Labs) absorb the whole calendar.
 */
const CAMPAIGN_CONTEXT_WEIGHTS = [
  ['ZYN Mega Ball 2026', 20],
  ['ZYN Preview Ball', 8],
  ['ZYN Summer in Boracay', 10],
  ['ZYN Summer in Siargao', 7],
  ['ZYN Summer Cebu', 7],
  ['ZYN Vogue Labs', 6],
  ['__none__', 42],
];

function campaignContext() {
  const name = weightedPick(CAMPAIGN_CONTEXT_WEIGHTS);
  if (name === '__none__') return { campaign: null, date: generateDate() };
  const c = CAMPAIGNS.find(x => x.name === name);
  const start = new Date(c.start).getTime();
  const end = new Date(c.end).getTime();
  // 70% inside the window, 30% in the following fortnight (afterglow)
  let t;
  if (rand() < 0.7) {
    t = start + rand() * (end - start);
  } else {
    t = end + rand() * 14 * 86400000;
  }
  const d = new Date(t);
  if (d < PERIOD_START) return { campaign: c, date: PERIOD_START.toISOString().slice(0, 10) };
  if (d > PERIOD_END) return { campaign: c, date: PERIOD_END.toISOString().slice(0, 10) };
  return { campaign: c, date: d.toISOString().slice(0, 10) };
}

function isPostMegaBall(dateStr) {
  const d = new Date(dateStr);
  const megaBallEnd = new Date('2026-06-14');
  const twoWeeksAfter = new Date('2026-06-28');
  return d >= megaBallEnd && d <= twoWeeksAfter;
}

function isPriceComplaintPeriod(dateStr) {
  const d = new Date(dateStr);
  return d >= new Date('2026-08-01') && d <= new Date('2026-09-30');
}

function generateMentions() {
  const mentions = [];
  const TARGET = 1500;

  for (let i = 0; i < TARGET; i++) {
    const id = `S${String(i + 1).padStart(4, '0')}`;

    // Pick campaign context first — this drives both date and copy.
    const ctx = campaignContext();
    const date = ctx.date;
    const campaign = ctx.campaign;

    const isPloom = rand() < 0.15;
    const brand = isPloom ? 'Ploom' : 'ZYN';
    const platform = weightedPick(PLATFORMS);
    const language = weightedPick(LANGUAGES);
    const author = pick(HANDLE_POOLS[platform] || HANDLE_POOLS.Facebook);

    // Determine topic with special period adjustments
    let topic;
    if (isPloom) {
      topic = weightedPick(TOPIC_WEIGHTS_PLOOM);
    } else {
      // Spike age & legality after Mega Ball
      if (isPostMegaBall(date) && rand() < 0.35) {
        topic = 'age & legality';
      } else if (isPriceComplaintPeriod(date) && rand() < 0.25) {
        topic = 'price & availability';
      } else {
        topic = weightedPick(TOPIC_WEIGHTS_ZYN);
      }
    }

    // Generate text
    let text;
    if (isPloom) {
      const langTexts = PLOOM_TEXTS[language] || PLOOM_TEXTS.English;
      text = pick(langTexts);
    } else {
      const topicTexts = TEXTS[topic];
      const langTexts = topicTexts[language] || topicTexts.English;
      text = pick(langTexts);
    }

    // Replace placeholders
    const eventNames = ['ZYN Mega Ball 2026', 'ZYN Summer in Boracay', 'ZYN Summer in Siargao', 'ZYN Summer Cebu', 'ZYN Preview Ball', 'ZYN Vogue Labs'];
    if (campaign) {
      text = text.replace('{event}', campaign.name);
    } else {
      text = text.replace('{event}', pick(eventNames));
    }

    // Geo
    let city = null, region = null;
    if (rand() < 0.6) {
      const geo = weightedPick(CITIES);
      city = geo.city;
      region = geo.region;
    }
    text = text.replace('{city}', city || pick(['Cebu', 'Davao', 'Manila', 'Makati', 'BGC']));

    // Add hashtags sometimes
    if (rand() < 0.3) {
      const topicTags = HASHTAGS[topic] || HASHTAGS.other;
      const tag = pick(topicTags);
      if (!text.includes(tag)) text += ' ' + tag;
    }

    // Reach & engagement
    const isTopVoice = TOP_VOICES.find(v => v.handle === author && v.platform === platform);
    let reach, engagement;
    if (isTopVoice) {
      reach = randInt(5000, 50000) * isTopVoice.reachMult;
      engagement = Math.round(reach * (rand() * 0.04 + 0.01) * (isTopVoice.engMult / 10));
    } else if (rand() < 0.02) {
      // Viral post
      reach = randInt(500000, 2000000);
      engagement = Math.round(reach * (rand() * 0.03 + 0.01));
    } else {
      reach = randInt(100, 50000);
      engagement = Math.max(1, Math.round(reach * (rand() * 0.04 + 0.005)));
    }

    // Views for video platforms
    let views = null;
    if (['TikTok', 'YouTube'].includes(platform) || (platform === 'Instagram' && rand() < 0.3)) {
      views = Math.round(reach * (rand() * 3.5 + 1.5));
    }

    mentions.push({
      mention_id: id,
      date,
      brand,
      platform,
      author,
      text,
      city,
      region,
      language,
      reach,
      engagement,
      views,
      is_lanu: false,
    });
  }

  // Sort by date
  mentions.sort((a, b) => a.date.localeCompare(b.date));
  return mentions;
}

// ── Generate AI tags ──────────────────────────────────────────────────────
function generateTags(mentions) {
  const tags = [];
  for (const m of mentions) {
    // Determine topic (already embedded in generation logic, but we re-derive for tags)
    let topic;
    const text = m.text.toLowerCase();

    if (m.brand === 'Ploom') {
      if (text.includes('design') || text.includes('premium') || text.includes('sleek')) topic = 'product & flavor';
      else if (text.includes('event') || text.includes('festival')) topic = 'event experience';
      else if (text.includes('zyn') || text.includes('vs') || text.includes('compare')) topic = 'competitor comparison';
      else topic = weightedPick(TOPIC_WEIGHTS_PLOOM);
    } else {
      if (text.includes('event') || text.includes('ball') || text.includes('summer') || text.includes('saya') || text.includes('lingaw') || text.includes('vibe')) topic = 'event experience';
      else if (text.includes('flavor') || text.includes('taste') || text.includes('sarap') || text.includes('lami') || text.includes('pouch') || text.includes('device') || text.includes('packaging')) topic = 'product & flavor';
      else if (text.includes('price') || text.includes('mahal') || text.includes('presyo') || text.includes('buy') || text.includes('find') || text.includes('stock') || text.includes('afford') || text.includes('expensive')) topic = 'price & availability';
      else if (text.includes('safe') || text.includes('health') || text.includes('doctor') || text.includes('addict') || text.includes('harm') || text.includes('cancer') || text.includes('risk') || text.includes('kalusugan') || text.includes('natatakot')) topic = 'health & safety';
      else if (text.includes('bata') || text.includes('minor') || text.includes('underage') || text.includes('teenager') || text.includes('school') || text.includes('bawal') || text.includes('age') || text.includes('kid') || text.includes('menor')) topic = 'age & legality';
      else if (text.includes('heart') || text.includes('donny') || text.includes('niana') || text.includes('maris') || text.includes('celebrity') || text.includes('influencer') || text.includes('ambassador') || text.includes('gwapo') || text.includes('gorgeous')) topic = 'celebrity / LANU';
      else if (text.includes('ploom') || text.includes('vs') || text.includes('compare') || text.includes('switch')) topic = 'competitor comparison';
      else topic = 'other';
    }

    const sentiment = weightedPick(SENTIMENT_BY_TOPIC[topic] || SENTIMENT_BY_TOPIC.other);
    const emotion = weightedPick(EMOTION_BY_SENTIMENT[sentiment]);
    const confidence = weightedPick([['high', 60], ['medium', 30], ['low', 10]]);

    tags.push({
      mention_id: m.mention_id,
      sentiment,
      emotion,
      topic,
      confidence,
    });
  }
  return tags;
}

// ── Compute stats for summaries ───────────────────────────────────────────
function computeStats(mentions, tags) {
  const total = mentions.length;
  const zynMentions = mentions.filter(m => m.brand === 'ZYN');
  const ploomMentions = mentions.filter(m => m.brand === 'Ploom');
  const zynTags = tags.filter(t => zynMentions.find(m => m.mention_id === t.mention_id));
  const ploomTags = tags.filter(t => ploomMentions.find(m => m.mention_id === t.mention_id));

  const sentimentCount = { positive: 0, neutral: 0, negative: 0 };
  const emotionCount = {};
  const topicCount = {};
  const platformCount = {};
  const languageCount = {};
  const cityCount = {};

  for (const t of zynTags) {
    sentimentCount[t.sentiment]++;
    emotionCount[t.emotion] = (emotionCount[t.emotion] || 0) + 1;
    topicCount[t.topic] = (topicCount[t.topic] || 0) + 1;
  }

  for (const m of zynMentions) {
    platformCount[m.platform] = (platformCount[m.platform] || 0) + 1;
    languageCount[m.language] = (languageCount[m.language] || 0) + 1;
    if (m.city) cityCount[m.city] = (cityCount[m.city] || 0) + 1;
  }

  const zynTotal = zynMentions.length;
  const posPct = ((sentimentCount.positive / zynTotal) * 100).toFixed(1);
  const neuPct = ((sentimentCount.neutral / zynTotal) * 100).toFixed(1);
  const negPct = ((sentimentCount.negative / zynTotal) * 100).toFixed(1);
  const netScore = (parseFloat(posPct) - parseFloat(negPct)).toFixed(1);

  // Weekly volumes
  const weeklyVol = {};
  for (const m of zynMentions) {
    const d = new Date(m.date);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    weeklyVol[key] = (weeklyVol[key] || 0) + 1;
  }
  const peakWeek = Object.entries(weeklyVol).sort((a, b) => b[1] - a[1])[0];

  // Top platform
  const topPlatform = Object.entries(platformCount).sort((a, b) => b[1] - a[1]);

  // Dominant emotion
  const sortedEmotions = Object.entries(emotionCount).sort((a, b) => b[1] - a[1]);

  // Top topics
  const sortedTopics = Object.entries(topicCount).sort((a, b) => b[1] - a[1]);

  return {
    total, zynTotal, ploomTotal: ploomMentions.length,
    sentimentCount, emotionCount, topicCount, platformCount, languageCount, cityCount,
    posPct, neuPct, negPct, netScore,
    peakWeek, topPlatform, sortedEmotions, sortedTopics, weeklyVol,
  };
}

// ── Generate summaries ────────────────────────────────────────────────────
function generateSummaries(stats) {
  const now = new Date().toISOString();
  const base = { provider: 'seed', model: 'pre-generated', prompt_version: '1.0', approved_by: 'Bryan', approved_at: now };

  const topPlatformName = stats.topPlatform[0]?.[0] || 'Facebook';
  const topPlatformPct = stats.topPlatform[0] ? ((stats.topPlatform[0][1] / stats.zynTotal) * 100).toFixed(1) : '0';
  const secondPlatform = stats.topPlatform[1]?.[0] || 'TikTok';
  const thirdPlatform = stats.topPlatform[2]?.[0] || 'Instagram';
  const peakWeekDate = stats.peakWeek?.[0] || '2026-06-09';
  const peakWeekVol = stats.peakWeek?.[1] || 0;

  // Nearest campaign to the peak week — used to explain the spike honestly.
  let peakTrigger = 'a campaign activation';
  let peakDist = Infinity;
  {
    const pd = new Date(peakWeekDate).getTime();
    for (const c of CAMPAIGNS) {
      const cs = new Date(c.start).getTime();
      const ce = new Date(c.end).getTime();
      const dist = pd >= cs && pd <= ce ? 0 : Math.min(Math.abs(pd - cs), Math.abs(pd - ce));
      if (dist < peakDist) { peakDist = dist; peakTrigger = c.name; }
    }
  }
  const peakTriggerPhrase = peakDist <= 7 * 86400000
    ? `coinciding with ${peakTrigger}`
    : `with no single campaign inside that week (nearest: ${peakTrigger})`;
  const topEmotion = stats.sortedEmotions[0]?.[0] || 'joy';
  const topTopic = stats.sortedTopics[0]?.[0] || 'event experience';

  return {
    sections: {
      headline_strip: {
        draft: `ZYN Philippines generated ${stats.zynTotal.toLocaleString()} tracked mentions across the monitoring period, with a net sentiment of +${stats.netScore} points (${stats.posPct}% positive vs ${stats.negPct}% negative). The dominant emotion cluster is ${topEmotion}, reflecting the strong event-driven conversation around ZYN campaigns. ${topPlatformName} leads platform share at ${topPlatformPct}%, followed by ${secondPlatform} and ${thirdPlatform}. The peak conversation week was ${peakWeekDate} with ${peakWeekVol} mentions, ${peakTriggerPhrase}.`,
        final: `ZYN Philippines generated ${stats.zynTotal.toLocaleString()} tracked mentions across the monitoring period, with a net sentiment of +${stats.netScore} points (${stats.posPct}% positive vs ${stats.negPct}% negative). The dominant emotion cluster is ${topEmotion}, reflecting the strong event-driven conversation around ZYN campaigns. ${topPlatformName} leads platform share at ${topPlatformPct}%, followed by ${secondPlatform} and ${thirdPlatform}. The peak conversation week was ${peakWeekDate} with ${peakWeekVol} mentions, ${peakTriggerPhrase}.`,
        generated_at: now, ...base,
      },
      brand_sentiment: {
        draft: `Net sentiment sits at +${stats.netScore}, with positive mentions (${stats.posPct}%) outpacing negative (${stats.negPct}%) by a comfortable margin. The neutral share at ${stats.neuPct}% is typical for a brand with strong event-driven conversation — most neutral mentions are informational or news coverage. The emotion mix skews toward ${topEmotion} and excitement, driven by campaign activations. Recommend monitoring the negative sentiment cluster around health and age concerns, which could erode the positive baseline if left unaddressed.`,
        final: `Net sentiment sits at +${stats.netScore}, with positive mentions (${stats.posPct}%) outpacing negative (${stats.negPct}%) by a comfortable margin. The neutral share at ${stats.neuPct}% is typical for a brand with strong event-driven conversation — most neutral mentions are informational or news coverage. The emotion mix skews toward ${topEmotion} and excitement, driven by campaign activations. Recommend monitoring the negative sentiment cluster around health and age concerns, which could erode the positive baseline if left unaddressed.`,
        generated_at: now, ...base,
      },
      trending_issues: {
        draft: `"${topTopic}" dominates the conversation at ${stats.topicCount[topTopic] || 0} mentions, reflecting ZYN's event-heavy strategy. "Product & flavor" runs second with genuine consumer interest in the product line. The concerning signals are "health & safety" (${stats.topicCount['health & safety'] || 0} mentions) and "age & legality" (${stats.topicCount['age & legality'] || 0} mentions) — both carry predominantly negative sentiment. The age & legality cluster spiked notably in the two weeks following the Mega Ball 2026 event. Recommend preparing a proactive responsibility messaging framework before the next major activation.`,
        final: `"${topTopic}" dominates the conversation at ${stats.topicCount[topTopic] || 0} mentions, reflecting ZYN's event-heavy strategy. "Product & flavor" runs second with genuine consumer interest in the product line. The concerning signals are "health & safety" (${stats.topicCount['health & safety'] || 0} mentions) and "age & legality" (${stats.topicCount['age & legality'] || 0} mentions) — both carry predominantly negative sentiment. The age & legality cluster spiked notably in the two weeks following the Mega Ball 2026 event. Recommend preparing a proactive responsibility messaging framework before the next major activation.`,
        generated_at: now, ...base,
      },
      geographic: {
        draft: `Conversation is heavily Metro Manila-centric — Manila, Quezon City, and Makati account for the largest share of geo-tagged mentions. Cebu City is the strongest regional market, consistent with the ZYN Summer Cebu campaign activation. Davao City shows steady organic conversation. Only about 60% of mentions carry geo-tags, so regional volumes are directional rather than absolute. Recommend expanding event activations to Visayas and Mindanao cities where organic interest already exists.`,
        final: `Conversation is heavily Metro Manila-centric — Manila, Quezon City, and Makati account for the largest share of geo-tagged mentions. Cebu City is the strongest regional market, consistent with the ZYN Summer Cebu campaign activation. Davao City shows steady organic conversation. Only about 60% of mentions carry geo-tags, so regional volumes are directional rather than absolute. Recommend expanding event activations to Visayas and Mindanao cities where organic interest already exists.`,
        generated_at: now, ...base,
      },
      conversation_volume: {
        draft: `Weekly mention volume runs a baseline of 20–35 mentions per week, with clear spikes around campaign events. The ZYN Mega Ball 2026 (week of June 9) drove the highest peak at ${peakWeekVol} mentions — roughly ${(peakWeekVol / 30 * 100 - 100).toFixed(0)}% above baseline. The Summer circuit (Cebu, Siargao, Boracay) created a sustained elevated period from March through May. Volume dips during non-campaign weeks suggest the brand conversation is still heavily event-dependent. Recommend building always-on content to raise the organic baseline.`,
        final: `Weekly mention volume runs a baseline of 20–35 mentions per week, with clear spikes around campaign events. The ZYN Mega Ball 2026 (week of June 9) drove the highest peak at ${peakWeekVol} mentions — roughly ${(peakWeekVol / 30 * 100 - 100).toFixed(0)}% above baseline. The Summer circuit (Cebu, Siargao, Boracay) created a sustained elevated period from March through May. Volume dips during non-campaign weeks suggest the brand conversation is still heavily event-dependent. Recommend building always-on content to raise the organic baseline.`,
        generated_at: now, ...base,
      },
      platform_sentiment: {
        draft: `${topPlatformName} carries the highest volume share at ${topPlatformPct}%, with a sentiment profile that mirrors the overall brand average. TikTok skews younger and more positive — event content performs especially well here. Instagram shows the highest positive-to-negative ratio, driven by celebrity and lifestyle content. X/Twitter is the most polarized platform with the highest negative share, as health and regulatory discussions concentrate there. Forums carry low volume but disproportionately negative sentiment — this is where detailed health concerns surface. Recommend platform-specific content strategies rather than cross-posting.`,
        final: `${topPlatformName} carries the highest volume share at ${topPlatformPct}%, with a sentiment profile that mirrors the overall brand average. TikTok skews younger and more positive — event content performs especially well here. Instagram shows the highest positive-to-negative ratio, driven by celebrity and lifestyle content. X/Twitter is the most polarized platform with the highest negative share, as health and regulatory discussions concentrate there. Forums carry low volume but disproportionately negative sentiment — this is where detailed health concerns surface. Recommend platform-specific content strategies rather than cross-posting.`,
        generated_at: now, ...base,
      },
      narrative_map: {
        draft: `The brand-positive narrative stack is anchored by the Mega Ball event series, which generates the highest volume and most positive sentiment of any single topic. Celebrity endorsements provide a reliable secondary positive driver. On the risk side, "underage access concerns" is the single highest-priority narrative — it spiked after the Mega Ball and carries strong anger/disgust emotions. Health risk anxiety is a steady-burn concern that could escalate with any negative news coverage. Price resistance is growing in the August-September period. Recommend addressing the age & legality narrative proactively before it becomes a media story.`,
        final: `The brand-positive narrative stack is anchored by the Mega Ball event series, which generates the highest volume and most positive sentiment of any single topic. Celebrity endorsements provide a reliable secondary positive driver. On the risk side, "underage access concerns" is the single highest-priority narrative — it spiked after the Mega Ball and carries strong anger/disgust emotions. Health risk anxiety is a steady-burn concern that could escalate with any negative news coverage. Price resistance is growing in the August-September period. Recommend addressing the age & legality narrative proactively before it becomes a media story.`,
        generated_at: now, ...base,
      },
      top_voices: {
        draft: `The top organic voices are dominated by lifestyle and vape-review accounts on TikTok and Facebook. @manila.nightout leads in combined reach and engagement, functioning as an unofficial brand amplifier through event coverage. Pinoy Vape Reviews on YouTube provides the most detailed product commentary. PhilStar Digital carries the highest single-post reach but low engagement — typical of news coverage. No strongly negative top voices appear in the top 10, but Ka-Vape Forum hosts the most detailed health-concern discussions. Recommend engaging the top positive voices with early event access to maximize organic amplification.`,
        final: `The top organic voices are dominated by lifestyle and vape-review accounts on TikTok and Facebook. @manila.nightout leads in combined reach and engagement, functioning as an unofficial brand amplifier through event coverage. Pinoy Vape Reviews on YouTube provides the most detailed product commentary. PhilStar Digital carries the highest single-post reach but low engagement — typical of news coverage. No strongly negative top voices appear in the top 10, but Ka-Vape Forum hosts the most detailed health-concern discussions. Recommend engaging the top positive voices with early event access to maximize organic amplification.`,
        generated_at: now, ...base,
      },
      language_sentiment: {
        draft: `Filipino-language mentions carry the highest volume share at approximately 35%, with a sentiment profile close to the overall average. Taglish (30%) skews slightly more positive — this is the language of event excitement and celebrity commentary. English (25%) is more neutral, dominated by news and informational content. Cebuano (10%) shows strong positive sentiment, likely driven by the ZYN Summer Cebu activation. The negative sentiment in Filipino-language mentions is concentrated in health and age concerns — these are the conversations that matter most for reputation management.`,
        final: `Filipino-language mentions carry the highest volume share at approximately 35%, with a sentiment profile close to the overall average. Taglish (30%) skews slightly more positive — this is the language of event excitement and celebrity commentary. English (25%) is more neutral, dominated by news and informational content. Cebuano (10%) shows strong positive sentiment, likely driven by the ZYN Summer Cebu activation. The negative sentiment in Filipino-language mentions is concentrated in health and age concerns — these are the conversations that matter most for reputation management.`,
        generated_at: now, ...base,
      },
      keywords: {
        draft: `The keyword landscape is dominated by brand and event terms — #ZYN, #ZYNMegaBall, and #ZYNPhilippines lead volume. The risk-cluster keywords (underage, bata, health risk, addiction, bawal) collectively represent a meaningful share of conversation and carry strong negative sentiment. #SmokeFree and #NicotinePouch indicate product-category interest. The presence of "Ploom" in the keyword list confirms active competitor comparison in the market. Recommend monitoring the risk-cluster keywords as early-warning indicators for potential media escalation.`,
        final: `The keyword landscape is dominated by brand and event terms — #ZYN, #ZYNMegaBall, and #ZYNPhilippines lead volume. The risk-cluster keywords (underage, bata, health risk, addiction, bawal) collectively represent a meaningful share of conversation and carry strong negative sentiment. #SmokeFree and #NicotinePouch indicate product-category interest. The presence of "Ploom" in the keyword list confirms active competitor comparison in the market. Recommend monitoring the risk-cluster keywords as early-warning indicators for potential media escalation.`,
        generated_at: now, ...base,
      },
      viral_posts: {
        draft: `The top viral posts are dominated by event content — ZYN Mega Ball 2026 and the Summer circuit drive the highest reach and engagement numbers. The highest-reach single post came from a TikTok event recap, consistent with the platform's strength in short-form event content. Notably, no negative-sentiment posts appear in the top 5 viral list, suggesting that risk narratives spread through volume rather than individual viral moments. The viral content pattern confirms that ZYN's event strategy is its strongest organic amplification engine.`,
        final: `The top viral posts are dominated by event content — ZYN Mega Ball 2026 and the Summer circuit drive the highest reach and engagement numbers. The highest-reach single post came from a TikTok event recap, consistent with the platform's strength in short-form event content. Notably, no negative-sentiment posts appear in the top 5 viral list, suggesting that risk narratives spread through volume rather than individual viral moments. The viral content pattern confirms that ZYN's event strategy is its strongest organic amplification engine.`,
        generated_at: now, ...base,
      },
      share_of_voice: {
        draft: `ZYN dominates share of voice at approximately ${((stats.zynTotal / stats.total) * 100).toFixed(0)}% of total conversation volume vs Ploom's ${((stats.ploomTotal / stats.total) * 100).toFixed(0)}%. ZYN's advantage is driven by event activations and celebrity partnerships — Ploom's conversation is more product-focused and event-specific (Manila Gin Festival). Ploom's sentiment profile is slightly more positive than ZYN's, likely because it faces less scrutiny on health and age issues due to lower visibility. As Ploom increases its Philippine presence, expect its share of voice to grow. Recommend tracking Ploom's event calendar and influencer partnerships as competitive intelligence.`,
        final: `ZYN dominates share of voice at approximately ${((stats.zynTotal / stats.total) * 100).toFixed(0)}% of total conversation volume vs Ploom's ${((stats.ploomTotal / stats.total) * 100).toFixed(0)}%. ZYN's advantage is driven by event activations and celebrity partnerships — Ploom's conversation is more product-focused and event-specific (Manila Gin Festival). Ploom's sentiment profile is slightly more positive than ZYN's, likely because it faces less scrutiny on health and age issues due to lower visibility. As Ploom increases its Philippine presence, expect its share of voice to grow. Recommend tracking Ploom's event calendar and influencer partnerships as competitive intelligence.`,
        generated_at: now, ...base,
      },
    },
  };
}

// ── Generate narratives ───────────────────────────────────────────────────
function generateNarratives() {
  const now = new Date().toISOString();
  return {
    provider: 'seed',
    model: 'pre-generated',
    prompt_version: '1.0',
    generated_at: now,
    positive: [
      {
        title: 'Mega Ball Hype Machine',
        description: 'The ZYN Mega Ball 2026 is the single largest conversation driver, generating massive positive sentiment through event coverage, celebrity sightings, and attendee excitement. It functions as the brand\'s anchor narrative.',
        topic: 'event experience',
        status: 'ANCHOR',
      },
      {
        title: 'Summer Circuit Buzz',
        description: 'The ZYN Summer series (Cebu, Siargao, Boracay) creates a sustained positive conversation wave from March through May, building anticipation for the Mega Ball and establishing ZYN as a lifestyle brand.',
        topic: 'event experience',
        status: 'STEADY',
      },
      {
        title: 'Celebrity Endorsement Power',
        description: 'Heart Evangelista, Donny Pangilinan, and other celebrity LANUs drive high-engagement positive content. Celebrity mentions carry the highest positive sentiment ratio of any topic.',
        topic: 'celebrity / LANU',
        status: 'STEADY',
      },
      {
        title: 'Flavor Discovery Wave',
        description: 'Growing organic conversation around ZYN flavors, particularly mint and citrus, with consumers sharing genuine product experiences and recommendations. This is expanding beyond the event-driven audience.',
        topic: 'product & flavor',
        status: 'ESCALATING',
      },
      {
        title: 'Smoke-Free Lifestyle Community',
        description: 'A small but growing community of users positioning ZYN as part of a smoke-free lifestyle choice, using hashtags like #SmokeFree and sharing personal switch stories.',
        topic: 'other',
        status: 'STEADY',
      },
    ],
    risk: [
      {
        title: 'Underage Access Concerns — "Ang daming bata"',
        description: 'The most urgent risk narrative. Reports of teenagers purchasing and using ZYN, concentrated in Filipino-language social media. Spiked sharply after the Mega Ball 2026 event, suggesting large events increase visibility to minors.',
        topic: 'age & legality',
        status: 'RED FLAG',
      },
      {
        title: 'Health Risk Anxiety — "Safe ba talaga?"',
        description: 'Steady-burn concern about long-term health effects of nicotine pouches. Concentrated in forums and X/Twitter. Often framed as questions rather than accusations, but the uncertainty itself is damaging.',
        topic: 'health & safety',
        status: 'ESCALATING',
      },
      {
        title: 'Price Resistance — "Ang mahal na"',
        description: 'Growing complaints about ZYN pricing, particularly in the August-September period. Price sensitivity is highest outside Metro Manila. Some users explicitly mention switching to cheaper alternatives.',
        topic: 'price & availability',
        status: 'STEADY',
      },
      {
        title: 'Ploom Design Appeal — "Mas premium ang Ploom"',
        description: 'A subset of comparison mentions favor Ploom\'s device design and premium positioning. While ZYN wins on flavor variety, Ploom is gaining mindshare on aesthetics and brand image.',
        topic: 'competitor comparison',
        status: 'STEADY',
      },
      {
        title: 'Regulatory Scrutiny — "Kailangan ng batas"',
        description: 'Calls for government regulation of nicotine pouch sales, particularly around age verification. This narrative overlaps with the underage access concern and could attract media or legislative attention.',
        topic: 'age & legality',
        status: 'ESCALATING',
      },
    ],
  };
}

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  console.log('Generating sample listening data …\n');

  mkdirSync(SEED_DIR, { recursive: true });

  const mentions = generateMentions();
  const tags = generateTags(mentions);
  const stats = computeStats(mentions, tags);
  const summaries = generateSummaries(stats);
  const narratives = generateNarratives();

  // Write files
  writeFileSync(join(SEED_DIR, 'mentions.json'), JSON.stringify(mentions, null, 2));
  writeFileSync(join(SEED_DIR, 'ai_tags.json'), JSON.stringify({
    provider: 'seed',
    model: 'pre-generated',
    prompt_version: '1.0',
    generated_at: new Date().toISOString(),
    tags,
  }, null, 2));
  writeFileSync(join(SEED_DIR, 'ai_summaries.json'), JSON.stringify(summaries, null, 2));
  writeFileSync(join(SEED_DIR, 'narratives.json'), JSON.stringify(narratives, null, 2));

  // Print stats
  console.log(`Total mentions: ${mentions.length}`);
  console.log(`  ZYN: ${mentions.filter(m => m.brand === 'ZYN').length}`);
  console.log(`  Ploom: ${mentions.filter(m => m.brand === 'Ploom').length}`);
  console.log('');

  console.log('By platform:');
  const platCounts = {};
  for (const m of mentions) platCounts[m.platform] = (platCounts[m.platform] || 0) + 1;
  for (const [p, c] of Object.entries(platCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p}: ${c} (${((c / mentions.length) * 100).toFixed(1)}%)`);
  }
  console.log('');

  console.log('By language:');
  const langCounts = {};
  for (const m of mentions) langCounts[m.language] = (langCounts[m.language] || 0) + 1;
  for (const [l, c] of Object.entries(langCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${l}: ${c} (${((c / mentions.length) * 100).toFixed(1)}%)`);
  }
  console.log('');

  console.log('By topic (ZYN only):');
  const topicCounts = {};
  const zynIds = new Set(mentions.filter(m => m.brand === 'ZYN').map(m => m.mention_id));
  for (const t of tags) {
    if (zynIds.has(t.mention_id)) {
      topicCounts[t.topic] = (topicCounts[t.topic] || 0) + 1;
    }
  }
  for (const [t, c] of Object.entries(topicCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t}: ${c}`);
  }
  console.log('');

  console.log('Sentiment (ZYN only):');
  console.log(`  Positive: ${stats.sentimentCount.positive} (${stats.posPct}%)`);
  console.log(`  Neutral: ${stats.sentimentCount.neutral} (${stats.neuPct}%)`);
  console.log(`  Negative: ${stats.sentimentCount.negative} (${stats.negPct}%)`);
  console.log(`  Net score: +${stats.netScore}`);
  console.log('');

  console.log(`Files written to ${SEED_DIR}/`);
  console.log('  mentions.json, ai_tags.json, ai_summaries.json, narratives.json');
  console.log('\nDone.');
}

main();
