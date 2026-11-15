/**
 * Japanese messages (#82). Typed against `en.ts`, so every English message has
 * a translation here. Terms follow docs/GLOSSARY.ja.md.
 */
import type { Messages } from './en';

const n = (count: number) => count.toLocaleString('ja-JP');

/** 「吟味 3 件」「吟味 3 件と、読み取れない記録 2 件」, or only the second half. */
function recordsPhrase(readable: number, unreadable: number): string {
  const hidden = `このバージョンで読み取れない記録 ${n(unreadable)} 件`;
  if (unreadable === 0) return `吟味 ${n(readable)} 件`;
  if (readable === 0) return hidden;
  return `吟味 ${n(readable)} 件と、${hidden}`;
}

export const ja: Messages = {
  common: {
    productName: 'Journal Club Helper',
  },

  app: {
    footer: '批判的吟味の学習用ツールです。臨床上の助言ではありません。',
    settings: '設定',
  },

  tabs: {
    listLabel: '吟味の項目',
    pico: 'PICO',
    numbers: '数値',
    validity: '吟味',
    export: '出力',
  },

  header: {
    etAl: 'ほか',
    viaEutils: 'NCBI E-utilities から取得',
    pmid: (pmid: string) => `PMID ${pmid}`,
  },

  empty: {
    noArticle: 'PubMed の抄録ページを開くと始められます',
    noArticleHint:
      'このパネルは 1 件の論文の抄録を読み取ります（pubmed.ncbi.nlm.nih.gov で、末尾が PMID のアドレス）。検索結果のページやほかのサイトは読み取りません。',
    unreadableTitle: 'このページの抄録を読み取れませんでした',
    unreadableHint: (pmid: string | null) =>
      'この論文には抄録がないか（レターや論説によくあります）、PubMed のページの作りが変わった可能性があります。' +
      '同じ論文を NCBI の E-utilities から取得することもできます。' +
      `送られるのは PMID${pmid ? `（${pmid}）` : ' '}とこの拡張機能の名前だけです。初回はブラウザが許可を求めます。`,
    fetching: (pmid: string) => `PMID ${pmid} を NCBI から取得しています…`,
    fetchFromNcbi: 'NCBI から取得',
    readAgain: 'ページを読み直す',
    errorTitle: 'このページを読み取れませんでした',
    retry: '再試行',
    nothingToAppraise: 'このページには吟味できる内容がありません',
    looking: 'PubMed の抄録を探しています…',
  },

  pageButton: {
    label: '抄読会',
    title: '批判的吟味のパネルを開く',
    stale: 'ページを再読み込み',
    staleTitle: '拡張機能が更新されました。パネルを使うには、このページを再読み込みしてください。',
  },

  action: {
    active: 'Journal Club Helper を開く',
    idle: 'Journal Club Helper — PubMed の抄録ページで使えます',
  },

  options: {
    documentTitle: 'Journal Club Helper — 設定',
    tagline:
      '設定と保存データ。このページの内容はすべて、この端末のこのブラウザに保存されています。',

    languageHeading: '言語',
    languageNote:
      'パネル、チェックリスト、出力する要約がこの言語になります。自分で入力した文章は入力したまま、PubMed の論文情報は掲載されたままです。',
    languageLegend: '表示する言語',
    languageAuto: (shown: string) => `ブラウザに合わせる（現在は${shown}で表示）`,
    languageEnglish: 'English',
    languageJapanese: '日本語',
    languageNames: { en: '英語', ja: '日本語' },
    languageSaveError: '言語の設定を保存できませんでした。',

    dataHeading: '保存データ',
    loadError: 'このブラウザから保存データを読み取れませんでした。',
    reading: '保存した吟味を読み込んでいます…',
    countLabel: (_count: number, max: number) => `件を保存済み（上限 ${n(max)} 件）`,
    nothingSaved:
      'まだ何も保存されていません。PubMed の抄録を開き、サイドパネルで吟味を始めると、ここに自動で保存されます。',
    alsoStored: (unreadable: number) =>
      `このバージョンで読み取れない記録も ${n(unreadable)} 件保存されています。上書きせずに残していますが、一覧と書き出しには含まれません。「すべての吟味を削除」では、これらも削除されます。`,
    nearCap: (max: number) =>
      `保存の上限に近づいています。${n(max)} 件を超えると、最後に編集してから最も時間がたった吟味が削除されます。古いものも残したい場合は、バックアップを書き出してください。`,
    mostRecent: '最近の吟味',
    listMeta: (pmid: string, date: string) => `PMID ${pmid} · ${date} に編集`,
    unknownDate: '日付不明',
    andMore: (count: number) => `…ほか ${n(count)} 件`,

    exportHeading: '書き出し',
    exportNote:
      'すべての吟味と利用回数を、1 つの JSON ファイルとしてダウンロードフォルダに保存します。アップロードは一切しません。ファイルはこのページの中で作られ、そのままブラウザに渡されます。',
    exportAll: 'すべて書き出す',
    exported: (count: number) => `${n(count)} 件の吟味をダウンロードフォルダに保存しました。`,
    exportError: 'バックアップファイルを作れませんでした。',

    importHeading: '読み込み',
    importNote: 'すでに保存されているデータをどう扱うかを選んでください。',
    importLegend: 'バックアップを読み込むとき',
    mergeTitle: '統合する（推奨）',
    mergeHint:
      'ここに保存されているものを残したまま、ファイルの吟味を追加します。同じ論文が両方にある場合は、新しい方を残します。',
    replaceTitle: '置き換える',
    replaceHint:
      'ここに保存されている吟味をすべて削除してから、ファイルを読み込みます。ファイルにないものは失われます。利用回数だけのバックアップなら、今の吟味はすべて残ります。',
    countsNote:
      '統合する場合、下の利用回数は大きい方の値を残します。置き換える場合は、ファイルの値になります。',
    chooseFile: 'バックアップファイルを選ぶ…',
    countsRestored: '利用回数を復元しました。今の吟味はそのまま残しています。',
    importSummary: (imported: number, skipped: number, mode: 'merge' | 'replace') => {
      const head =
        mode === 'replace'
          ? `ここに保存されていたものを、ファイルの ${n(imported)} 件の吟味で置き換えました。`
          : `${n(imported)} 件の吟味を読み込みました。`;
      if (skipped === 0) return head;
      const why =
        mode === 'replace'
          ? '読み取れなかったため'
          : 'ここに保存済みのものの方が新しいか、読み取れなかったため';
      return `${head}${n(skipped)} 件は読み込みませんでした（${why}）。`;
    },
    importError:
      'このファイルを読み取れませんでした。この拡張機能で書き出したバックアップを選んでください。',

    deleteHeading: '削除',
    confirmLabel: 'すべての吟味の削除を確認',
    confirmText: (count: number, unreadable: number) =>
      `${recordsPhrase(count, unreadable)}を削除しますか？ データはこの端末のこのブラウザにしかありません。サーバー上のコピーも、復元に使えるアカウントもないため、元に戻せません。あとで必要になる可能性が少しでもあれば、先にバックアップを書き出してください。`,
    cancel: 'キャンセル',
    confirmDelete: 'すべて削除する',
    deleteNote: '保存しているすべての吟味をこのブラウザから削除します。利用回数は残ります。',
    deleteAll: 'すべての吟味を削除',
    deleted: (deleted: number, unreadable: number) =>
      `${recordsPhrase(deleted, unreadable)}を削除しました。下の利用回数は残っています。`,
    deleteError: '吟味を削除できませんでした。',

    usageHeading: '利用回数（この端末だけに保存）',
    usageNote:
      'この数字がブラウザの外に出ることはありません。このバージョンには分析やトラッキングの仕組みが一切なく、このページはネットワーク通信をまったく行いません。送り先のサーバーもありません。デベロッパーツールの「ネットワーク」タブで確かめることもできます。数えているのは、ここであなたが見られるようにするためだけで、拡張機能を削除すると消えます。',
    panelOpens: 'サイドパネルを開いた回数',
    exports: '要約を出力した回数',
    aiRuns: 'AI の実行回数',
    aiNote:
      'このバージョンでは AI の実行回数は 0 のままです。AI の機能は今後のバージョンで追加する予定で、いまインストールされているものには含まれていません。',

    aboutHeading: 'この拡張機能について',
    version: (version: string | null) => (version ? ` — バージョン ${version}` : ' — 開発版'),
    about: (product: string) =>
      `${product} は、抄読会や論文の読み方の学習のための、批判的吟味の学習用ツールです。臨床判断を支援するものではありません。推奨、解釈、臨床上の助言は一切行わず、患者さんについての判断に使ってはいけません。論文の要約も作りません。PICO、研究デザイン、NNT を含む絶対効果、妥当性のチェックリストといった吟味の枠組みを用意し、それをあなたが埋めます。要約に書かれる判断はすべてあなた自身のものです。書いた内容は必ず論文の本文と照らし合わせてください。`,
    notAffiliated: 'NLM / NIH とは関係ありません。',
    privacy: 'プライバシーポリシー',
    report: '不具合の報告・ご意見',
  },
};
