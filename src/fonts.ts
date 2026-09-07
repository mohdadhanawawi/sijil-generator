export type FontOption = {
  label: string;
  family: string;
  weight: string;
};

// Playfair Display, Great Vibes and Montserrat are loaded via the Google
// Fonts <link> in index.html. Georgia needs no loading - it ships with
// every OS - and is the safe default while the others download.
export const FONT_OPTIONS: FontOption[] = [
  { label: "Georgia (Serif Klasik)", family: "Georgia, 'Times New Roman', serif", weight: "700" },
  { label: "Playfair Display (Serif Elegan)", family: "'Playfair Display', serif", weight: "700" },
  { label: "Great Vibes (Skrip/Kursif)", family: "'Great Vibes', cursive", weight: "400" },
  { label: "Montserrat (Sans Moden)", family: "'Montserrat', sans-serif", weight: "700" },
];

export function fontWeightFor(family: string): string {
  return FONT_OPTIONS.find((f) => f.family === family)?.weight ?? "700";
}
