// One notice for the footer and Settings → About. The year follows the clock:
// "© 2026" now, "© 2026–2027" next year. FIRST_YEAR is the first release; ../LICENSE says the same.
export const COPYRIGHT_HOLDER = "Mariusz Winiarz";
const FIRST_YEAR = 2026;

export function copyright(): string {
  const year = new Date().getFullYear();
  return `© ${year > FIRST_YEAR ? `${FIRST_YEAR}–${year}` : FIRST_YEAR} ${COPYRIGHT_HOLDER}`;
}
