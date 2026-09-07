export const SINGLE_GAME_KIT_VERSION = '0.1';

export const singleGameConfigs = [
  {
    id: 'mewgenics',
    siteName: 'MEW LOG',
    gameName: 'Mewgenics',
    badge: 'Mewgenics / personal play archive',
    hero: ['PLAY.', 'NOTE.', 'REMEMBER.'],
    description: '日記、画像、短い動画、ビルドメモ、作った猫の記録をひとつに集める。遊んだ断片が溜まり、あとから攻略や読み物へ育っていく場所。',
    categories: [
      { id: 'diary', label: '日記', short: 'DIARY' },
      { id: 'video', label: '動画', short: 'VIDEO' },
      { id: 'build', label: 'ビルドメモ', short: 'BUILD' },
      { id: 'cat', label: 'キャラメモ', short: 'CAT' }
    ],
    fields: {
      subject: { key: 'cat', label: '猫 / キャラ', placeholder: 'PONZU' },
      role: { key: 'className', label: 'クラス', placeholder: 'Fighter' }
    },
    data: {
      source: 'mew-log',
      idPrefix: 'mewlog:',
      r2Prefix: 'mew-log/',
      contentTypePrefix: 'mew_'
    },
    theme: {
      bg: '#171b18',
      panel: '#202621',
      panel2: '#272e28',
      text: '#e1e8df',
      muted: '#a8b2a7',
      accent: '#93ad82',
      accent2: '#c2b58e',
      line: '#3c463d'
    },
    samples: [
      { type: 'diary', title: '予定外の変化を残す', memo: '完成した攻略ではなく、その日に起きたことを短く残す。', subject: 'PONZU', role: 'Fighter', tags: ['GEN 8'] },
      { type: 'build', title: '壁際まで押し込む途中メモ', memo: 'うまくいった場面だけを後から掘り返せるように記録。', subject: 'MISO', role: 'Fighter', tags: ['位置取り'] },
      { type: 'cat', title: '残しておきたい猫', memo: '強さだけでなく、見た目や血統の変化もアーカイブする。', subject: 'PONZU', role: 'Fighter', tags: ['血統'] }
    ]
  },
  {
    id: 'balatro',
    siteName: 'RUN LOG',
    gameName: 'Balatro',
    badge: 'Balatro / run archive',
    hero: ['PLAY.', 'STACK.', 'BREAK.'],
    description: 'ラン、ジョーカー、デッキ、シードの断片をひとつに集める。勝敗だけでなく「何が噛み合ったか」を後から再発見できる1ゲーム特化ログ。',
    categories: [
      { id: 'run', label: 'ラン', short: 'RUN' },
      { id: 'joker', label: 'ジョーカー', short: 'JOKER' },
      { id: 'deck', label: 'デッキ', short: 'DECK' },
      { id: 'seed', label: 'シード', short: 'SEED' }
    ],
    fields: {
      subject: { key: 'subject', label: 'デッキ / ジョーカー', placeholder: '使ったデッキや中心カード' },
      role: { key: 'role', label: 'ステーク / 状況', placeholder: '難易度や局面' }
    },
    data: {
      source: 'game-log:balatro',
      idPrefix: 'gamelog:balatro:',
      r2Prefix: 'game-log/balatro/',
      contentTypePrefix: 'balatro_'
    },
    theme: {
      bg: '#191615',
      panel: '#25201f',
      panel2: '#302826',
      text: '#f0e6dc',
      muted: '#b8a99d',
      accent: '#d78a65',
      accent2: '#d8c78b',
      line: '#51433e'
    },
    samples: [
      { type: 'run', title: '途中から急に噛み合ったラン', memo: '序盤の判断より、中盤で何を残したかが効いた。あとで同じ流れを見返したい。', subject: 'デッキA', role: '中盤', tags: ['再現候補'] },
      { type: 'joker', title: 'この組み合わせは残しておく', memo: '単体評価ではなく、組み合わせた時の役割をメモする。', subject: 'ジョーカー構成', role: 'スコア伸長', tags: ['組み合わせ'] },
      { type: 'seed', title: 'もう一度試したいシード', memo: '面白かった展開を動画・スクショと一緒に持ち帰る想定。', subject: 'SEED', role: '再挑戦', tags: ['動画候補'] }
    ]
  }
];

export function getSingleGameConfig(id) {
  return singleGameConfigs.find((config) => config.id === id) || singleGameConfigs[0];
}
