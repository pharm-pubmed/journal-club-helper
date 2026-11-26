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

  numbers: {
    title: '絶対効果と NNT',
    lead: '抄録に書かれた結果を選ぶか、自分で入力してください。求められるまで計算はしません。',
    detected: 'この抄録で見つかった数値',
    none: 'この抄録には数値の結果が見つかりませんでした',
    noneHint:
      '抄録では数値が文章に埋もれていたり、本文にしか書かれていなかったりします。下に手で入力してください。',
    kindBadge: { 'percent-pair': '% の組', 'fraction-pair': 'n / N', ratio: '比' },
    kindTitle: {
      'percent-pair': '割合（%）で示された 2 群のイベント発生率',
      'fraction-pair': '2 群それぞれのイベント数と人数',
      ratio: '相対指標：リスク比、ハザード比、またはオッズ比',
    },
    use: '使う',
    useLabel: (raw: string) => `${raw} を計算に使う`,
    inUse: '計算に使用中',
    calculator: '計算',
    modesLabel: '抄録から得られる数値の形',
    mode: { rates: '割合', counts: '人数', ratio: '比' },
    modeHint: {
      rates: '2 群のイベント発生率（%）。割合には群の人数が含まれないため、信頼区間は出せません。',
      counts: '各群のイベント数と人数。データから 95% 信頼区間を計算できるのは、この形だけです。',
      ratio:
        'RR、HR、OR と、それを当てはめる基準のリスク。比の 95% 信頼区間を入れると、区間も換算します。',
    },
    controlGroup: '対照群',
    interventionGroup: '介入群',
    cerField: 'イベント発生率（CER）',
    eerField: 'イベント発生率（EER）',
    events: 'イベント数',
    participants: '人数',
    measure: '指標',
    measureLabel: {
      RR: 'RR（リスク比）',
      HR: 'HR（ハザード比）',
      OR: 'OR（オッズ比）',
    },
    estimate: '推定値',
    ciLow: '95% 信頼区間の下限（任意）',
    ciHigh: '95% 信頼区間の上限（任意）',
    acr: '想定する対照群イベント発生率（ACR）',
    acrHint:
      'この比を当てはめたい、治療しない場合のリスク。この試験、ガイドライン、目の前の患者さんなどから決めます。論文ではなく、あなたの判断です。',
    whichControl: 'どちらが対照群ですか？',
    firstInSentence: '（文中で 1 つ目）',
    secondInSentence: '（文中で 2 つ目）',
    noLongerMatch:
      '入力欄の値が、抄録のどちらの値とも一致しなくなりました。選び直すと読み込み直します。自分の数値のままでもかまいません。',
    manualControl:
      '対照群の欄に入れた値を、治療しない群として扱います。入れ替えると「利益」が「害」になるので、確認してください。',
    swap: '対照群と介入群を入れ替える',
    yourCall: '抄録にはどちらがどの群か書かれていないので、ここはあなたが判断してください。',
    calculate: '計算する',
    clear: '消去',
    noResult:
      'まだ結果はありません。欄を埋めて「計算する」を押すか、見つかった数値の「使う」を押してください。',
    result: '結果',
    direction: (nnt: number | null, harm: boolean) =>
      nnt === null
        ? '2 群のイベント発生率が同じなので、NNT にする絶対差がありません。'
        : harm
          ? `この研究では、対照ではなく介入を約 ${nnt} 人が受けると、イベントが 1 件多く起こります。`
          : `この研究では、対照ではなく介入を約 ${nnt} 人が受けると、イベントが 1 件防がれます。`,
    crossingTitle: 'このデータは利益とも害とも矛盾しません',
    crossing: (low: string, high: string, nntLow: number | null, nntHigh: number | null) => {
      const ends: string[] = [];
      if (nntLow !== null) ends.push(`利益側の端で NNTB ${nntLow}`);
      ends.push('中央でまったく差なし');
      if (nntHigh !== null) ends.push(`害側の端で NNTH ${nntHigh}`);
      return [
        `ARR の 95% 信頼区間は ${low} から ${high} ポイントで、0 を含みます。`,
        `そのため NNT の範囲は無限大をまたぎます：${ends.join('、次に')}。`,
        'このデータは利益とも害とも矛盾しないため、上の NNT の値だけを取り出して読まないでください。',
      ];
    },
    cer: '対照群イベント発生率（CER）',
    eer: '介入群イベント発生率（EER）',
    ari: '絶対リスク増加（ARI）',
    arr: '絶対リスク減少（ARR）',
    rri: '相対リスク増加（RRI）',
    rrr: '相対リスク減少（RRR）',
    points: (value: string) => `${value} ポイント`,
    rrrUndefined: '定義できません（対照群にイベントがありません）',
    ciForArr: 'ARR の 95% 信頼区間',
    ciRange: (low: string, high: string) => `${low}〜${high} ポイント`,
    ratesNoCi:
      '2 つの割合には群の人数が含まれないため、この推定値には信頼区間がありません。抄録にイベント数と人数があれば、「人数」に切り替えると求められます。',
    required: (field: string) => `${field}を入力してください。`,
    enterNumber: '数値を入力してください。',
    enterPercent: '0〜100 の割合を入力してください。',
    enterWhole: '整数を入力してください。',
    enterWholeMin: (minimum: number) => `${minimum} 以上の整数を入力してください。`,
    enterRatio: '0 より大きい比を入力してください。',
    enterAcr: '0 より大きく 100 より小さい割合を入力してください。',
    bothEnds: '区間は両端を入力するか、両方とも空欄にしてください。',
    fieldName: {
      cer: '対照群のイベント発生率',
      eer: '介入群のイベント発生率',
      controlEvents: '対照群のイベント数',
      controlTotal: '対照群の人数',
      interventionEvents: '介入群のイベント数',
      interventionTotal: '介入群の人数',
      estimate: (measure: string) => `${measure} の推定値`,
      acr: '想定する対照群イベント発生率',
      ciLow: '信頼区間の下限',
      ciHigh: '信頼区間の上限',
    },
    thrown: (message: string) => {
      if (/implies an event rate above 100/.test(message)) {
        return 'この比と対照群の発生率では、介入群の発生率が 100% を超えてしまいます。値を確認してください。';
      }
      if (/cannot exceed/.test(message)) return 'イベント数が人数を超えています。';
      return '入力した値では計算できません。値を確認してください。';
    },
    noDifference: (arr: string) => `差なし（ARR ${arr}）`,
    rangeTo: '〜',
    baselineWarning: (acr: string) =>
      `この絶対効果は、想定した対照群イベント発生率 ${acr} から推定したものです。治療しない場合のリスクがその値に近い患者さんにしか当てはまりません。`,
    oddsRatioWarning:
      '対照群のイベント発生率が高い場合（おおむね 10〜20% 超）、オッズ比はリスクの変化を大きく見せます。',
    hazardRatioWarning:
      'ハザード比を累積の発生率に当てはめるのは近似です。対照群イベント発生率は、試験と同じ追跡期間のものである必要があります。',
    caseControlCaveat:
      '症例対照研究はアウトカムをもとに対象を選ぶため、症例群と対照群で曝露のあった人の割合はリスクではなく、そこから ARR、NNT、NNH は読み取れません。成り立つのは、研究が報告するオッズ比を、自分で選んだ基準のリスクに当てはめる方法です。',
    crossSectionalCaveat:
      '横断研究はある一時点の有病率を測るため、これらの割合はリスクではなく有病率です。その差は有病率の差であり、そこから読んだ NNT や NNH は、起きた（または防いだ）イベントの数を表しません。',
    howSummary: '計算方法',
    how: [
      {
        formula: 'ARR = CER − EER',
        text: '対照群のイベント発生率から介入群のものを引いた値です。患者 100 人あたりのイベント数として読みます。NNT のもとになる数値で、抄録で最も省かれやすいものです。',
      },
      {
        formula: 'RRR = ARR ÷ CER',
        text: '同じ差を、対照群のリスクに対する割合で表したものです。イベントが多くても少なくても同じに見えるため、相対的な減少はわずかな絶対効果を大きく見せることがあります。',
      },
      {
        formula: 'NNT = 1 ÷ ARR（切り上げ）',
        text: 'イベントを 1 件防ぐために何人を治療するか。人数に端数はないので切り上げます。ARR が負の場合も同じ計算をし、NNH（イベントが 1 件多く起こるまでに治療する人数）として示します。',
      },
      {
        formula: '95% 信頼区間',
        text: '「人数」では、ARR の Wald 区間（リスク差 ± 1.96 標準誤差）を求め、逆数にして NNT の両端を出します。「比」では、比の区間を入力すると、推定値と同じ基準のリスクで同じように換算します。割合だけでは群の人数がわからないため、「割合」では点推定のみで区間は出ません。ARR の区間が 0 を含むと、NNT の両端は無限大をはさんで反対側になります。',
      },
      {
        formula: 'RR または HR から：EER = 比 × ACR',
        text: '相対指標は、当てはめる基準のリスクを与えてはじめて絶対効果になります。同じ比でも、リスクの高い集団と低い集団では NNT が大きく変わるので、想定する対照群イベント発生率は論文ではなくあなたの判断です。',
      },
      {
        formula: 'OR から：EER = (OR × ACR) ÷ (1 − ACR + OR × ACR)',
        text: 'オッズ比はオッズを通して換算する必要があるため、同じ大きさの OR と RR でも絶対効果は同じになりません。イベントが多いほど差は広がり、対照群でおおむね 10〜20% を超えると、OR をリスク比のように読むとリスクの変化を過大に見積もります。',
      },
      {
        formula: 'ハザード比',
        text: 'ハザード比は、時間とともにイベントがどれだけ速く積み重なるかを表します。1 つの累積リスクに当てはめるのは近似で、入力した対照群イベント発生率が試験と同じ追跡期間のものである場合にだけ成り立ちます。',
      },
    ],
    howFootnote:
      'これらの数値は研究の対象集団についてのもので、目の前の 1 人の患者さんについてではありません。論文を読むための補助であり、治療の推奨ではありません。',
    cochrane: 'Cochrane Handbook 第 12 章 §12.5',
    cebm: 'CEBM Oxford：治療必要数（NNT）',
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
