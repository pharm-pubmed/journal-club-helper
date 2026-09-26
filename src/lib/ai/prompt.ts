/**
 * Builds the extraction request from `src/prompts/extract.md` (issue #34).
 *
 * Spec §4.7 keeps prompts out of code, so the wording lives in the Markdown file
 * and this module only splits it and fills the three placeholders. It is also
 * the one place that decides what leaves the device: `aiInputFrom` copies the
 * three permitted fields by name, so a caller holding an appraisal full of the
 * user's notes cannot pass them on by accident.
 *
 * Pure module: no `chrome.*`, no DOM.
 */
import extractMarkdown from '../../prompts/extract.md?raw';
import type { PubMedArticle } from '../types';
import type { AiInput } from './types';

const SYSTEM_MARKER = '<!-- system -->';
const USER_MARKER = '<!-- user -->';

export interface PromptParts {
  system: string;
  userTemplate: string;
}

export function splitPrompt(markdown: string): PromptParts {
  const systemAt = markdown.indexOf(SYSTEM_MARKER);
  const userAt = markdown.indexOf(USER_MARKER);
  if (systemAt === -1 || userAt === -1 || userAt < systemAt) {
    throw new Error(`The prompt needs "${SYSTEM_MARKER}" followed by "${USER_MARKER}".`);
  }
  return {
    system: markdown.slice(systemAt + SYSTEM_MARKER.length, userAt).trim(),
    userTemplate: markdown.slice(userAt + USER_MARKER.length).trim(),
  };
}

const EXTRACT_PROMPT = splitPrompt(extractMarkdown);

export const EXTRACT_SYSTEM_PROMPT = EXTRACT_PROMPT.system;

/** Copies exactly the fields spec §4.7 allows to be sent, and nothing else. */
export function aiInputFrom(
  article: Pick<PubMedArticle, 'title' | 'abstract' | 'publicationTypes'>,
): AiInput {
  return {
    title: article.title,
    abstract: article.abstract,
    publicationTypes: [...article.publicationTypes],
  };
}

/**
 * The tags that delimit the fields in the user message. Text inside a field that
 * opens or closes one of them is defused, so an abstract cannot end its own
 * block and start something that reads like a new one. Only these tags are
 * touched: "p<0.05" and every figure stay as the abstract wrote them, which is
 * what grounding compares against.
 */
const DELIMITER = /<(\/?)(title|publication_types|abstract)\b/gi;

function defuse(text: string): string {
  return text.replace(DELIMITER, '&lt;$1$2');
}

/**
 * One pass over the template, so a placeholder that happens to appear inside
 * an abstract is left as text instead of being filled in turn.
 */
export function renderUserMessage(input: AiInput, template = EXTRACT_PROMPT.userTemplate): string {
  const values: Record<string, string> = {
    title: defuse(input.title),
    publicationTypes: defuse(input.publicationTypes.join('; ')),
    abstract: defuse(input.abstract),
  };
  return template.replace(/\{\{(title|publicationTypes|abstract)\}\}/g, (_, key: string) =>
    String(values[key]),
  );
}
