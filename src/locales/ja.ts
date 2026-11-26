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

  labels: {
    design: {
      rct: 'ランダム化比較試験',
      'non-randomized-trial': '非ランダム化試験',
      cohort: 'コホート研究',
      'case-control': '症例対照研究',
      'cross-sectional': '横断研究',
      'sr-ma': 'システマティックレビュー／メタアナリシス',
      diagnostic: '診断精度研究',
      unclear: '判定できず',
    },
    designUnclearOption: '不明・その他',
    subtype: {
      parallel: '並行群間',
      crossover: 'クロスオーバー',
      cluster: 'クラスター',
      'non-inferiority': '非劣性',
      'systematic-review': 'システマティックレビュー',
      'meta-analysis': 'メタアナリシス',
      'network-meta-analysis': 'ネットワークメタアナリシス',
    },
    subtypeLine: {
      'non-inferiority': '非劣性デザイン',
      equivalence: '同等性デザイン',
      crossover: 'クロスオーバーデザイン',
      cluster: 'クラスターランダム化デザイン',
      parallel: '並行群間デザイン',
      'systematic-review': 'システマティックレビュー',
      'meta-analysis': 'メタアナリシス',
      'network-meta-analysis': 'ネットワークメタアナリシス',
    },
    subtypeLineFallback: (subtype: string) => `${subtype} デザイン`,
    designWithSubtype: (design: string, subtype: string) => `${design}（${subtype}）`,
    confidence: {
      high: '文献の種類（publication type）から判定',
      medium: '抄録の語句から判定',
      low: '判定できず',
    },
    evidenceKind: { 'publication-type': '文献の種類', keyword: '抄録の語句' },
    section: { 'internal-validity': '内的妥当性', applicability: '適用可能性' },
    sourceScope: {
      abstract: '抄録のみ',
      'full-text': '本文',
      supplement: '補足資料',
      protocol: 'プロトコル',
      registry: '試験登録',
      other: 'その他の資料',
    },
    evidenceNeed: {
      abstract: 'たいていは抄録で答えられます。',
      'full-text': 'たいていは本文が必要です。抄録にここまで書かれることはまれです。',
      'protocol-or-registry': 'たいていはプロトコル、統計解析計画書、または試験登録が必要です。',
    },
    verdict: { yes: 'はい', no: 'いいえ', unclear: '不明' },
    pico: { P: '対象', I: '介入', C: '比較', O: 'アウトカム' },
  },

  design: {
    key: '研究デザイン:',
    setManually: '手動で設定',
    noSubtype: '細分類なし',
    evidence: (count: number) => `根拠（${count}）`,
    design: 'デザイン',
    subtype: '細分類',
    reset: '判定結果に戻す',
    notDetectedHint:
      '文献の種類にも抄録の語句にも、研究デザインに当てはまるものがありませんでした。チェックリストと出力をこの論文に合わせるため、下から選んでください。',
    suggested: (what: string) => `自動判定の結果は「${what}」でした。`,
    foundNoSubtype: '自動判定では細分類は見つかりませんでした。',
  },

  pico: {
    title: '臨床疑問',
    intro:
      '臨床疑問を自分の言葉で書いてください。下の強調表示は、手がかりになる語句を機械的に拾った候補で、内容を抽出したものではありません。拾えないものも多いので、自分で文章を選択して入れるのが基本です。',
    placeholder: {
      P: '例：肺炎で入院した成人',
      I: '例：アモキシシリン内服 5 日間',
      C: '例：プラセボ、または同じ薬を 10 日間',
      O: '例：30 日以内の死亡',
    },
    clear: '消去',
    clearField: (field: string) => `「${field}」を消去`,
    markTitle: (field: string, reason: string, also: string[]) => {
      const cue =
        reason === 'numeric result' ? '結果の数値を含むため' : `抄録に “${reason}” とあるため`;
      const tail =
        also.length > 0
          ? `同じ箇所は${also.map((name) => `「${name}」`).join('と')}の候補でもあります。`
          : '';
      return `${cue}、「${field}」の候補にしています。${tail}`;
    },
    markLabel: (text: string, field: string) => `“${text}” を「${field}」に追加`,
    added: (field: string) => `「${field}」に追加しました。`,
    alsoAddTo: 'ほかの欄にも追加',
    addSelectionTo: '選択した文章の追加先',
    abstract: '抄録',
    showCandidates: '候補を表示',
    viewerNote: '抄録の写しです。PubMed のページ自体は変更しません。',
    helpSummary: '文章を欄に入れる方法',
    help: [
      '強調表示された語句をクリックすると、その欄に追加されます。',
      '抄録の文章を選択すると、追加先の欄を選べます。',
      'キーボード：Tab で強調表示に移動して Enter を押します。自由に選択するには、カーソルブラウジング（F7）をオンにし、Shift と矢印キーで選択して Enter を押します。',
      'すでに文章がある欄には、後ろに追加されます。上書きはしません。',
    ],
    fromTitle: 'タイトルから',
    addTitleTo: (field: string) => `タイトルを「${field}」に追加`,
    abstractText: '抄録の本文',
    chooserLabel: 'この語句を入れる PICO の欄を選ぶ',
    addTo: (field: string) => `「${field}」に追加`,
    close: '閉じる',
    noAbstract: 'このページには抄録がないため、強調表示はありません。上の 4 つの欄は使えます。',
  },

  validity: {
    title: '批判的吟味',
    sectionLede: {
      'internal-validity':
        'この研究が、自ら立てた疑問にどこまで答えられるかを見ます。方法を評価してください。手元の資料に書かれていない場合、それは確認できる範囲の限界であって、研究の欠点が見つかったわけではありません。',
      applicability:
        '上とは別の問いです。この研究から言えることが、目の前の患者さんにも当てはまるかを見ます。研究として確かでも当てはまらないことがあり、当てはまりそうでも研究として不確かなことがあります。',
    },
    unanswered: '未回答',
    clear: '取り消す',
    clearAnswer: (item: string) => `「${item}」の回答を取り消す`,
    readIn: '確認した資料',
    inherited: (scope: string) => `${scope}（全体の設定）`,
    lookFor: '確認するポイント',
    why: 'なぜ重要か',
    note: 'メモ',
    addNote: 'メモを追加',
    noteFor: (item: string) => `「${item}」のメモ`,
    notePlaceholder: 'この点について議論したいこと',
    extraChecks: '上の項目に加えて確認する項目',
    recordedNotScored: '記録のみ（評価には含めません）',
    answered: (answered: number, total: number) => `${total} 項目中 ${answered} 項目に回答`,
    tally: (count: number, verdict: string) => `${verdict} ${count}`,
    scopeTitle: 'どの資料をもとに吟味していますか？',
    scopeHint:
      '吟味と一緒に保存され、すべての項目の初期設定になります。出力を読む人に、何をもとに判断したかが伝わります。',
    lede: '「不明」は、手元の資料に書かれていないという意味です。根拠についての正直な答えであって、研究の減点ではありません。',
    helpSummary: '「はい」「いいえ」「不明」の意味',
    designNotDetected:
      '研究デザインを判定できませんでした。上の欄で選ぶか、この汎用チェックリストを使ってください。',
  },

  export: {
    title: '1 枚の要約',
    noArticle: 'このパネルに PubMed の論文が読み込まれていないため、出力できるものがありません。',
    bottomLine: '結論（自分の言葉で）',
    bottomLineHint: (product: string) =>
      `この論文から何が言えると考えるか、それをどの程度重視するかを、1〜2 文で書いてください。${product} が代わりに書くことはありません。入力したとおりに要約に入り、空欄なら空欄のままです。`,
    bottomLinePlaceholder:
      '例：絶対効果は大きいが、試験は早期中止され、アウトカム評価も盲検化されていない。効果の大きさを信じる前に本文を確認したい。',
    copyMarkdown: 'Markdown をコピー',
    copyText: 'テキストをコピー',
    download: '.md をダウンロード',
    copied: {
      markdown: 'Markdown をクリップボードにコピーしました。',
      text: 'テキストをクリップボードにコピーしました。',
    },
    saved: (filename: string) => `${filename} をダウンロードフォルダに保存しました。`,
    copyBlocked: (reason: string | null) =>
      `ブラウザがコピーを許可しませんでした${reason === null ? '' : `（${reason}）`}。`,
    noClipboard: 'このブラウザでは、パネルからクリップボードを使えません。',
    clipboardFallback:
      '下のプレビューの文章を選択して自分でコピーするか（Ctrl+C、Mac では Cmd+C）、「.md をダウンロード」を使ってください。',
    buildFailed: (reason: string | null) =>
      `ファイルを作れませんでした${reason === null ? '' : `（${reason}）`}。代わりに下のプレビューをコピーできます。`,
    preview: 'プレビュー（ボタンでコピーされる内容そのもの）',
    wrap: '長い行を折り返す',
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
