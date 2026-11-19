// Подарки «рисованные» в стилистике приложения: жирные скруглённые штрихи, мята и золото на глубокой зелени.
// Рисуются кодом (без файлов): каждая штука — свой SVG на сетке 64×64, фиксированная палитра, тема не нужна.
// Неизвестный id витрины — показываем исходный эмодзи как раньше.
import { html, cx } from './lib.js';

const IN = '#173F2C', DK = '#101F17';
const LF = '#3DB96A', LF2 = '#1F7A43', MN = '#7BE0A8', SF = '#DFF5E6';
const CR = '#FBF3E2', GD = '#F2C14E', GD2 = '#C8891A';
const CO = '#E0704F', PK = '#E58CA0', PC = '#F2C09A', BR = '#8A5A3B';
const W = 'stroke-linecap="round" stroke-linejoin="round"';
const O = 3.4;   // толщина обводки

const ART = {};
const d = (id, body) => { ART[id] = body; };

d('leaf', `<path d="M33 4C47 12 51 33 39 50c-5 7-15 8-22 1C11 40 13 18 33 4Z" fill="${LF}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M30 15c9 10 12 22 4 34" fill="none" stroke="${LF2}" stroke-width="2.6" ${W}/>
<path d="M28 30l-9-2M30 40l-10-3" stroke="${SF}" stroke-width="2" ${W} fill="none" opacity=".8"/>`);

d('duck', `<path d="M8 40c-2-8 5-12 11-11 0-7 7-12 14-10 3-4 13-4 15 4 5 1 7 5 6 10-2 8-9 12-18 12H18c-6 0-9-2-10-5Z" fill="${GD}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M43 27l11 3.4-10.4 3.6" fill="${CO}" stroke="${IN}" stroke-width="${O}" ${W}/>
<circle cx="41" cy="22.5" r="1.8" fill="${DK}"/>
<path d="M14 43h28" stroke="${GD2}" stroke-width="2.2" ${W}/>`);

d('bear', `<circle cx="17" cy="16" r="6.4" fill="#E3B778" stroke="${IN}" stroke-width="${O}" ${W}/><circle cx="47" cy="16" r="6.4" fill="#E3B778" stroke="${IN}" stroke-width="${O}" ${W}/>
<circle cx="17" cy="16" r="2.4" fill="${PC}"/><circle cx="47" cy="16" r="2.4" fill="${PC}"/>
<circle cx="32" cy="27" r="17" fill="#E3B778" stroke="${IN}" stroke-width="${O}" ${W}/>
<ellipse cx="32" cy="32.5" rx="8.6" ry="6.4" fill="${CR}" stroke="${IN}" stroke-width="2.6" ${W}/>
<ellipse cx="32" cy="29.6" rx="3.1" ry="2.3" fill="${DK}"/>
<path d="M32 31.8v2.6M27 36.5c2 1.6 8 1.6 10 0" stroke="${IN}" stroke-width="2" fill="none" ${W}/>
<circle cx="24.5" cy="23.5" r="2" fill="${DK}"/><circle cx="39.5" cy="23.5" r="2" fill="${DK}"/>`);

d('heart', `<path d="M32 56S8 41 8 23a12.5 12.5 0 0 1 24-6.2A12.5 12.5 0 0 1 56 23c0 18-24 33-24 33Z" fill="${PK}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M18 25c0-5 4-9 9-9.4" fill="none" stroke="#F6C3D0" stroke-width="3" ${W} opacity=".9"/>
<path d="M44 8l1.6 3.8 3.8 1.6-3.8 1.6L44 18.8l-1.6-3.8-3.8-1.6 3.8-1.6Z" fill="${GD}" stroke="${IN}" stroke-width="2" ${W}/>`);

d('rose', `<path d="M32 34c-1 8-2 16-6 26" fill="none" stroke="${LF2}" stroke-width="3.2" ${W}/>
<path d="M27 48l-8-2 6-5M29 54l-9 1 8-6" fill="${LF}" stroke="${IN}" stroke-width="2.2" ${W}/>
<path d="M32 36c-9 1-15-5-14-12 2-8 10-10 15-8 6-2 14 1 14 9 0 7-6 12-15 11Z" fill="${CO}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M32 30c-5 .6-8-2.4-7.4-6.4 1-4.4 5.6-5.3 8.6-4.3 3.6-.9 8 .8 8 5.2 0 4-4 6.8-9.2 5.5Z" fill="#B64B32" stroke="${IN}" stroke-width="2.4" ${W}/>
<circle cx="32" cy="24.5" r="2.2" fill="${GD}" stroke="${IN}" stroke-width="1.6"/>`);

d('box', `<rect x="8" y="26" width="48" height="12" rx="2.4" fill="${LF}" stroke="${IN}" stroke-width="${O}" ${W}/>
<rect x="12" y="37" width="40" height="19" rx="2.4" fill="${MN}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M32 26v30" stroke="${GD}" stroke-width="7"/>
<path d="M32 26v30" stroke="${IN}" stroke-width="2.2" opacity=".55"/>
<path d="M32 26c-6 0-10-2.6-10-7 0-4.4 5-6 8.4-3.4C32.6 12 38 12 40.6 15c2 3.4-.6 6.6-4.4 6.6-2 0-3.3-.5-4.2-1.4" fill="${GD}" stroke="${IN}" stroke-width="${O}" ${W}/>`);

d('trunks', `<path d="M10 22h44v10c0 8-6 12-12 12-5 0-8-3-10-8-2 5-5 8-10 8-6 0-12-4-12-12V22Z" fill="${MN}" stroke="${IN}" stroke-width="${O}" ${W}/>
<rect x="10" y="16" width="44" height="8" rx="2" fill="${GD}" stroke="${IN}" stroke-width="${O}" ${W}/>
<circle cx="22" cy="32" r="1.8" fill="${IN}"/><circle cx="32" cy="28" r="1.8" fill="${IN}"/><circle cx="42" cy="32" r="1.8" fill="${IN}"/>`);

d('pineapple', `<path d="M22 24c-4 10 0 26 10 26s14-16 10-26c-3-4-17-4-20 0Z" fill="${GD}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M25 32l14 8M39 32l-14 8M27 41l10 6M37 41l-10 6" stroke="${GD2}" stroke-width="2.2" stroke-linecap="round"/>
<path d="M32 24c-1-8-5-13-11-14 1 6 0 10-4 13 5 3 9 2 12-1 1-3 1-6 3-9 3 4 4 8 9 10 3-5 1-9-1-13 6 1 9 5 9 13" fill="${LF}" stroke="${IN}" stroke-width="${O}" ${W}/>`);

d('cake', `<rect x="14" y="34" width="36" height="16" rx="3" fill="${CR}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M14 40c4 4 8-2 12 1s8-2 12 1 8-2 12 1v-4H14Z" fill="${MN}" stroke="${IN}" stroke-width="2.4" ${W}/>
<rect x="21" y="17" width="22" height="17" rx="3" fill="${PC}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M21 22c3 3 6-2 10 1s7-2 12 1v-3H21Z" fill="${CR}" stroke="${IN}" stroke-width="2" ${W}/>
<path d="M32 17v-5" stroke="${IN}" stroke-width="2.2" ${W}/>
<path d="M32 5c2 2 2 4 0 5-2-1-2-3 0-5Z" fill="${GD}" stroke="${IN}" stroke-width="1.6" ${W}/>`);

d('bouquet', `<path d="M20 28L12 8M32 26V4M44 28l8-20" stroke="${LF2}" stroke-width="2.6" ${W}/>
<circle cx="13" cy="10" r="6" fill="${PK}" stroke="${IN}" stroke-width="2.6" ${W}/>
<circle cx="32" cy="8" r="6.4" fill="${GD}" stroke="${IN}" stroke-width="2.6" ${W}/>
<circle cx="51" cy="10" r="6" fill="${CO}" stroke="${IN}" stroke-width="2.6" ${W}/>
<circle cx="22" cy="20" r="5.4" fill="${CR}" stroke="${IN}" stroke-width="2.4" ${W}/>
<circle cx="42" cy="20" r="5.4" fill="${MN}" stroke="${IN}" stroke-width="2.4" ${W}/>
<path d="M16 30h32l-6 26a4 4 0 0 1-4 3.4H26A4 4 0 0 1 22 56Z" fill="${CO}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M17 38h30" stroke="${IN}" stroke-width="2.2" opacity=".5" ${W}/>
<path d="M24 30l-2 8M40 30l2 8" stroke="${GD}" stroke-width="3" ${W}/>`);

d('rocket', `<path d="M32 4c9 5 12 17 10 28l-10 10-10-10C20 21 23 9 32 4Z" fill="${CR}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M22 30c-6 2-9 8-9 14l9-2M42 30c6 2 9 8 9 14l-9-2" fill="${LF}" stroke="${IN}" stroke-width="${O}" ${W}/>
<circle cx="32" cy="20" r="5.4" fill="${SF}" stroke="${IN}" stroke-width="2.6" ${W}/>
<path d="M32 42l-3.6 7a3 3 0 0 0 3.6 4.6 3 3 0 0 0 3.6-4.6Z" fill="${GD}" stroke="${IN}" stroke-width="2.2" ${W}/>`);

d('beach', `<rect x="6" y="10" width="52" height="44" rx="5" fill="${CR}" stroke="${IN}" stroke-width="${O}" ${W}/>
<circle cx="42" cy="23" r="7.4" fill="${GD}" stroke="${IN}" stroke-width="2.6" ${W}/>
<path d="M10 36c5-3.4 9 2.6 15-1s10 2.6 15-1 9 2.6 14-1" fill="none" stroke="${LF}" stroke-width="2.6" ${W}/>
<path d="M10 45c5-3.4 9 2.6 15-1s10 2.6 15-1 9 2.6 14-1" fill="none" stroke="${LF2}" stroke-width="2.6" ${W}/>`);
d('cup', `<path d="M18 6h28v10a14 14 0 0 1-28 0Z" fill="${GD}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M18 10h-6a3 3 0 0 0-3 3c0 5 3 8 9 8M46 10h6a3 3 0 0 1 3 3c0 5-3 8-9 8" fill="none" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M27 30h10v8h-10z" fill="${GD2}" stroke="${IN}" stroke-width="2.4" ${W}/>
<path d="M24 38h16l3 14H21Z" fill="${GD2}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M32 11l1.9 3.9 4.2.6-3 3 .7 4.3L32 22l-3.8 1.8.7-4.3-3-3 4.2-.6Z" fill="${CR}" stroke="${IN}" stroke-width="1.6" ${W}/>`);

d('ring', `<circle cx="32" cy="42" r="14.5" fill="none" stroke="${GD}" stroke-width="7"/>
<circle cx="32" cy="42" r="14.5" fill="none" stroke="${IN}" stroke-width="2" opacity=".65"/>
<path d="M32 2l8 9.4-8 9.2-8-9.2Z" fill="${SF}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M24 11.4h16" stroke="${LF2}" stroke-width="2" ${W}/>
<path d="M29.8 7.2l.9 2.2M36 12l1 2.4" stroke="#fff" stroke-width="1.4" ${W}/>`);

d('gem', `<path d="M18 12h28l10 12-24 26L8 24Z" fill="${SF}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M8 24h48M24 12l8 12 8-12M24 24l8 26M40 24l-8 26" fill="none" stroke="${LF2}" stroke-width="2" ${W}/>
<path d="M19 17l4-2" stroke="#fff" stroke-width="2.6" ${W} opacity=".9"/>`);

d('crown', `<path d="M10 44L7 21l13 9L32 12l12 18 13-9-3 23Z" fill="${GD}" stroke="${IN}" stroke-width="${O}" ${W}/>
<rect x="10" y="46" width="44" height="6" rx="2" fill="${GD2}" stroke="${IN}" stroke-width="2.6" ${W}/>
<circle cx="32" cy="38" r="2.6" fill="${CO}" stroke="${IN}" stroke-width="1.6"/><circle cx="18" cy="39" r="2" fill="${LF}" stroke="${IN}" stroke-width="1.4"/><circle cx="46" cy="39" r="2" fill="${LF}" stroke="${IN}" stroke-width="1.4"/>`);

d('shell', `<path d="M12 46c0-20 9-32 20-32s20 12 20 32c-7 5-13 6-20 6s-13-1-20-6Z" fill="${CR}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M32 14v38M22 17l-4 32M42 17l4 32M15 26l-2 20M49 26l2 20" stroke="${MN}" stroke-width="2.6" ${W}/>
<path d="M12 46c7 5 13 6 20 6s13-1 20-6" fill="none" stroke="${IN}" stroke-width="2.4" ${W}/>
<path d="M18 52c4 2.6 9 3.6 14 3.6s10-1 14-3.6" fill="none" stroke="${GD}" stroke-width="2.2" ${W}/>`);

d('icecream', `<path d="M22 34h20l-8 22a2.6 2.6 0 0 1-4.8 0Z" fill="${GD}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M24.5 40h15M27 47h10" stroke="${GD2}" stroke-width="2" ${W}/>
<path d="M32 8a11 11 0 0 1 11 11H21A11 11 0 0 1 32 8Z" fill="${MN}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M32 21a9 9 0 0 1 9 8.6H23A9 9 0 0 1 32 21Z" fill="${CR}" stroke="${IN}" stroke-width="${O}" ${W}/>
<circle cx="32" cy="12" r="1.7" fill="${CO}"/>`);

d('shades', `<path d="M6 26h52" stroke="${IN}" stroke-width="3" ${W}/>
<path d="M10 30c0 8 4 12 10 12s10-4 10-12Z" fill="${DK}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M34 30c0 8 4 12 10 12s10-4 10-12Z" fill="${DK}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M30 32h4" stroke="${IN}" stroke-width="3" ${W}/>
<path d="M15 34l4-3M39 34l4-3" stroke="${MN}" stroke-width="1.8" ${W} opacity=".85"/>`);

d('coconut', `<circle cx="32" cy="36" r="20" fill="${BR}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M32 24a20 20 0 0 1 17.3 10" fill="none" stroke="#A9764F" stroke-width="2.4" ${W} opacity=".9"/>
<ellipse cx="32" cy="34" rx="12.5" ry="9" fill="${CR}" stroke="${IN}" stroke-width="2.6" ${W}/>
<circle cx="27" cy="34" r="1.5" fill="${DK}"/><circle cx="37" cy="34" r="1.5" fill="${DK}"/><circle cx="32" cy="38.6" r="1.5" fill="${DK}"/>`);

d('cocktail', `<path d="M14 8h36L34 32v16h10v6H20v-6h10V32Z" fill="${CO}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M13.5 8h37" stroke="${IN}" stroke-width="4.6" ${W}/>
<path d="M18 15h28l-6 12H24Z" fill="${GD}" opacity=".55"/>
<path d="M24 27c4 2.6 12-2.6 16 0" fill="none" stroke="${SF}" stroke-width="1.8" ${W} opacity=".9"/>
<path d="M40 12l8-6" stroke="${LF2}" stroke-width="2.6" ${W}/><circle cx="41" cy="13" r="3.4" fill="${LF}" stroke="${IN}" stroke-width="2" ${W}/>`);

d('palm', `<path d="M30 60c1-16 0-30 4-44" fill="none" stroke="${BR}" stroke-width="7" ${W}/>
<path d="M30 60c1-16 0-30 4-44" fill="none" stroke="${IN}" stroke-width="2" ${W} opacity=".4"/>
<path d="M34 16C26 8 14 8 8 16c8 2 14 6 18 12M34 16c4-9 18-11 24-3-7 2-10 7-12 13M34 16c-1-10 8-16 17-13-3 4-4 9-4 14M34 16C22 12 12 18 10 28c7-1 12 1 17 6M34 16c10-4 20 2 21 12-6-2-11-1-16 3" fill="${LF}" stroke="${IN}" stroke-width="${O}" ${W}/>
<circle cx="31" cy="20" r="3.4" fill="${BR}" stroke="${IN}" stroke-width="2" ${W}/>`);

d('umbrella', `<path d="M32 12A27 27 0 0 1 59 39H5A27 27 0 0 1 32 12Z" fill="${CO}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M32 12a27 27 0 0 1 18.5 9L41 39M32 12A27 27 0 0 0 13.5 21L23 39M32 12V5" fill="none" stroke="${IN}" stroke-width="2.4" ${W}/>
<path d="M23 39a5 5 0 0 0 9 3M32 42a5 5 0 0 0 9-3" fill="none" stroke="${IN}" stroke-width="2.4" ${W}/>
<path d="M32 45v11a4.4 4.4 0 0 0 8.8 0" fill="none" stroke="${GD2}" stroke-width="3" ${W}/>`);

d('surf', `<g transform="rotate(38 32 32)"><path d="M32 2c6 8 8 20 8 30s-2 22-8 30c-6-8-8-20-8-30S26 10 32 2Z" fill="${MN}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M32 6v50" stroke="${GD}" stroke-width="5"/>
<path d="M32 6v50" stroke="${IN}" stroke-width="1.6" opacity=".5"/></g>
<path d="M8 54c4-2.8 7 2.2 12-.8M16 60c4-2.8 7 2.2 12-.8" fill="none" stroke="${LF2}" stroke-width="2.2" ${W}/>`);

d('yacht', `<path d="M6 40l10-14h26l12 8 4-7c4 5 4 9 2 13Z" fill="${CR}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M6 40h52l-6 10a4 4 0 0 1-4 3H16a4 4 0 0 1-4-3Z" fill="${LF}" stroke="${IN}" stroke-width="${O}" ${W}/>
<rect x="28" y="18" width="12" height="8" rx="1.6" fill="${SF}" stroke="${IN}" stroke-width="2.2" ${W}/>
<path d="M14 57c5-3.2 9 2.4 15-1s10 2.4 15-1" fill="none" stroke="${LF2}" stroke-width="2.2" ${W}/>`);

d('nudiamond', `<path d="M32 2l4.6 14.4L51 21l-14.4 4.6L32 40l-4.6-14.4L13 21l14.4-4.6Z" fill="${GD}" stroke="${IN}" stroke-width="2.6" ${W}/>
<path d="M32 14l3.6 9.4L45 27l-9.4 3.6L32 40l-3.6-9.4L19 27l9.4-3.6Z" fill="${SF}" stroke="${IN}" stroke-width="2.4" ${W}/>
<path d="M6 52h10M48 52h10M12 6l5 5M52 6l-5 5" stroke="${GD}" stroke-width="2.6" ${W}/>`);
d('snowball', `<path d="M32 6v52M9.4 19l45.2 26M9.4 45l45.2-26" stroke="${MN}" stroke-width="4.6" ${W}/>
<path d="M32 6v52M9.4 19l45.2 26M9.4 45l45.2-26" stroke="${IN}" stroke-width="1.7" ${W} opacity=".65"/>
<circle cx="32" cy="32" r="7.6" fill="${CR}" stroke="${IN}" stroke-width="2.6"/>
<circle cx="32" cy="32" r="2.2" fill="${GD}"/>`);

d('mulled', `<path d="M16 10h32l-3 22a13 13 0 0 1-26 0Z" fill="#B64B32" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M15 10h34" stroke="${IN}" stroke-width="4.2" ${W}/>
<path d="M20 22h24" stroke="${GD}" stroke-width="2.2" opacity=".6" ${W}/>
<path d="M32 46v8M23 58h18" stroke="${IN}" stroke-width="3" ${W}/>
<path d="M32 17l1.7 1.7M38 24l2 1M26 24l-2 1" stroke="${GD}" stroke-width="1.8" ${W}/>`);

d('scarf', `<path d="M8 40a6 6 0 0 1 6-6h36a6 6 0 0 1 6 6v4a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6Z" fill="${CO}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M11 30a6 6 0 0 1 6-6h30a6 6 0 0 1 6 6v2H11Z" fill="#C8573A" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M14 20a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v2H14Z" fill="${CO}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M14 43h36" stroke="${CR}" stroke-width="2.6" ${W} opacity=".9"/>
<path d="M18 50l-1.6 6M26 50l-.6 6M34 50l.6 6M42 50l1.6 6" stroke="${CO}" stroke-width="3.4" ${W}/>`);

d('tree', `<path d="M32 4l10 14h-6l9 12h-8l10 14H17L27 30h-8l9-12h-6Z" fill="${LF2}" stroke="${IN}" stroke-width="${O}" ${W}/>
<rect x="26" y="48" width="12" height="7" rx="1.4" fill="${BR}" stroke="${IN}" stroke-width="2.2" ${W}/>
<path d="M32 .5l1.8 3.7 4.1.6-3 2.9.7 4-3.6-1.9-3.6 1.9.7-4-3-2.9 4.1-.6Z" fill="${GD}" stroke="${IN}" stroke-width="1.5" ${W}/>
<circle cx="27" cy="32" r="1.7" fill="${CO}"/><circle cx="37" cy="38" r="1.7" fill="${GD}"/><circle cx="29" cy="24" r="1.7" fill="${CR}"/>`);

d('deer', `<path d="M23 23L14 7M19.5 13.5L14.5 11M22.5 15.5l-5.5-3.5" fill="none" stroke="${CR}" stroke-width="2.4" ${W}/>
<path d="M41 23l9-16M44.5 13.5L49.5 11M41.5 15.5L47 12" fill="none" stroke="${CR}" stroke-width="2.4" ${W}/>
<path d="M32 20c-8 0-11 6-11 11 0 9 5 15 11 15s11-6 11-15c0-5-3-11-11-11Z" fill="#A9764F" stroke="${IN}" stroke-width="${O}" ${W}/>
<ellipse cx="32" cy="40" rx="6" ry="4.6" fill="${CR}" stroke="${IN}" stroke-width="2.2" ${W}/>
<circle cx="27.6" cy="32" r="1.8" fill="${DK}"/><circle cx="36.4" cy="32" r="1.8" fill="${DK}"/><circle cx="32" cy="40" r="1.1" fill="${DK}"/>`);

d('champagne', `<path d="M27 26h10v18c4 2 6 6 6 11a2 2 0 0 1-2 2H23a2 2 0 0 1-2-2c0-5 2-9 6-11Z" fill="${LF2}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M27 26l2-6h6l2 6" fill="${GD}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M29 20l-2-7h10l-2 7" fill="${GD2}" stroke="${IN}" stroke-width="2.4" ${W}/>
<path d="M32 6l1.5-3M38 8l3-2M26 8l-3-2" stroke="${GD}" stroke-width="2" ${W}/>`);

d('santa', `<circle cx="32" cy="30" r="13.5" fill="${PC}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M18 26C20 12 34 6 52 12c1 8-4 12-12 13l-1-4C30 18 24 20 22 26Z" fill="${CO}" stroke="${IN}" stroke-width="${O}" ${W}/>
<circle cx="51" cy="12" r="4.6" fill="${CR}" stroke="${IN}" stroke-width="2.2" ${W}/>
<path d="M20 25h24" stroke="${CR}" stroke-width="5.4" ${W}/>
<path d="M22 34c3 8 6 11 10 11s7-3 10-11" fill="${CR}" stroke="${IN}" stroke-width="2.6" ${W}/>
<circle cx="27" cy="29" r="1.6" fill="${DK}"/><circle cx="37" cy="29" r="1.6" fill="${DK}"/>`);

d('pearl', `<path d="M14 40c8 10 28 10 36 0-4-8-10-12-18-12s-14 4-18 12Z" fill="${CR}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M14 40c-3-2-5-6-5-10M50 40c3-2 5-6 5-10" fill="none" stroke="${IN}" stroke-width="2.6" ${W}/>
<circle cx="32" cy="32" r="9.5" fill="#2B2B33" stroke="${IN}" stroke-width="${O}" ${W}/>
<circle cx="28.6" cy="29" r="2.4" fill="${MN}" opacity=".9"/>`);

d('valheart', `<path d="M32 56S8 41 8 23a12.5 12.5 0 0 1 24-6.2A12.5 12.5 0 0 1 56 23c0 18-24 33-24 33Z" fill="${PK}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M20 24c0-5 4-8.4 9-8.8" fill="none" stroke="#F6C3D0" stroke-width="3" ${W} opacity=".9"/>
<path d="M14 8l1.5 3.4 3.4 1.5-3.4 1.5L14 18l-1.5-3.6-3.4-1.5 3.4-1.5Z" fill="${GD}" stroke="${IN}" stroke-width="1.4" ${W}/>
<path d="M50 8l1.5 3.4 3.4 1.5-3.4 1.5L50 18l-1.5-3.6-3.4-1.5 3.4-1.5Z" fill="${GD}" stroke="${IN}" stroke-width="1.4" ${W}/>`);

d('heartbreak', `<path d="M29.5 52.4L12.3 37.5A11.6 11.6 0 0 1 15.4 17L29.5 23l-6.2 9.3 7.4 5.4-4.6 7.4 6.4 7.3Z" fill="${PK}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M34.5 52.4l6.7-7-7.2-7.2 7-5.6-7.6-8.7 14-6.2a11.6 11.6 0 0 1 3 20.4Z" fill="${PK}" stroke="${IN}" stroke-width="${O}" ${W}/>`);

d('cupid', `<path d="M32 50S12 37.6 12 22.5A10.4 10.4 0 0 1 32 16a10.4 10.4 0 0 1 20 6.5C52 37.6 32 50 32 50Z" fill="${CO}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M4 60l34-34" stroke="${GD2}" stroke-width="3.4" ${W}/>
<path d="M42 22l10-10M42 22l-2-12M42 22l12-2" stroke="${GD}" stroke-width="2.6" ${W}/>
<path d="M8 52l6 2-2-6" fill="${GD}" stroke="${IN}" stroke-width="1.8" ${W}/>`);

d('tulips', `<path d="M32 30v26" stroke="${LF2}" stroke-width="3" ${W}/><path d="M32 44c-6-1-10-5-11-11M32 50c6-1 10-5 11-11" fill="none" stroke="${LF2}" stroke-width="2.4" ${W}/>
<path d="M20 26c-2-8 1-14 6-16 2 4 4 5 6 5s4-1 6-5c5 2 8 8 6 16-4 6-20 6-24 0Z" fill="${CO}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M32 15v8" stroke="${IN}" stroke-width="2" ${W}/>`);

d('mimosa', `<path d="M20 60C24 42 30 26 44 10" fill="none" stroke="${LF2}" stroke-width="2.8" ${W}/>
<path d="M28 52c-3-1-5-4-5-8M34 38c-3-1-5-4-5-8" stroke="${LF}" stroke-width="2" ${W} fill="none"/>
<circle cx="44" cy="11" r="4" fill="${GD}" stroke="${IN}" stroke-width="1.8"/><circle cx="35" cy="18" r="4.4" fill="${GD}" stroke="${IN}" stroke-width="1.8"/><circle cx="52" cy="18" r="3.6" fill="${GD}" stroke="${IN}" stroke-width="1.8"/><circle cx="28" cy="28" r="4.4" fill="${GD}" stroke="${IN}" stroke-width="1.8"/><circle cx="43" cy="26" r="3.8" fill="${GD}" stroke="${IN}" stroke-width="1.8"/><circle cx="22" cy="39" r="4.2" fill="${GD}" stroke="${IN}" stroke-width="1.8"/><circle cx="36" cy="36" r="3.4" fill="${GD}" stroke="${IN}" stroke-width="1.8"/><circle cx="18" cy="52" r="4" fill="${GD}" stroke="${IN}" stroke-width="1.8"/>`);

d('lounger', `<path d="M8 42h48" stroke="${IN}" stroke-width="9" ${W}/>
<path d="M8 42h48" stroke="${MN}" stroke-width="4.6" ${W}/>
<path d="M11 41L30 14" stroke="${IN}" stroke-width="9" ${W}/>
<path d="M11 41L30 14" stroke="${MN}" stroke-width="4.6" ${W}/>
<path d="M22 25.4L30 14" stroke="${SF}" stroke-width="4.6" ${W} opacity=".9"/>
<path d="M14 42v10M50 42v10" stroke="${IN}" stroke-width="4" ${W}/>
<circle cx="49" cy="10" r="5.4" fill="${GD}" stroke="${IN}" stroke-width="2.2" ${W}/>`);

d('beachball', `<circle cx="32" cy="32" r="22" fill="${CO}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M32 10a22 22 0 0 1 14.6 7.4L36 32l10.6 14.6A22 22 0 0 1 32 54Z" fill="${CR}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M32 10a22 22 0 0 0-14.6 7.4L28 32 17.4 46.6A22 22 0 0 0 32 54Z" fill="${GD}" stroke="${IN}" stroke-width="${O}" ${W}/>
<circle cx="32" cy="33" r="3.4" fill="${MN}" stroke="${IN}" stroke-width="2"/>`);

d('goldleaf', `<g transform="rotate(40 32 32)"><path d="M32 2c10 14 11 38 2 52-3.4 3-8 3-11 0-6-16-3-38 9-52Z" fill="${GD}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M32 12v38" stroke="${GD2}" stroke-width="2.4" ${W}/>
<path d="M32 22l-7-4M32 32l-8-4.4M32 42l-8.4-4.8" stroke="${GD2}" stroke-width="1.8" ${W}/></g>
<path d="M50 6l1.6 3.8 3.8 1.6-3.8 1.6L50 17l-1.6-3.8-3.8-1.6 3.8-1.6Z" fill="${CR}" stroke="${IN}" stroke-width="1.4" ${W}/>`);

d('sangria', `<path d="M18 6h28l-3 21a13.4 13.4 0 0 1-22 0Z" fill="#B64B32" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M17 6h30" stroke="${IN}" stroke-width="4" ${W}/>
<path d="M34 27c-3 8 2 9 0 17" fill="none" stroke="${IN}" stroke-width="3" ${W} opacity=".55"/>
<path d="M24 50h18M32 44v6" stroke="${IN}" stroke-width="${O}" ${W}/>
<circle cx="27" cy="16" r="2" fill="${GD}"/><circle cx="36" cy="13" r="2" fill="${GD}"/><circle cx="33" cy="21" r="2" fill="${GD}"/>`);
d('guitar', `<g transform="rotate(-40 32 30)"><rect x="29" y="0" width="6" height="14" rx="1.6" fill="${BR}" stroke="${IN}" stroke-width="2.2" ${W}/>
<path d="M32 12v18" stroke="${BR}" stroke-width="4.4" ${W}/>
<circle cx="32" cy="33" r="8.6" fill="#B07B44" stroke="${IN}" stroke-width="${O}" ${W}/>
<circle cx="32" cy="48" r="11.4" fill="#B07B44" stroke="${IN}" stroke-width="${O}" ${W}/>
<circle cx="32" cy="42.5" r="3.6" fill="${CR}" stroke="${IN}" stroke-width="1.8" ${W}/>
<circle cx="32" cy="42.5" r="1.2" fill="${DK}"/>
<path d="M29.8 8v48M34.2 8v48" stroke="${IN}" stroke-width=".8" opacity=".75"/></g>`);

d('picnic', `<path d="M10 26h44l-5 30a4 4 0 0 1-4 3.6H19A4 4 0 0 1 15 56Z" fill="${CR}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M20 26v33M32 26v33M44 26v33M13 37h38M12 48h40" stroke="${CO}" stroke-width="3.4" ${W} opacity=".9"/>
<path d="M22 26c0-9 5-13 10-13s10 4 10 13" fill="none" stroke="${IN}" stroke-width="${O}" ${W}/>`);

d('coffee', `<path d="M18 20h28l-3 34a4 4 0 0 1-4 3.6H25A4 4 0 0 1 21 54Z" fill="${CR}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M17 20l3.6-9h22.8L47 20Z" fill="${MN}" stroke="${IN}" stroke-width="${O}" ${W}/>
<rect x="22.5" y="30" width="19" height="11" rx="2" fill="${LF2}" stroke="${IN}" stroke-width="2.2" ${W}/>
<path d="M27 35.5h10" stroke="${SF}" stroke-width="2" ${W}/>`);

d('mug', `<path d="M14 22h28v24a9 9 0 0 1-9 9h-10a9 9 0 0 1-9-9Z" fill="${MN}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M42 26h5a6 6 0 0 1 0 12h-5" fill="none" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M14 22h28" stroke="${GD}" stroke-width="3" ${W}/>
<path d="M22 13c2-2.4 0-4.4 2-6.8M30 13c2-2.4 0-4.4 2-6.8" fill="none" stroke="${IN}" stroke-width="2" ${W} opacity=".7"/>`);

d('blanket', `<circle cx="27" cy="40" r="15" fill="${CO}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M15 33c6 4 18 4 24 0M13 41c8 5 20 5 28 0M16 49c7 4 15 4 22 0" fill="none" stroke="${GD2}" stroke-width="2.2" ${W} opacity=".85"/>
<path d="M36 20L54 4M46 26l8-9" stroke="${GD}" stroke-width="3" ${W}/>
<circle cx="55" cy="3" r="1.8" fill="${GD}"/><circle cx="55" cy="17" r="1.8" fill="${GD}"/>`);

d('pumpkin', `<path d="M32 14c-13 0-20 7-20 17s7 17 20 17 20-7 20-17-7-17-20-17Z" fill="${CO}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M24 17c-4 8-4 22 0 30M40 17c4 8 4 22 0 30M32 15v34" fill="none" stroke="${IN}" stroke-width="2" opacity=".55" ${W}/>
<path d="M32 14c0-5 2-8 6-9" fill="none" stroke="${LF2}" stroke-width="3.2" ${W}/>
<path d="M24 32l4-4 3 4ZM37 32l4-4 3 4Z" fill="${DK}" stroke="${IN}" stroke-width="1.6" ${W}/>
<path d="M24 40c3-3.4 5 1.4 8-2s5 1.4 8-2 5 1.4 8-2" fill="none" stroke="${DK}" stroke-width="2.6" ${W}/>`);

d('ghost', `<path d="M14 58V30a18 18 0 0 1 36 0v28l-6-5-6 5-6-5-6 5-6-5Z" fill="${CR}" stroke="${IN}" stroke-width="${O}" ${W}/>
<circle cx="25" cy="30" r="2.6" fill="${DK}"/><circle cx="39" cy="30" r="2.6" fill="${DK}"/>
<ellipse cx="32" cy="41" rx="4.4" ry="5" fill="${DK}"/>`);

d('coffin', `<path d="M22 8h20l9 12-4 34a3 3 0 0 1-3 3H20a3 3 0 0 1-3-3l-4-34Z" fill="#3A3A44" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M32 18v26M22 26h20" stroke="${GD}" stroke-width="4" ${W}/>
<path d="M32 18v26M22 26h20" stroke="${IN}" stroke-width="1.4" ${W} opacity=".5"/>`);

d('sunset', `<circle cx="32" cy="32" r="24" fill="#2A2547" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M12 36a20 20 0 0 1 40 0Z" fill="${GD}" stroke="${IN}" stroke-width="2.4" ${W}/>
<path d="M8 38h48" stroke="${IN}" stroke-width="2.2" ${W}/>
<path d="M14 45h16M34 45h16M22 51h20" stroke="${MN}" stroke-width="2.2" ${W} opacity=".9"/>
<circle cx="32" cy="28" r="6.4" fill="${CR}" opacity=".9"/>`);

d('aurora', `<circle cx="32" cy="32" r="24" fill="#14243C" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M12 22c8 14 4 22-2 30M24 14c8 16 4 28-4 38M38 14c8 14 4 26-2 36" fill="none" stroke="${MN}" stroke-width="4" ${W} opacity=".85"/>
<path d="M44 22c6 12 2 20-3 27" fill="none" stroke="${GD}" stroke-width="2.6" ${W} opacity=".8"/>
<circle cx="20" cy="16" r="1.4" fill="${CR}"/><circle cx="46" cy="12" r="1.4" fill="${CR}"/><circle cx="52" cy="30" r="1.2" fill="${CR}"/><circle cx="15" cy="34" r="1.2" fill="${CR}"/>`);

d('unicorn', `<path d="M16 34c0-10 6-15 13-15 4 0 7 1.4 9 4l10-3-3 8c2 3 3 7 3 11 0 8-6 12-12 12-8 0-13-6-13-13Z" fill="${CR}" stroke="${IN}" stroke-width="${O}" ${W}/>
<path d="M27 19l4-12 5 11" fill="none" stroke="${GD}" stroke-width="4" ${W}/>
<path d="M28.4 15.4l6.6 2.4M30 11.2l5 1.8" stroke="${IN}" stroke-width="1.4" ${W}/>
<path d="M16 26c-6 2-8 8-6 14M22 22c-3-5 1-9 6-9" fill="${PK}" stroke="${IN}" stroke-width="2.2" ${W}/>
<circle cx="25" cy="29" r="1.7" fill="${DK}"/><circle cx="37.4" cy="31" r="1.1" fill="${DK}"/>`);
export function GiftArt({ id, e, s = 40, cls }) {
  const art = ART[id];
  if (!art) return html`<span class=${cx('gift-art-emoji', cls)} style=${`font-size:${Math.round(s * 0.72)}px;line-height:1`} role="img" aria-hidden="true">${e || '🎁'}</span>`;
  return html`<svg class=${cx('gift-art', cls)} width=${s} height=${s} viewBox="0 0 64 64" aria-hidden="true" focusable="false" dangerouslySetInnerHTML=${{ __html: art }} />`;
}
