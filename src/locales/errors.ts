/**
 * Errors shown to the reader, written in the reader's language (#82).
 *
 * The modules that throw them keep an English message, which logs and tests
 * read, and attach a kind or code with the values a message needs. Anything
 * without one, such as an error from the browser itself, is shown as it is.
 */
import { EutilsError } from '../lib/eutils';
import { StorageError } from '../lib/storage';
import type { Messages } from './en';

function rawMessage(error: unknown): string | null {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return null;
}

function ncbiMessage(error: EutilsError, m: Messages): string {
  const { pmid = '', status, cause = '', notPmid, cutOff, notXml } = error.detail;
  const t = m.errors.ncbi;
  switch (error.kind) {
    case 'timeout':
      return t.timeout;
    case 'rate-limit':
      return t.rateLimit;
    case 'network':
      return cutOff ? t.cutOff(cause) : t.network(cause);
    case 'http':
      if (notXml) return t.notXml;
      return status === undefined ? error.message : t.http(status);
    case 'book':
      return t.book(pmid);
    case 'no-abstract':
      return t.noAbstract(pmid);
    case 'not-found':
      return notPmid ? t.notPmid(pmid) : t.notFound(pmid);
  }
}

function storageMessage(error: StorageError, m: Messages): string {
  const t = m.errors.storage;
  const v = error.values;
  switch (error.code) {
    case 'not-preserved':
      return t.notPreserved;
    case 'no-pmid':
      return t.noPmid;
    case 'too-large':
      return t.tooLarge(v.kb ?? 0, v.limitKb ?? 0);
    case 'not-json':
      return t.notJson;
    case 'not-export':
      return t.notExport;
    case 'older-version':
      return t.olderVersion;
    case 'other-version':
      return t.otherVersion;
    case 'no-list':
      return t.noList;
    case 'nothing-to-import':
      return t.nothingToImport;
    case 'none-readable':
      return t.noneReadable;
    case 'import-stopped':
      return t.importStopped(
        v.imported ?? 0,
        v.skipped ?? 0,
        describeError(v.cause, m, t.storageFailed),
      );
  }
}

/** The reader-facing text for `error`, or `fallback` when it carries none. */
export function describeError(error: unknown, m: Messages, fallback: string): string {
  if (error instanceof EutilsError) return ncbiMessage(error, m);
  if (error instanceof StorageError) return storageMessage(error, m);
  return rawMessage(error) ?? fallback;
}
