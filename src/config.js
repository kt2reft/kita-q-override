// GDD（アルファ版実装仕様書 v1.0）のパラメータ定義
// UE 単位(cm)で書かれた値はメートルに換算している（500uu/s = 5.0m/s）
export const CFG = {
  // --- ワールド ---
  ROADS: [-120, -40, 40, 120], // 道路中心線（X/Z 共通のグリッド）
  ROAD_HALF: 6,                // 車道の半幅
  SIDEWALK: 3,                 // 歩道幅
  CURB: 0.15,                  // 縁石の高さ
  EDGE: 126,                   // 外周道路の外端
  LIMIT: 157,                  // 移動可能範囲

  // --- 1.1 Infection System ---
  INFECTION_MAX: 100,
  CONFUSED_AT: 50,
  SPRAY_RATE: 62,              // 洗脳スプレー /秒
  GOBOTEN_HIT: 36,             // ごぼ天ソード 1 打
  BOKUTO_HIT: 50,

  // --- 1.2 施設ハッキング ---
  IMPACT_VELOCITY: 5.0,        // ImpactVelocity > 500
  KAKUUCHI_FADE: 2.0,          // FadeTime = 2.0s
  SHURA_RADIUS: 50,            // Area_Shura_Zone 半径 50m
  SHURA_DPS: 5.0,              // 毎秒 Infection_Meter +5.0

  // --- 2.1 ごぼ天ソード ---
  TAKEDOWN_MIN: 50,
  RAGDOLL_TIME: 10,

  // --- 2.2 小倉祇園太鼓チャージ ---
  DAIKO_RADIUS: 20,
  DAIKO_DURATION: 0.5,
  DANCE_TIME: 5.0,

  // --- 4. MQ_05 ---
  QUEST_NPCS: 100,
  QUEST_TARGET: 50,

  // --- その他 ---
  AMBIENT_NPCS: 56,
  TRAFFIC_CARS: 16,
};

// ヤンキー化時のボイス（AudioCue 相当）
export const YANKEE_LINES = [
  'バリカタで！', 'なんしよーとか！', 'しゃーしい！', 'よかろうもん！',
  'きさん、どこ中か！', 'ラーメンはバリカタっちゃ！', 'なんち！？', '修羅の国ばい！',
  'うちらの時代やけ！', '角打ち行こーや！',
];
export const CLEAN_LINES = [
  'コンプライアンス違反です！', '通報しますよ！', 'オーガニックじゃない…！', 'それ、ハラスメントです',
  'エビデンスはあるんですか！', '多様性を尊重してください！', 'やめてください！', 'サステナブルじゃない…',
];
export const CONFUSED_LINES = ['あれ…バリカタ…？', 'なんか…腹立ってきた…', '俺は…誰っちゃ…？', 'パンチパーマ…あててみたい…', 'うっ…演歌が聴こえる…'];
export const ENFORCER_LINES = ['そこ！指導です！', 'マナー違反を確認！', '止まりなさい！', '条例違反ですよ！'];
export const DRIVER_LINES = ['ひぃっ！', 'す、すんません！', 'どうぞお先に…！', 'こわ…'];

export const PAINT_COLORS = {
  Gold: { hex: 0xffc531, metal: 1.0, css: '#ffc531', name: '金' },
  Silver: { hex: 0xd8dde3, metal: 1.0, css: '#d8dde3', name: '銀' },
  Pink: { hex: 0xff4fa3, metal: 0.25, css: '#ff4fa3', name: 'ピンク' },
};
