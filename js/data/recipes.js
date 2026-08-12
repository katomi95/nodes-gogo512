/* =========================================================================
 * recipes.js  —  組み合わせ定義
 *
 *  connect : [a, b, 結果ノードID, 添える一行(省略可)]   ← 線で結ぶ（線が残る）
 *  overlay : [a, b, 結果ノードID, 添える一行(省略可)]   ← 重ねる（線は残らない）
 *  cut     : [a, b, 結果ノードID, 添える一行(省略可)]   ← 線を切る
 *  endings : [a, b, エンディングID]                      ← 終盤のみ成立
 *  whispers: [a, b, 一行]  結果ノードは生まれないが、何かが返ってくる組み合わせ
 *
 *  a, b の順番は問わない。
 *  結果ノードIDに null を入れると「ノードは生まれないが effect だけ起きる」。
 *  第5要素に effect オブジェクトを置くと追加処理が走る:
 *      { relabel: [[id, '新しい文字'], ...] , flag: 'フラグ名' , remove: ['id'] }
 *
 *  同じ二語を connect と overlay の両方に、別の結果で書ける。
 *  片方にしか書かれていない組を逆の操作で試したときは、
 *  crossHints（下）が「置きかたが違う」と教える。
 * ========================================================================= */
(function (global) {
  'use strict';

  const connect = [
    /* --- 第一章 ------------------------------------------------------- */
    ['watashi', 'ame',      'omoidasu',     '雨の音は、いつも何かを連れてくる。'],
    ['omoidasu', 'eki',     'anohi',        'ホームの、あの日。'],
    ['ame', 'kasa',         'sasanakatta',  ''],
    ['eki', 'kaeru',        'saishu',       ''],
    ['gogo', 'ame',         'yuudachi',     ''],
    ['yuudachi', 'eki',     'natsu',        ''],
    ['natsu', 'anohi',      'semi',         'うるさいほど鳴いていた。'],
    ['eki', 'gogo',         'matsu',        ''],
    ['kaisatsu', 'watashi', 'toorenakatta', ''],
    ['ame', 'natsu',        'nioi',         'アスファルトの、あれ。'],

    /* --- 第二章 ------------------------------------------------------- */
    ['nioi', 'ie',          'haha',         ''],
    ['haha', 'anohi',       'byouin',       ''],
    ['byouin', 'matsu',     'rouka',        '長さだけは覚えている。'],
    ['rouka', 'gogo',       'gogo512',      '時計は廊下の端にあった。'],
    ['gogo512', 'watashi',  'ienakatta',    ''],
    ['watashi', 'haha',     'namae',        ''],
    ['namae', 'haha',       'yobu',         ''],
    ['yobu', 'ienakatta',   'yobanakatta',  ''],
    ['omoidasu', 'anohi',   'kioku',        ''],
    ['watashi', 'ienakatta', 'shiranaifuri', ''],
    ['shiranaifuri', 'kioku', 'uso',        ''],
    ['byouin', 'watashi',   'te',           ''],
    ['te', 'gogo512',       'atatakai',     ''],
    ['atatakai', 'ie',      'sakkimade',    ''],
    ['sakkimade', 'watashi', 'mochiageruna', ''],
    ['byouin', 'chinmoku',  'shi',          ''],

    /* --- 抽象 --------------------------------------------------------- */
    ['omoide', 'haha',      'ai',           ''],
    ['matsu', 'ai',         'shuuchaku',    ''],
    ['kioku', 'watashi',    'wasureru',     ''],
    ['wasureru', 'shiranaifuri', 'wasuretafuri', ''],
    ['ienakatta', 'anohi',  'koukai',       ''],
    ['shitto', 'haha',      'akui',         'それを、今まで一度も言葉にしなかった。'],
    ['ienakatta', 'wasuretafuri', 'darenimo', ''],

    /* --- 神様 --------------------------------------------------------- */
    ['kamisama', 'byouin',  'onegai',       ''],
    ['kamisama', 'sensou',  'chinmoku',     ''],
    ['kamisama', 'kodomo',  'naze',         ''],
    ['kamisama', 'watashi', 'kidoku',       ''],
    ['kamisama', 'haha',    'onegai',       ''],
    ['guuzen', 'byouin',    'darenosei',    ''],
    ['guuzen', 'watashi',   'chigau',       ''],

    /* --- 詩人の心 ----------------------------------------------------- */
    ['shijin', 'kamisama',  'inori',        ''],
    ['shijin', 'kane',      'baibun',       ''],
    ['baibun', 'inori',     'dochiramo',    ''],
    ['shitto', 'yomarenu',  'kane',         '誰かは、これで食べている。'],
    ['hiyu', 'ame',         'namidamitai',  ''],
    ['hiyu', 'shi',         'nemutteiru',   ''],
    ['asa4', 'watashi',     'madadare',     ''],
    ['utsukushii', 'byouin', 'sonnatoki',   ''],
    ['yomarenu', 'haha',    'yomasenaku',   ''],
    ['inori', 'watashi',    'yurusu',       ''],
    ['yurusu', 'kamisama',  'yurusareru',   ''],
    ['yurusu', 'yurusareru', 'shugo',       '']
  ];

  const overlay = [
    ['ai', 'shuuchaku',     'kubetsu',      ''],
    ['kioku', 'uso',        'omoide',       ''],
    ['shi', 'kaeru',        'tadaima',      ''],
    ['atatakai', 'watashi', 'ondo',         ''],
    ['haha', 'kamisama',    'henji',        ''],
    ['namae', 'wasureru',   'yobikata',     ''],
    ['ie', 'ame',           'otodake',      ''],
    ['kasa', 'haha',        'ippon',        ''],
    ['wasuretafuri', 'wasureru', 'dochiradatta', ''],
    ['shijin', 'hiyu',      'tsugouyoku',   ''],
    ['kamisama', 'guuzen',  'onaji',        ''],
    ['gogo512', 'wasureru', 'jikokudake',   ''],
    ['mochiageruna', 'te',  'mochiageta',   'まだ、やわらかかった。'],
    ['uso', 'watashi',       null,          'かたちが、ほんの少しずれた。',
      { relabel: [['watashi', '私？']], flag: 'watashi_doubt' }]
  ];

  const cut = [
    ['watashi', 'ie',   'kaerenai', '', { relabel: [['ie', '家だったもの']] }],
    ['watashi', 'haha', 'yobanakunatta', ''],
    ['kamisama', 'inori', 'hitorigoto', ''],
    ['watashi', 'kioku', 'karuku', '']
  ];

  /* 終盤にだけ成立する組み合わせ。第3要素は story.js の endings のキー。 */
  const endings = [
    ['watashi', 'kamisama', 'A'],
    ['shijin',  'core',     'B'],
    ['uso',     'core',     'C'],
    ['yobanakatta', 'core', 'D'],
    ['kamisama', 'core',    'E']
  ];

  /* ノードは生まれないが、何かは返ってくる組み合わせ（接続・重ね 共通） */
  const whispers = [
    ['watashi', 'kaeru',  'どこへ、とは書いていない。'],
    ['watashi', 'ie',     '線はつながった。それだけのことだ。'],
    ['ame', 'eki',        '濡れたホーム。それだけ。'],
    ['kasa', 'watashi',   '持っていた気もするし、持っていなかった気もする。'],
    ['kaisatsu', 'eki',   '通る人と、通らない人がいる。'],
    ['gogo', 'watashi',   'まだ明るかった。'],
    ['natsu', 'watashi',  '暑かった、という記憶だけが妙に確かだ。'],
    ['semi', 'byouin',    '窓は閉まっていたはずなのに。'],
    ['haha', 'namae',     '呼んだのか、呼ばなかったのか。'],
    ['uso', 'haha',       'どちらのための嘘かは、まだ決めていない。'],
    ['shi', 'watashi',    '主語を置くと、急に重くなる。'],
    ['shi', 'haha',       '……。'],
    ['kamisama', 'ame',   '降らせたのか、降っただけなのか。'],
    ['kamisama', 'shi',   '返事はない。いつもそうだ。'],
    ['kamisama', 'kane',  '両替はできない。'],
    ['kamisama', 'uso',   'どちらが先だったろう。'],
    ['shijin', 'watashi', '自分のことだと思った瞬間、少し安くなった。'],
    ['shijin', 'shi',     '書ける、と思ってしまった。'],
    ['shijin', 'haha',    'まだ書いていない。'],
    ['shijin', 'ienakatta', '言えなかったことは、たいてい後から上手くなる。'],
    ['hiyu', 'haha',      '母を何かに喩えるのは、たぶん失礼だ。'],
    ['shitto', 'watashi', '誰に、とは書かないでおく。'],
    ['asa4', 'ame',       '音がやけに大きい時間。'],
    ['utsukushii', 'shi', 'それを思った自分のことは、まだ許していない。'],
    ['koukai', 'kamisama', '手遅れの相談窓口。'],
    ['te', 'haha',        '握ったか、置いただけか。'],
    ['omoide', 'watashi', 'よくできている。よくできすぎている。'],
    ['tadaima', 'ie',     '言ってから、誰もいないことに気づく。'],
    ['mochiageta', 'watashi', 'そのあとのことは、書かれていない。'],
    ['guuzen', 'kamisama', '入れ替えても、文は成立してしまう。'],
    ['core', 'watashi',   'まだ、届かない。'],
    ['core', 'ame',       'まだ、届かない。']
  ];

  /* どの組み合わせにも当たらなかったときに、たまに返ってくる一行 */
  const idleWhispers = [
    '線はつながった。ただそれだけだ。',
    'なにも起きない。起きないことも、たぶん結果だ。',
    '意味は、あとからついてくることがある。',
    '二つの言葉は、隣にいるだけだった。',
    '……。'
  ];

  /* 操作を取り違えたときに、盤のほうから言うこと。
     「組み合わせが外れた」ではなく「置きかたが違う」と伝えるためのもの。 */
  const crossHints = {
    /* 結んだが、その組は「重ね」にしか登録がない */
    needOverlay: [
      '並べただけでは、何も起きない。……重ねてみたら、どうだろう。',
      '線で結んでも、二つは二つのままだった。重ねる、という置きかたもある。',
      'この二つは、隣に並べるより、重ねたほうがいいのかもしれない。'
    ],
    /* 重ねたが、その組は「接続」にしか登録がない */
    needConnect: [
      '重ねても、二つのままだ。……線で結んでみたら、どうだろう。',
      '同じものにはならなかった。線で結べば、あいだに何かあるのかもしれない。',
      'この二つは、重ねるより、線で結んだほうがいいのかもしれない。'
    ]
  };

  global.GameData = global.GameData || {};
  global.GameData.recipes = { connect, overlay, cut, endings, whispers, idleWhispers, crossHints };
})(window);
