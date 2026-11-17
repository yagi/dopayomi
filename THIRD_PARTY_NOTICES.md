# 同梱しているもののライセンス

このリポジトリの自作部分は MIT License（`LICENSE`）です。以下は同梱している第三者のソフトウェアとデータで、それぞれのライセンスに従います。

| 同梱物 | 元 | ライセンス |
|---|---|---|
| `budoux-ja.js` | [BudouX](https://github.com/google/budoux) 0.10.3（日本語モデル） | Apache License 2.0（`licenses/Apache-2.0.txt`） |
| `kuromoji.js` | [kuromoji.js](https://github.com/takuyaa/kuromoji.js) 0.1.2（辞書ローダーを差し替えてバンドル） | Apache License 2.0（`licenses/Apache-2.0.txt`） |
| `kuromoji.js` に含まれる展開処理 | [zlib.js](https://github.com/imaya/zlib.js) | MIT License |
| `books/*.txt` | [青空文庫](https://www.aozora.gr.jp/)の作品（著作権の保護期間が満了したもの）からルビと注記を取り除いたもの。各作品の底本と入力・校正者は `books/index.json` の `colophon` に残しています | パブリックドメイン |
| `dict/*.b64.txt` | kuromoji.js 同梱の辞書（mecab-ipadic-2.7.0-20070801 由来）を base64 にしたもの | IPADIC のライセンス（`licenses/kuromoji-NOTICE.md`） |

`kuromoji.js` は、辞書の読み込み部分（`build/kuromoji-loader/Loader.js`）を差し替えています。それ以外の改変はありません。
