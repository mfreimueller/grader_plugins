import { fail, ok, type Result } from './result';

const toId = (value: string | null): number | null => {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  const id = Number(value.trim());
  return id > 0 ? id : null;
};

/** Accepts `12706` or a course url like `https://moodle.spengergasse.at/course/view.php?id=12706`. */
export function parseMoodleCourseId(input: string): Result<number> {
  const text = input.trim();
  const id = /^\d+$/.test(text) ? toId(text) : toId(urlId(text));
  return id === null ? fail('Bitte eine Kurs-ID (z. B. 12706) oder die Kurs-URL aus Moodle eingeben.') : ok(id);
}

function urlId(text: string): string | null {
  try {
    return new URL(text).searchParams.get('id');
  } catch {
    return null;
  }
}
