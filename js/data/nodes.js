/* =========================================================================
 * nodes.js  —  ノード定義
 *
 *  id       : 内部ID（レシピから参照する。変更するとレシピも直す必要あり）
 *  label    : 画面に出る文字
 *  size     : 'sm' | 'md' | 'lg' | 'core'   （省略時 'md'）
 *  start    : true なら開始時から盤面にある
 *  fixed    : true なら漂わず固定（coreのみ）
 *  locked   : true なら（そのままでは）クリックできない
 *  uneasy   : true なら不穏な章で文字が揺れる
 *  keep     : true なら終盤の収束でも消えずに残る
 *  nodelete : true なら削除不可
 *  inspect  : 単独で押したとき起きること（画面では点線で囲まれて示される）
 *               { text: '…', spawn: ['id', ...] }
 *
 *  ※ 新しい言葉を足したいときは、ここに1行足して recipes.js に組合せを書く。
 * ========================================================================= */
(function (global) {
  'use strict';

  const NODES = [
    /* ---------------- 開始時に盤面にあるもの ---------------- */
    { id: 'core',     label: 'あの日、思い出せなかったなにか', size: 'core', start: true, fixed: true, locked: true, keep: true, nodelete: true },

    { id: 'watashi',  label: '私',   size: 'lg', start: true, keep: true },
    { id: 'ame',      label: '雨',   start: true },
    { id: 'eki',      label: '駅',   start: true },
    { id: 'kaeru',    label: '帰る', start: true },
    { id: 'ie',       label: '家',   start: true },
    { id: 'kasa',     label: '傘',   start: true },
    { id: 'gogo',     label: '午後', start: true },
    { id: 'kaisatsu', label: '改札', start: true },

    /* ---------------- 第一章：日常の言葉 ---------------- */
    { id: 'omoidasu',     label: '思い出す' },
    { id: 'anohi',        label: 'あの日', size: 'lg' },
    { id: 'sasanakatta',  label: '差さなかった' },
    { id: 'saishu',       label: '最終電車' },
    { id: 'yuudachi',     label: '夕立' },
    { id: 'natsu',        label: '夏' },
    { id: 'semi',         label: '蝉の声' },
    { id: 'matsu',        label: '待つ' },
    { id: 'toorenakatta', label: '通れなかった' },
    { id: 'nioi',         label: '匂い' },

    /* ---------------- 第二章：思い出せてしまうもの ---------------- */
    { id: 'haha',      label: '母', size: 'lg' },
    { id: 'byouin',    label: '病院' },
    { id: 'rouka',     label: '白い廊下' },
    { id: 'gogo512',   label: '午後五時十二分', size: 'lg' },
    { id: 'namae',     label: '名前' },
    { id: 'yobu',      label: '呼ぶ' },
    { id: 'ienakatta', label: '言えなかったこと' },
    { id: 'kioku',     label: '記憶' },
    { id: 'shiranaifuri', label: '知らないふり' },
    { id: 'uso',       label: '嘘', keep: true },
    { id: 'te',        label: '手' },

    /* ---------------- 不穏 ---------------- */
    { id: 'atatakai',   label: 'まだ温かい',                 uneasy: true },
    { id: 'sakkimade',  label: 'さっきまで持ち主がいたもの', uneasy: true, size: 'sm' },
    { id: 'mochiageruna', label: '持ち上げてはいけない',     uneasy: true, size: 'sm' },
    { id: 'mochiageta', label: '持ち上げた',                 uneasy: true },
    { id: 'ondo',       label: '知っている温度',             uneasy: true },

    /* ---------------- 神様のまわり ---------------- */
    { id: 'kamisama', label: '神様', size: 'lg', keep: true,
      inspect: { text: '（なぜそれが出てきたのかは、わからない）', spawn: ['sensou', 'kodomo'] } },
    { id: 'sensou',  label: '戦争' },
    { id: 'kodomo',  label: '子供' },
    { id: 'onegai',  label: 'お願い' },
    { id: 'chinmoku', label: '沈黙' },
    { id: 'naze',    label: 'なぜ？' },
    { id: 'kidoku',  label: '既読' },
    { id: 'guuzen',  label: '偶然', keep: true },
    { id: 'henji',   label: '返事はない', uneasy: true },
    { id: 'onaji',   label: '同じものの別の呼び方', size: 'sm' },
    { id: 'darenosei', label: '誰のせいでもない' },
    { id: 'chigau',  label: 'それも違う気がする' },
    { id: 'hajimekara', label: 'はじめから、そこにいた', size: 'sm', uneasy: true },

    /* ---------------- 詩人の心のまわり ---------------- */
    { id: 'shijin', label: '詩人の心', size: 'lg', keep: true,
      inspect: { text: '', spawn: ['hiyu', 'shitto', 'asa4', 'yomarenu', 'utsukushii'] } },
    { id: 'hiyu',       label: '比喩' },
    { id: 'shitto',     label: '嫉妬' },
    { id: 'asa4',       label: '朝四時' },
    { id: 'yomarenu',   label: '誰にも読まれなかった言葉', size: 'sm' },
    { id: 'utsukushii', label: '美しいと思ってしまったもの', size: 'sm' },
    { id: 'kane',       label: '金' },
    { id: 'inori',      label: '祈り' },
    { id: 'baibun',     label: '売文' },
    { id: 'dochiramo',  label: 'どちらも同じだった', size: 'sm' },
    { id: 'namidamitai', label: '涙みたいだと書いた', size: 'sm' },
    { id: 'nemutteiru', label: '眠っているみたい', size: 'sm', uneasy: true },
    { id: 'madadare',   label: 'まだ誰も起きていない', size: 'sm' },
    { id: 'sonnatoki',  label: 'そんな時に、それを思った', size: 'sm', uneasy: true },
    { id: 'yomasenaku', label: '読ませなくてよかった', size: 'sm' },
    { id: 'tsugouyoku', label: '都合よく言い換えただけ', size: 'sm' },

    /* ---------------- 抽象 ---------------- */
    { id: 'shi',        label: '死', uneasy: true },
    { id: 'ai',         label: '愛' },
    { id: 'shuuchaku',  label: '執着' },
    { id: 'kubetsu',    label: '区別できない' },
    { id: 'omoide',     label: '思い出' },
    { id: 'tadaima',    label: 'ただいま', uneasy: true },
    { id: 'kaerenai',   label: '帰れない' },
    { id: 'wasureru',   label: '忘れる' },
    { id: 'wasuretafuri', label: '忘れたふり' },
    { id: 'yurusu',     label: '許す' },
    { id: 'yurusareru', label: '赦される' },
    { id: 'shugo',      label: '主語がちがう' },
    { id: 'koukai',     label: '後悔' },
    { id: 'akui',       label: '自分でも気づかなかった悪意', size: 'sm', uneasy: true },
    { id: 'darenimo',   label: '誰にも言わなかったこと', size: 'sm' },
    { id: 'yobanakatta', label: '名前を呼ばなかった理由', size: 'sm', keep: true },
    { id: 'yobikata',   label: '呼び方がわからない', size: 'sm' },
    { id: 'otodake',    label: '音だけ覚えている', size: 'sm' },
    { id: 'ippon',      label: '一本しかなかった', size: 'sm' },
    { id: 'jikokudake', label: '時刻だけ覚えている', size: 'sm' },
    { id: 'dochiradatta', label: 'どちらだったか、もう', size: 'sm' },
    { id: 'yobanakunatta', label: '呼ばなくなった', size: 'sm' },
    { id: 'hitorigoto', label: '独り言' },
    { id: 'karuku',     label: '軽くなった気がする', size: 'sm' },
    { id: 'kienakatta', label: '消えなかった', uneasy: true },

    /* ---------------- 終盤 ---------------- */
    { id: 'omoidasanai',  label: '思い出さないことにした', size: 'lg', keep: true, nodelete: true },
    { id: 'wasuretakatta', label: '忘れたかったこと', size: 'core', keep: true, nodelete: true }
  ];

  global.GameData = global.GameData || {};
  global.GameData.nodes = NODES;
})(window);
