# SPEC: Journal Club Helper — Critical Appraisal Chrome Extension for PubMed

Claude Code 引き継ぎ仕様書。v0.1（MVP）〜v1.0 の範囲を定義する。
UI・ストア文言はすべて英語。コード・コミット・ドキュメントも英語。この仕様書だけ日本語。

---

## 0. 一言で

PubMed の抄録ページに張り付き、臨床家（レジデント・薬剤師・医学生）がジャーナルクラブや文献評価のためにやっている「批判的吟味」の型を、その場で埋められるようにする Chrome 拡張。
要約ツール（SciSpace / Scholarcy）と競合しない。**要約はしない。吟味の型を提供する。**

## 1. 背景と前提

- ターゲット: 米・英・加・豪の医学レジデント、薬学レジデント（PGY1/2）、医学生、看護実践者。ジャーナルクラブは修了要件で毎月発生する
- 痛み: 時間不足、統計の読解、相対リスクしか書かれてない抄録から絶対効果を出す作業
- 既存ツールの空白: 要約ツールは多数あるが、PICO・研究デザイン・ARR/NNT・妥当性チェックを抄録上で埋める道具はない。NNT 計算機は Web に無料で多数あるが、抄録から数字を拾ってその場で計算するものはない
- 位置づけは「教育・吟味の補助」。臨床判断の支援ではない。この線を UI 文言・ストア説明・免責で崩さない
- 12〜18 ヶ月以内の売却を前提に設計する（§10）

## 2. スコープ

### v0.1 MVP（無料機能のみ・サーバーなし）

1. PubMed 抄録ページで動く（`https://pubmed.ncbi.nlm.nih.gov/<PMID>/`）
2. 研究デザインの自動判定（Publication Type + 抄録キーワード、ルールベース）
3. PICO テンプレート（手入力。抄録からの候補ハイライトのみ）
4. 効果量の計算機（ARR / RRR / NNT / NNH、95%CI 付き）。抄録内の数値候補を検出して入力欄にプリフィル、確定はユーザー
5. デザイン別の妥当性チェックリスト（自作文言）
6. 1 枚サマリの書き出し（Markdown / クリップボード / プレーンテキスト）
7. 入力内容の PMID 単位ローカル保存

### v0.2 有料機能

8. AI 抽出（ユーザー自身の API キー持ち込み）: PICO 自動入力、結果数値の抽出、限界の候補、議論用の質問 3〜5 個
9. 課金（ExtensionPay: $4/月・$29/年）と無料枠の制限

### v0.3 公開

10. Chrome Web Store 掲載、プライバシーポリシー、ランディングページ 1 枚

### v1.0（公開後の反応で決める）

- Google Scholar / 主要ジャーナルサイトへの対応拡張
- PPTX 書き出し
- チームでの共有

### やらないこと（Non-goals）

- 論文の要約・平易化（既存ツールの領域）
- 全文 PDF の解析
- 臨床推奨・治療判断の出力
- ユーザーアカウント、クラウド同期（v1.0 まで不要）
- サーバーサイドの処理（AI もキー持ち込みで拡張から直接呼ぶ）

## 3. ユーザーフロー

1. PubMed 抄録ページを開く → ページ上部（Abstract 見出しの右）に小さな `Journal Club` ボタンが出る
2. クリック → Chrome Side Panel が開く（ページの DOM は改変しない。既存ツールの「消せないオーバーレイ」への不満を避ける）
3. パネル上部に自動判定: `Study design: RCT (parallel)` と判定根拠（Publication Type / キーワード）。手動で変更可
4. タブ構成: **PICO / Numbers / Validity / Export**
   - PICO: P・I・C・O の 4 欄。抄録内の候補語を薄くハイライト（クリックで欄に流し込む）
   - Numbers: 検出した数値候補をリスト表示（例: `12.3% vs 8.1%`, `HR 0.72 (95% CI 0.61–0.85)`, `45/300 vs 62/298`）。選ぶと計算機に入る。出力は ARR・RRR・NNT/NNH と 95%CI。CI が無限大をまたぐ場合は NNT→NNH の反転を明示
   - Validity: デザインに応じたチェックリスト（Yes / No / Unclear + メモ）
   - Export: 1 枚サマリのプレビュー → Copy Markdown / Copy plain text / Download .md
5. 入力は PMID 単位で `chrome.storage.local` に自動保存。同じ PMID を開けば復元
6. 有料（v0.2）: 各タブに `Auto-fill with AI` ボタン。初回は設定画面で API キー入力を促す

## 4. 機能仕様

### 4.1 対象ページの検出

- URL パターン `pubmed.ncbi.nlm.nih.gov/\d+/` のみ。検索結果一覧では動かない
- PMID は URL から取得。ページ DOM の抄録テキスト、Publication Type、MeSH は DOM から読む。DOM 構造が変わった場合に備え、E-utilities `efetch`（`db=pubmed&id=<PMID>&retmode=xml`）へのフォールバックを用意する（API キー不要、3 req/s 以内、User-Agent にツール名とメール）

### 4.2 研究デザイン判定（ルールベース）

優先順位:

1. Publication Type: `Randomized Controlled Trial` → RCT / `Meta-Analysis` `Systematic Review` → SR-MA / `Observational Study` + キーワードで Cohort / Case-Control / Cross-Sectional / `Clinical Trial` のみ → Non-randomized trial
2. 抄録キーワード（`randomized`, `randomised`, `double-blind`, `prospective cohort`, `retrospective`, `case-control`, `cross-sectional`, `we searched`, `pooled`）でフォールバック
3. どれにも当たらない → `Unclear` として全チェックリストから選ばせる

判定ロジックは `src/lib/design-classifier.ts` に隔離し、ユニットテストを 20 件以上用意する。

### 4.3 数値検出と計算

- 検出パターン（正規表現、`src/lib/number-extractor.ts`）:
  - パーセント対比: `X% vs Y%`, `X% versus Y%`, `X% and Y%`（`vs` 前後が同一アウトカム文にある場合を優先）
  - 分数対比: `a/n1 vs b/n2`, `a of n1 ... b of n2`
  - 比: `RR|HR|OR (=|of)? \d+\.\d+ \(95% CI[,:]? \d+\.\d+[–-]\d+\.\d+\)`
- 計算（`src/lib/effect-measures.ts`）:
  - CER, EER → ARR = CER − EER, RRR = ARR / CER, NNT = ceil(1/ARR)
  - 分数入力時は Wald 法で ARR の 95%CI、NNT の CI は ARR の CI の逆数。ARR の CI が 0 をまたぐ場合は「NNT ∞ をまたぐ（NNT→NNH）」と表示
  - RR/HR/OR のみの場合: ユーザーに対照群イベント率（ACR）を入力させ、Cochrane Handbook 12.5.4 の方法で ARR/NNT を推定。OR からの換算は「イベント率が高いと過大評価」の注意を出す
- 出典表記: 計算式の横に `Cochrane Handbook §12.5` `CEBM Oxford` へのリンク（自分の言葉で説明し、引用はしない）
- 計算ロジックは全てユニットテスト対象。既知の教科書例（CER 0.26 / EER 0.16 → NNT 10 など）で検証

### 4.4 妥当性チェックリスト

- デザイン別: RCT / Cohort / Case-Control / Cross-Sectional / SR-MA / Diagnostic accuracy / Unclear（共通版）
- 各 6〜10 項目。項目文は **自作**する。CASP / JBI / CONSORT 等の既存チェックリストは文言を転載しない（CASP は非商用ライセンス）。概念（無作為化・割付隠蔽・盲検化・ITT・追跡率・交絡・選択バイアス・出版バイアス 等）は使ってよいが、質問文はゼロから書く
- 各項目: `Yes / No / Unclear` + 任意メモ。項目ごとに「なぜ重要か」の 1〜2 文ヘルプ（自作）
- 項目定義は `src/data/checklists/*.json` に置き、コード変更なしで文言を直せる

### 4.5 書き出し

- 1 枚サマリの構成（固定順）:
  1. Citation（著者・誌名・年・PMID・DOI）
  2. Clinical question (PICO)
  3. Study design（判定と根拠）
  4. Key results（絶対効果を必ず含む。相対効果しか無ければ「絶対効果は抄録に無し」と明記）
  5. Validity（チェックリストの Yes/No/Unclear 一覧と、No/Unclear の項目のメモ）
  6. Bottom line（ユーザー入力の 1〜2 文。空なら空欄のまま出す。生成しない）
  7. Discussion questions（v0.2 の AI 機能。無料版は空欄テンプレ）
- 形式: Markdown（見出し・表）、プレーンテキスト、`.md` ダウンロード
- 免責を末尾に固定で 1 行: `Generated with <name> for educational purposes. Verify against the full text.`

### 4.6 保存

- `chrome.storage.local` に `appraisal:<PMID>` キーで JSON 保存。上限を超えたら古い順に削除（最大 500 件）
- 設定は `settings` キー。API キーは `chrome.storage.local`（sync には絶対に入れない）
- エクスポート/インポート（JSON 一括）を設定画面に用意する

### 4.7 AI 抽出（v0.2・有料）

- プロバイダ: Anthropic（`anthropic-dangerous-direct-browser-access: true` ヘッダで拡張から直接呼ぶ）、OpenAI。まず Anthropic のみ実装し、抽象化して後から追加可能に
- 送るのは抄録テキスト・タイトル・Publication Type のみ。ユーザーの入力メモは送らない
- 出力は JSON スキーマ固定（PICO 4 欄、数値候補の配列、限界候補の配列、議論質問の配列）。パース失敗時は再試行 1 回、それでも失敗なら「手動で入力」に戻す
- 生成結果は必ず「候補」として表示し、ユーザーが Accept しない限り欄に入らない
- レート・コストの表示: 1 回あたりの概算トークン数と料金の目安を設定画面に記載
- プロンプトは `src/prompts/*.md` に置き、コードから分離

### 4.8 課金（v0.2）

- ExtensionPay を使う。プラン: Monthly $4 / Yearly $29。7 日間トライアルなし（無料版で試せるため）
- 無料版の制限: AI 抽出は不可。他は無制限（NNT 計算・チェックリスト・書き出しは無料）
- 有料判定はローカルキャッシュし、オフラインでも直近の状態で動く
- 売却時の移管性が不明なため、`src/lib/license.ts` に抽象化し、Stripe Checkout + ライセンスキー方式に差し替えられる構造にしておく（§10）

## 5. 技術スタック

- Manifest V3、TypeScript、WXT（または Vite + CRXJS。WXT 推奨: MV3 の定型を減らせる）
- UI: Preact + 最小の CSS（Tailwind は使わない。パネルは軽く、外部フォント不要）
- Side Panel API（Chrome 114+）。Edge / Brave でも動くことを確認
- テスト: Vitest（lib 層）、Playwright（PubMed 実ページでのスモーク 3 本）
- CI: GitHub Actions で lint / typecheck / test / zip ビルド。Web Store へのアップロードは手動（v0.3 以降で自動化検討）
- 依存は最小。数式・正規表現・保存はすべて自前

### 権限（最小）

```
"permissions": ["storage", "sidePanel", "activeTab"],
"host_permissions": ["https://pubmed.ncbi.nlm.nih.gov/*"],
"optional_host_permissions": ["https://eutils.ncbi.nlm.nih.gov/*", "https://api.anthropic.com/*", "https://api.openai.com/*"]
```

- E-utilities と AI プロバイダはユーザーが機能を有効化したときに `permissions.request` で取得
- `tabs`、`<all_urls>`、`scripting` は使わない（ストア審査と売却時の評価の両方に効く）

### ディレクトリ

```
src/
  entrypoints/        # content script, sidepanel, background(最小), options
  lib/                # design-classifier, number-extractor, effect-measures, storage, license, ai
  data/checklists/    # design別 JSON
  data/verdict-help/  # 項目ヘルプ文
  prompts/            # AI用プロンプト
  ui/                 # Preact components
tests/
docs/                 # PRIVACY.md, STORE-LISTING.md, HANDOVER.md
```

## 6. Web Store 掲載

- 名前: `Journal Club Helper: Critical Appraisal for PubMed`（決定済み。PubMed は NLM の商標なので、名前の先頭に置かない・公式と誤認させない。説明文に `Not affiliated with NLM/NIH` を入れる）
- キーワード: critical appraisal, journal club, evidence-based medicine, PICO, NNT, PubMed
- 短い説明（132 字以内）: `Structured critical appraisal on PubMed: PICO, study design, NNT/ARR, validity checklist, one-page journal club summary.`
- スクリーンショット 5 枚: 判定 / Numbers / Validity / Export / 設定
- プライバシー: データ収集なし。AI 利用時のみ抄録テキストがユーザー指定のプロバイダに送られることを明記
- カテゴリ: Productivity（Education と迷うが検索は Productivity の方が強い）

## 7. 分析（プライバシー優先）

- MVP は外部アナリティクスを入れない
- ローカルに「起動回数」「書き出し回数」「AI 実行回数」をカウントし、設定画面に表示（ユーザーにも見える）
- ストアの週間アクティブユーザーとレビューを主指標にする
- v0.3 でオプトイン方式の最小テレメトリ（機能利用回数のみ、PMID や本文は送らない）を検討

## 8. 成功指標と判断ゲート

| 時点       | 指標                                | 継続条件                                         |
| ---------- | ----------------------------------- | ------------------------------------------------ |
| 公開 30 日 | 週間アクティブ 100 / 評価 4.5 以上  | 満たさなければ掲載文と初回体験を直す             |
| 公開 90 日 | 週間アクティブ 500 / 書き出し率 30% | 満たせば v0.2 課金を出す                         |
| 課金 90 日 | 有料転換 2% / 月間解約 5% 未満      | 満たせば継続・満たさなければ価格か無料枠を変える |
| 12 ヶ月    | MRR $1,000                          | 到達で売却準備開始（§10）                        |

## 9. リスクと対策

- 資金力のある要約ツールが「clinical mode」を出す → 小さく速く、12〜18 ヶ月で売る。機能を広げない
- PubMed の DOM 変更 → E-utilities フォールバック、Playwright スモークを週次で CI 実行
- 数値抽出の誤り → 自動確定しない。必ずユーザーが選択・確認する UI
- 臨床判断ツールと見なされる → 文言は education / appraisal に統一、免責固定、推奨は出さない
- チェックリストの著作権 → 文言自作。既存チェックリスト名を出す場合は「〜と同様の概念」までにとどめる
- MV3 の Service Worker が落ちる → 状態はすべて storage に置き、background は極小に

## 10. 売却を前提にした運用ルール

- 専用の Google アカウント（Chrome Web Store デベロッパー登録もこれで）、専用の GitHub Org、専用の Stripe / ExtensionPay アカウント、専用ドメイン（ラッコドメイン等、譲渡しやすい業者）。個人アカウントと混ぜない
- 初日から `docs/HANDOVER.md` を書き始める: アカウント一覧、ビルド手順、公開手順、既知の問題、外部依存
- 収益・費用は専用口座に分離
- 公開者アカウントの移管手順を v0.3 時点で確認し、ExtensionPay が移管不可なら Stripe Checkout + ライセンスキーに切り替える判断を v1.0 前に行う

## 11. マイルストーン

- Week 1: リポジトリ雛形、対象ページ検出、デザイン判定 + テスト、Side Panel の骨組み
- Week 2: 数値検出 + 計算機 + テスト、チェックリスト JSON とヘルプ文（英語で自作）
- Week 3: PICO タブ、Export、保存、Edge/Brave 確認、Playwright スモーク → **v0.1 内部完了**
- Week 4: 掲載素材、プライバシーポリシー、LP 1 枚、審査提出 → **v0.3 公開**
- 公開後: r/pharmacy、r/Residency、r/medicalschool に「作った」投稿。フィードバックを 30 日集める
- 90 日ゲート通過後: v0.2（AI + 課金）

## 12. Claude Code への指示

1. まずこの仕様を読み、不明点・矛盾点を列挙して質問する。推測で進めない
2. Week 1 の範囲だけ実装計画を提示し、承認後に着手する
3. `lib/` 層はユニットテストを先に書く（design-classifier / number-extractor / effect-measures）
4. チェックリストとヘルプ文は英語で自作する。既存チェックリストの文言をコピーしない
5. 権限は §5 の通り。増やす必要が出たら理由を添えて確認を取る
6. 各週の完了時に `docs/HANDOVER.md` を更新する

## 13. 未決事項（Hiroshi が決める）

- ~~名前の最終決定~~ → `Journal Club Helper` に決定（2026-09）
- 価格（$4/月・$29/年で仮置き）
- E-utilities フォールバックを MVP に含めるか、v0.3 に回すか
- 日本語 UI を出すか（出すなら v1.0 以降。国内薬剤師向けの流入になるが、売却時の買い手には無関係）
