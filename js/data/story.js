/* =========================================================================
 * story.js  —  進行・変化・削除の特別扱い・エンディング
 *
 *  events   : 条件を満たすと一度だけ起きること
 *      { id, act, when(S), text, spawn:[], relabel:[[id,'新字']], collapse:true }
 *        S.has('id')   … そのノードが盤面にある
 *        S.ever('id')  … 一度でも出現した
 *        S.flag('名')  … フラグが立っている
 *        S.act         … 現在の章
 *
 *  deletions: ノードを「消す」ときの特別処理
 *  endings  : エンディング本文
 * ========================================================================= */
(function (global) {
  'use strict';

  const events = [
    {
      id: 'act2',
      act: 2,
      when: S => S.ever('anohi'),
      text: '言葉が、少しだけ増えた気配がある。'
    },
    {
      id: 'act3',
      act: 3,
      when: S => S.ever('gogo512') && S.ever('ienakatta'),
      text: '——見覚えのない言葉が、いつのまにか盤の上にある。',
      spawn: ['kamisama'],
      relabel: [['ame', '雨だったと思う']]
    },
    {
      id: 'act4',
      act: 4,
      when: S => S.act >= 3 && S.ever('uso') && (S.ever('shi') || S.ever('atatakai')),
      text: 'ここから先、言葉は少しずつ言うことを聞かなくなる。',
      spawn: ['shijin'],
      relabel: [
        ['ie', '家だったもの'],
        ['byouin', 'もうない建物'],
        ['kaeru', '帰る？']
      ]
    },
    {
      id: 'act5',
      act: 5,
      when: S => S.act >= 4 && S.countAny([
        'dochiramo', 'darenimo', 'akui', 'ondo', 'yobanakatta',
        'kubetsu', 'tadaima', 'mochiageta', 'shugo', 'omoide'
      ]) >= 2,
      text: '言葉が減っていく。残るものだけが残る。',
      relabel: [
        ['watashi', '私？'],
        ['kaeru', 'もう帰った']
      ],
      spawn: ['omoidasanai'],
      collapse: true
    }
  ];

  /* 「消す」の特別処理。ここに無いノードは、静かに消えるだけ。 */
  const deletions = {
    kamisama: {
      text: '神様に繋がっていた線は、すべて「偶然」に繋ぎ直された。',
      rewireTo: 'guuzen',
      flag: 'kami_deleted'
    },
    shijin: {
      text: '静かになった。',
      alsoRemove: ['hiyu', 'shitto', 'asa4', 'yomarenu', 'utsukushii'],
      flag: 'shijin_deleted'
    },
    uso: {
      text: '消した。',
      respawn: { delay: 2600, text: '消えなかった。' }
    },
    watashi: { blocked: true, text: '——誰が、消すのか。' },
    core:    { blocked: true, text: 'それには、まだ手が届かない。' },
    omoidasanai: { blocked: true, text: '' }
  };

  const endings = {
    A: {
      title: '誰がどちらを作った？',
      body: ['私と、神様。', '順番を思い出せない。'],
      name: 'エンド A'
    },
    B: {
      title: '言葉にしたので、もう失われた',
      body: ['うまく書けた、と思ってしまった。', 'それが、たぶん最後だった。'],
      name: 'エンド B'
    },
    C: {
      title: '本当は覚えていた',
      body: ['忘れていたのではない。', '思い出さないでいた。'],
      name: 'エンド C',
      relabelCore: '忘れたかったこと'
    },
    D: {
      title: '呼べば、間に合ったのか',
      body: ['呼ばなかった。', '理由は、今も三つくらいある。'],
      name: 'エンド D'
    },
    E: {
      title: 'はじめから、そこにいた',
      body: ['何もしなかった、という意味ではない。', 'たぶん、そういう意味だ。'],
      name: 'エンド E'
    },
    S: {
      title: 'それでよかった',
      body: [],
      name: '——',
      quiet: true
    }
  };

  global.GameData = global.GameData || {};
  global.GameData.story = { events, deletions, endings };
})(window);
