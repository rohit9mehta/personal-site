// Hand-block-print motifs, drawn on a 100×100 block. Each is a solid shape
// ("body", inked) with carved-out lines and dots ("cuts"), the way a carved
// wooden block leaves bare cloth. They're installed once as <symbol>s, so the
// seal, the border and every print share them, and are inked with
// currentColor.

export interface Motif {
  id: string;
  body: string;
  cuts: string;
}

const around = (count: number, draw: (angle: number) => string, offset = 0) =>
  Array.from({ length: count }, (_, i) => draw(offset + (360 / count) * i)).join('');

const petal = 'M50 50C39 39 40 19 50 6c10 13 11 33 0 44z';

/** Eight-petalled buti, the little flower scattered across block-printed cloth. */
const buti: Motif = {
  id: 'buti',
  body:
    around(8, (a) => `<path d="${petal}" transform="rotate(${a} 50 50)"/>`) +
    around(8, (a) => `<circle cx="50" cy="12" r="4" transform="rotate(${a} 50 50)"/>`, 22.5),
  cuts:
    around(8, (a) => `<path d="M50 40V18" transform="rotate(${a} 50 50)"/>`) +
    '<circle cx="50" cy="50" r="5" fill="#000" stroke="none"/>',
};

const paisley = 'M42 93C20 93 9 76 12 59c3-17 19-26 35-28 13-2 22-8 24-22 9 12 14 30 11 47-4 22-17 37-40 37z';

/** Ambi: the paisley, with a smaller paisley carved inside it. */
const ambi: Motif = {
  id: 'ambi',
  body: `<path d="${paisley}"/><circle cx="72" cy="9" r="5"/>`,
  cuts:
    `<path d="${paisley}" transform="translate(44 62) scale(.58) translate(-44 -62)"/>` +
    '<circle cx="42" cy="64" r="5" fill="#000" stroke="none"/>' +
    around(6, (a) => `<circle cx="42" cy="51" r="2.2" fill="#000" stroke="none" transform="rotate(${a} 42 64)"/>`),
};

/** Eight-pointed star from a jaal (lattice) print. */
const tara: Motif = {
  id: 'tara',
  body: '<rect x="20" y="20" width="60" height="60"/><rect x="20" y="20" width="60" height="60" transform="rotate(45 50 50)"/>',
  cuts:
    '<rect x="33" y="33" width="34" height="34"/><rect x="33" y="33" width="34" height="34" transform="rotate(45 50 50)"/>' +
    '<circle cx="50" cy="50" r="6" fill="#000" stroke="none"/>',
};

/** A coffee bean, because of course. */
const bean: Motif = {
  id: 'bean',
  body: '<ellipse cx="50" cy="50" rx="27" ry="39" transform="rotate(-28 50 50)"/>',
  cuts: '<path d="M50 14c-11 20 11 52 0 72" transform="rotate(-28 50 50)" stroke-width="6"/>',
};

/** A kulhad, the clay cup chai comes in, still steaming. */
const kulhad: Motif = {
  id: 'kulhad',
  body:
    '<path d="M26 38h48l-6 52c-1 5-35 5-36 0z"/><rect x="21" y="31" width="58" height="11" rx="3"/>' +
    '<path d="M40 25c-6-5 6-8 0-13s6-8 0-13M60 25c-6-5 6-8 0-13s6-8 0-13" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  cuts: '<path d="M31 55h38"/>' + [38, 50, 62].map((x) => `<path d="M${x} 64l5 6-5 6-5-6z" fill="#000"/>`).join(''),
};

/** Surya: a sun with sixteen rays. */
const surya: Motif = {
  id: 'surya',
  body:
    '<circle cx="50" cy="50" r="21"/>' +
    around(16, (a) => `<path d="M46 27L50 4l4 23z" transform="rotate(${a} 50 50)"/>`),
  cuts: '<circle cx="50" cy="50" r="13"/><circle cx="50" cy="50" r="5" fill="#000" stroke="none"/>',
};

export const MOTIFS: readonly Motif[] = [buti, ambi, tara, bean, kulhad, surya];

/** Markup for one motif as a <symbol>, its cuts applied through a mask. */
export function symbolMarkup({ id, body, cuts }: Motif): string {
  return (
    `<symbol id="${id}" viewBox="0 0 100 100">` +
    `<mask id="${id}-cuts" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">` +
    `<rect width="100" height="100" fill="#fff"/>` +
    `<g fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${cuts}</g>` +
    `</mask>` +
    `<g fill="currentColor" mask="url(#${id}-cuts)">${body}</g>` +
    `</symbol>`
  );
}
