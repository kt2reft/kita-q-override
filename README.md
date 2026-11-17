# KITA-Q OVERRIDE（アルファ版）

お上品（クリーン）に漂白された街を、修羅（ヤンキー）で上書きするオープンワールド・アクション。
three.js によるブラウザ向け 3D 実装です。外部アセットは使わず、テクスチャもすべてプログラムで生成しています。

## 起動

```bash
python server.py
```

`http://localhost:5173/` を開いてください（Windows では `start.bat` のダブルクリックでも起動）。
three.js を CDN から読み込むため、インターネット接続が必要です。

## 操作

| 操作 | キー |
| --- | --- |
| 移動 / 視点 | WASD / マウス・矢印 |
| ダッシュ / 歩き切替 / ジャンプ | Shift / C / Space |
| 攻撃・使用 | クリック または J |
| 強制給餌テイクダウン | F |
| 乗る・調べる / ヤンキー座り | E / G |
| 武器 | 1 スプレー, 2 ごぼ天, 3 ペイント, 4 ロケラン, 5 木刀, Q 素手 |
| パラグライダー | 空中で Space（A/D 旋回, W 急降下, S フレア） |
| 操作説明 / ポーズ | H / P |

## 実装済みシステム

- **1.1 Infection System**：`Infection_Meter` → `OnYankeeFied`（見た目変更・陣営変更・BT切替・ボイス）
- **1.2 施設ハッキング**：ダンプ突入（ImpactVelocity > 500）またはカップ酒で「角打ち」化、BGMクロスフェード、半径50mの修羅ゾーン
- **2.1 ごぼ天ソード**：先端ほど強いノックバック、強制給餌テイクダウン（10秒気絶）
- **2.2 小倉祇園太鼓チャージ**：ドリフト特化ハンドリング、半径20mの衝撃波で盆踊りスタン5秒
- **3.1 / 3.2 交通**：信号機破壊で `bIsRegulated = false`、ヤンキー横断（Force_Brake・睨みつけ）
- **4. MQ_05「成人式は金ピカだろ！」**：乱入 → 強制カラーリング（50/100）→ 占拠 → 完了ムービー

## 構成

```
index.html / css/style.css
src/main.js       レンダラー・空・ポストプロセス・ゲームループ
src/world.js      街・道路・建物・コリジョン
src/npc.js        NPC・感染システム・通報
src/player.js     プレイヤー・武器・カメラ
src/vehicles.js   ダンプ・太鼓山車
src/traffic.js    信号機・交通AI
src/facility.js   オーガニックカフェ／角打ち・アイテム
src/mission.js    MQ_05
src/ui.js, audio.js, fx.js, textures.js, humanoid.js
```
