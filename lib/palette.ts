/** Option colours: option A is the same colour on a phone and on the results screen. */
export const OPTION_COLORS = ["#ffb703", "#4ea8de", "#f05d7e", "#1fa39a", "#9b8cf2", "#9bc53d", "#ff9f68", "#c3cbe0"];

export const optionColor = (i: number) => OPTION_COLORS[i % OPTION_COLORS.length];

export const optionLetter = (i: number) => String.fromCharCode(65 + i);

export const optionLabel = (option: string, i: number) => option || `Option ${i + 1}`;
