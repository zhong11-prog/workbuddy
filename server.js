const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_PATH = path.join(DATA_DIR, 'data.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BOOKS_DIR = path.join(DATA_DIR, 'data', 'books');

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
if (!fs.existsSync(BOOKS_DIR)) fs.mkdirSync(BOOKS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ==================== Database Schema ====================
function initDatabase() {
  db.exec(`
    -- 今日计划
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
      time_slot TEXT DEFAULT '' CHECK(time_slot IN ('morning','afternoon','evening','night','')),
      date TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 智能记账
    CREATE TABLE IF NOT EXISTS finances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('income','expense')),
      amount REAL NOT NULL,
      category TEXT NOT NULL DEFAULT '其他',
      note TEXT DEFAULT '',
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 健身记录
    CREATE TABLE IF NOT EXISTS fitness (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_type TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 0,
      calories REAL DEFAULT 0,
      note TEXT DEFAULT '',
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 韩语词汇库 (种子数据)
    CREATE TABLE IF NOT EXISTS korean_vocab (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 4),
      korean TEXT NOT NULL,
      meaning TEXT NOT NULL,
      pronunciation TEXT NOT NULL,
      part_of_speech TEXT DEFAULT ''
    );

    -- 韩语语法库 (种子数据)
    CREATE TABLE IF NOT EXISTS korean_grammar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 4),
      title TEXT NOT NULL,
      explanation TEXT NOT NULL,
      example_korean TEXT NOT NULL,
      example_meaning TEXT NOT NULL
    );

    -- 韩语学习进度
    CREATE TABLE IF NOT EXISTS korean_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      vocab_learned INTEGER DEFAULT 0,
      grammar_learned INTEGER DEFAULT 0,
      study_minutes INTEGER DEFAULT 0,
      note TEXT DEFAULT ''
    );

    -- 考试倒计时设置
    CREATE TABLE IF NOT EXISTS exam_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_name TEXT NOT NULL DEFAULT 'TOPIK',
      exam_date TEXT NOT NULL,
      target_level INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 电子阅读
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT DEFAULT '',
      status TEXT DEFAULT 'want' CHECK(status IN ('want','reading','done')),
      total_pages INTEGER DEFAULT 0,
      current_page INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 随机菜单
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      meal_type TEXT DEFAULT 'any' CHECK(meal_type IN ('breakfast','lunch','dinner','snack','any')),
      category TEXT DEFAULT 'home' CHECK(category IN ('home','takeout','restaurant')),
      recipe_id INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 家常菜谱
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ingredients TEXT DEFAULT '',
      steps TEXT DEFAULT '',
      flavor_tags TEXT DEFAULT '',
      difficulty TEXT DEFAULT 'medium' CHECK(difficulty IN ('easy','medium','hard')),
      cook_time INTEGER DEFAULT 30,
      category TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 待购清单
    CREATE TABLE IF NOT EXISTS shopping (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT DEFAULT '其他',
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
      purchased INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 健康打卡项定义
    CREATE TABLE IF NOT EXISTS health_habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '✅',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 健康打卡记录
    CREATE TABLE IF NOT EXISTS health_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      FOREIGN KEY (habit_id) REFERENCES health_habits(id),
      UNIQUE(habit_id, date)
    );

    -- 经期记录
    CREATE TABLE IF NOT EXISTS period_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_date TEXT NOT NULL,
      end_date TEXT DEFAULT '',
      symptoms TEXT DEFAULT '',
      mood TEXT DEFAULT '',
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 心情日记
    CREATE TABLE IF NOT EXISTS mood_diary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      mood TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 番茄专注记录
    CREATE TABLE IF NOT EXISTS pomodoro (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      sessions INTEGER DEFAULT 0,
      total_minutes INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 每日一句
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      source TEXT DEFAULT '',
      language TEXT DEFAULT 'cn' CHECK(language IN ('cn','kr'))
    );

    -- 灵感便签
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      color TEXT DEFAULT '#FFF9C4',
      pinned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 游戏成绩
    CREATE TABLE IF NOT EXISTS game_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_name TEXT NOT NULL,
      score_type TEXT NOT NULL DEFAULT 'time',
      score_value REAL NOT NULL,
      moves INTEGER DEFAULT 0,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_game_scores_game ON game_scores(game_name);

    -- 消消乐进度
    CREATE TABLE IF NOT EXISTS match3_progress (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- 电子书文件
    CREATE TABLE IF NOT EXISTS book_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'epub',
      file_size INTEGER DEFAULT 0,
      chapters TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    -- 阅读笔记
    CREATE TABLE IF NOT EXISTS reading_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      position REAL DEFAULT 0,
      chapter TEXT DEFAULT '',
      note_type TEXT DEFAULT 'highlight',
      selected_text TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    -- 创建索引
    CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
    CREATE INDEX IF NOT EXISTS idx_finances_date ON finances(date);
    CREATE INDEX IF NOT EXISTS idx_fitness_date ON fitness(date);
    CREATE INDEX IF NOT EXISTS idx_korean_progress_date ON korean_progress(date);
    CREATE INDEX IF NOT EXISTS idx_mood_diary_date ON mood_diary(date);
    CREATE INDEX IF NOT EXISTS idx_health_checkins_date ON health_checkins(date);
    CREATE INDEX IF NOT EXISTS idx_pomodoro_date ON pomodoro(date);
    CREATE INDEX IF NOT EXISTS idx_period_records_date ON period_records(start_date);
  `);
}

// ==================== Seed Data ====================
function seedData() {
  // 韩语词汇 TOPIK 1-4
  const count = db.prepare('SELECT COUNT(*) as c FROM korean_vocab').get();
  if (count.c === 0) {
    const vocab = [
      // TOPIK 1
      [1,'가다','去','가다','동사'], [1,'오다','来','오다','동사'], [1,'먹다','吃','먹따','동사'],
      [1,'마시다','喝','마시다','동사'], [1,'좋다','好','조타','형용사'], [1,'나쁘다','坏','나쁘다','형용사'],
      [1,'크다','大','크다','형용사'], [1,'작다','小','작따','형용사'], [1,'사람','人','사람','명사'],
      [1,'친구','朋友','친구','명사'], [1,'학교','学校','학꾜','명사'], [1,'집','家','집','명사'],
      [1,'물','水','물','명사'], [1,'밥','饭','밥','명사'], [1,'책','书','책','명사'],
      [1,'의자','椅子','의자','명사'], [1,'책상','书桌','책쌍','명사'], [1,'예쁘다','漂亮','예쁘다','형용사'],
      [1,'바쁘다','忙','바쁘다','형용사'], [1,'쉽다','容易','쉽따','형용사'],
      // TOPIK 2
      [2,'경험','经验','경험','명사'], [2,'계획','计划','계획','명사'], [2,'고민','苦恼','고민','명사'],
      [2,'기억','记忆','기억','명사'], [2,'꿈','梦','꿈','명사'], [2,'대화','对话','대화','명사'],
      [2,'방법','方法','방법','명사'], [2,'생각','想法','생각','명사'], [2,'설명','说明','설명','명사'],
      [2,'약속','约定','약쏙','명사'], [2,'여행','旅行','여행','명사'], [2,'운동','运动','운동','명사'],
      [2,'이야기','故事','이야기','명사'], [2,'일기','日记','일기','명사'], [2,'준비','准备','준비','명사'],
      [2,'중요하다','重要','중요하다','형용사'], [2,'필요하다','需要','필요하다','형용사'], [2,'그리워하다','想念','그리워하다','동사'],
      [2,'떠나다','离开','떠나다','동사'], [2,'사랑하다','爱','사랑하다','동사'],
      // TOPIK 3
      [3,'강조하다','强调','강조하다','동사'], [3,'걱정하다','担心','걱쩡하다','동사'],
      [3,'관계','关系','관계','명사'], [3,'기회','机会','기회','명사'], [3,'노력','努力','노력','명사'],
      [3,'단점','缺点','단점','명사'], [3,'대상','对象','대상','명사'], [3,'만족하다','满意','만족하다','형용사'],
      [3,'발전','发展','발전','명사'], [3,'부족하다','不足','부족하다','형용사'], [3,'비교','比较','비교','명사'],
      [3,'선택','选择','선택','명사'], [3,'소중하다','珍贵','소중하다','형용사'], [3,'실수','失误','실수','명사'],
      [3,'인상적','印象深刻的','인상적','형용사'], [3,'자연','自然','자연','명사'], [3,'장점','优点','장점','명사'],
      [3,'적극적','积极的','적극적','형용사'], [3,'포함하다','包含','포함하다','동사'], [3,'확인하다','确认','확인하다','동사'],
      // TOPIK 4
      [4,'갈등','矛盾','갈등','명사'], [4,'개선하다','改善','개선하다','동사'], [4,'결과','结果','결과','명사'],
      [4,'기여하다','贡献','기여하다','동사'], [4,'논리적','逻辑的','논리적','형용사'], [4,'당황하다','慌张','당황하다','동사'],
      [4,'반영하다','反映','반영하다','동사'], [4,'보장하다','保障','보장하다','동사'], [4,'분석','分析','분석','명사'],
      [4,'설득하다','说服','설득하다','동사'], [4,'안정적','稳定的','안정적','형용사'], [4,'예상하다','预想','예상하다','동사'],
      [4,'유지하다','维持','유지하다','동사'], [4,'의존하다','依赖','의존하다','동사'], [4,'인식','认识','인식','명사'],
      [4,'적용하다','适用','적용하다','동사'], [4,'참여하다','参与','참여하다','동사'], [4,'책임','责任','책임','명사'],
      [4,'탓','怪罪','탇','명사'], [4,'해결하다','解决','해결하다','동사']
    ];
    const insertVocab = db.prepare('INSERT INTO korean_vocab (level,korean,meaning,pronunciation,part_of_speech) VALUES (?,?,?,?,?)');
    const insertMany = db.transaction((rows) => { for (const r of rows) insertVocab.run(...r); });
    insertMany(vocab);
  }

  // 韩语语法 TOPIK 1-4
  const gc = db.prepare('SELECT COUNT(*) as c FROM korean_grammar').get();
  if (gc.c === 0) {
    const grammar = [
      [1,'-이에요/예요','表示"是..."','저는 학생이에요.','我是学生。'],
      [1,'-은/는','主题助词','오늘은 날씨가 좋아요.','今天天气好。'],
      [1,'-이/가','主语助词','날씨가 좋아요.','天气好。'],
      [1,'-을/를','宾语助词','밥을 먹어요.','吃饭。'],
      [1,'-에','表示时间或地点','학교에 가요.','去学校。'],
      [1,'-에서','表示动作发生地点','도서관에서 공부해요.','在图书馆学习。'],
      [1,'-고','表示并列 "和/而且"','밥을 먹고 물을 마셔요.','吃饭喝水。'],
      [1,'-아/어요','非正式敬语终结词尾','날씨가 좋아요.','天气好。'],
      [2,'-(으)ㄹ 거예요','表示将来/推测','내일 비가 올 거예요.','明天会下雨。'],
      [2,'-(으)ㄹ 수 있다/없다','表示可能/不可能','한국어를 할 수 있어요.','我会说韩语。'],
      [2,'-아/어야 하다','表示"必须/应该"','열심히 공부해야 해요.','必须努力学习。'],
      [2,'-지 않다','表示否定','오늘은 춥지 않아요.','今天不冷。'],
      [2,'-(으)면서','表示"一边...一边..."','음악을 들으면서 공부해요.','一边听音乐一边学习。'],
      [2,'-고 싶다','表示"想要..."','한국에 가고 싶어요.','想去韩国。'],
      [2,'-아/어 보다','表示尝试','김치를 먹어 봤어요.','吃过泡菜了。'],
      [2,'-는데','转折/背景说明','공부하는데 너무 어려워요.','在学习，但太难了。'],
      [3,'-기 때문에','表示原因','비가 오기 때문에 집에 있어요.','因为下雨，所以在家。'],
      [3,'-(으)면서도','表示"虽然...但是..."','알면서도 모르는 척해요.','虽然知道却装作不知道。'],
      [3,'-는 편이다','表示"算是.../倾向于..."','저는 부지런한 편이에요.','我算是勤快的。'],
      [3,'-(으)ㄹ 뻔했다','表示"差点就..."','버스를 놓칠 뻔했어요.','差点错过公交车。'],
      [3,'-도록','表示"为了/以便..."','늦지 않도록 서두르세요.','请快点，以免迟到。'],
      [3,'-는 바람에','表示原因（负面）','늦잠을 자는 바람에 지각했어요.','因为睡懒觉迟到了。'],
      [4,'-(으)ㄹ 뿐만 아니라','表示"不仅...而且..."','한국어 뿐만 아니라 일본어도 배워요.','不仅学韩语，还学日语。'],
      [4,'-는 대로','表示"一...就.../按照..."','끝나는 대로 연락할게요.','一结束就联系你。'],
      [4,'-(으)ㄹ 리가 없다','表示"不可能..."','그럴 리가 없어요.','不可能是那样的。'],
      [4,'-기에','表示原因','날씨가 좋기에 산책을 나갔어요.','因为天气好，出去散步了。'],
      [4,'-더라도','表示"即使...也..."','힘들더라도 포기하지 마세요.','即使辛苦也不要放弃。'],
      [4,'-(으)ㄴ/는 척하다','表示"假装..."','자는 척했어요.','假装睡着了。'],
      [4,'-는 김에','表示"借着...的机会..."','나온 김에 커피 마실까요?','既然出来了，喝杯咖啡吗？']
    ];
    const insertGrammar = db.prepare('INSERT INTO korean_grammar (level,title,explanation,example_korean,example_meaning) VALUES (?,?,?,?,?)');
    const insertManyG = db.transaction((rows) => { for (const r of rows) insertGrammar.run(...r); });
    insertManyG(grammar);
  }

  // 每日一句 (primarily Korean for learning)
  const qc = db.prepare('SELECT COUNT(*) as c FROM quotes').get();
  if (qc.c === 0) {
    const quotes = [
      ['오늘 하루도 파이팅! — 今天也要加油！','한국어','kr'],
      ['시작이 반이다. — 开始就是成功的一半。','한국어 속담','kr'],
      ['꿈을 꾸는 사람만이 그 꿈을 이룰 수 있다. — 只有做梦的人才能实现梦想。','한국어 명언','kr'],
      ['작은 것부터 시작하면 언젠가는 큰 것을 이룰 수 있다. — 从小事开始，总有一天能成就大事。','한국어 명언','kr'],
      ['노력하는 자는 즐기는 자를 이길 수 없다. — 努力的人赢不了享受的人。','한국어 명언','kr'],
      ['당신이 포기하지 않는 한, 아무도 당신을 이길 수 없습니다. — 只要你不放弃，没人能打败你。','한국어 명언','kr'],
      ['가장 어두운 밤이 지나면 가장 밝은 아침이 온다. — 最黑暗的夜晚过后，是最明亮的早晨。','한국어 명언','kr'],
      ['천 리 길도 한 걸음부터. — 千里之行，始于足下。','한국어 속담','kr'],
      ['고생 끝에 낙이 온다. — 苦尽甘来。','한국어 속담','kr'],
      ['가는 날이 장날. — 来得早不如来得巧。','한국어 속담','kr'],
      ['티끌 모아 태산. — 积少成多。','한국어 속담','kr'],
      ['배움에는 끝이 없다. — 学无止境。','한국어','kr'],
      ['꾸준함이 재능을 이긴다. — 坚持胜过天赋。','한국어','kr'],
      ['오늘 배운 것을 내일 실천하자. — 今天学的，明天就去做。','한국어','kr'],
      ['작은 노력이 모여 큰 변화를 만든다. — 微小的努力汇聚成巨大的变化。','한국어','kr'],
      ['실패는 성공의 어머니. — 失败是成功之母。','한국어 속담','kr'],
      ['하늘은 스스로 돕는 자를 돕는다. — 天助自助者。','한국어 속담','kr'],
      ['시간은 금이다. — 时间就是金钱。','한국어 속담','kr'],
      ['긍정적인 마음이 좋은 결과를 만든다. — 积极的心态创造好的结果。','한국어','kr'],
      ['내일은 내일의 해가 뜬다. — 明天的太阳照常升起。','한국어','kr'],
      ['지금 이 순간을 즐기자. — 享受当下这一刻。','한국어','kr'],
      ['할 수 있다고 믿으면 반은 성공이다. — 相信自己能做到，就成功了一半。','한국어','kr'],
      ['배우고 때로 익히면 또한 기쁘지 아니한가. — 学而时习之，不亦说乎。','한국어 고사성어','kr'],
      ['건강이 가장 큰 재산이다. — 健康是最大的财富。','한국어','kr'],
    ];
    const insertQuote = db.prepare('INSERT INTO quotes (text,source,language) VALUES (?,?,?)');
    const insertManyQ = db.transaction((rows) => { for (const r of rows) insertQuote.run(...r); });
    insertManyQ(quotes);
  }

  // 默认健康打卡项
  const hc = db.prepare('SELECT COUNT(*) as c FROM health_habits').get();
  if (hc.c === 0) {
    const habits = [['💧 喝水8杯','💧'],['😴 早睡(23:00前)','😴'],['🏃 运动30分钟','🏃'],['📖 阅读30分钟','📖'],['🧘 冥想10分钟','🧘']];
    const insertHabit = db.prepare('INSERT INTO health_habits (name,icon) VALUES (?,?)');
    const insertManyH = db.transaction((rows) => { for (const r of rows) insertHabit.run(...r); });
    insertManyH(habits);
  }

  // 家常菜谱种子数据 — 从 JSON 文件导入 200+ 道
  const rc = db.prepare("SELECT COUNT(*) as c FROM recipes WHERE category IS NOT NULL AND category != ''").get();
  if (rc.c < 200) {
    try {
      const recipes = require('./public/recipes-data');
      db.prepare("DELETE FROM recipes WHERE category = '' OR category IS NULL").run();
      const insertRecipe = db.prepare(
        'INSERT INTO recipes (name, category, ingredients, steps, flavor_tags, difficulty, cook_time) VALUES (?,?,?,?,?,?,?)'
      );
      const importAll = db.transaction((rows) => {
        let count = 0;
        for (const r of rows) count += insertRecipe.run(r.name, r.category, r.ingredients, r.steps, r.flavor_tags, r.difficulty, r.cook_time).changes;
        return count;
      });
      const imported = importAll(recipes);
      console.log(`👩‍🍳 已导入 ${imported} 道菜谱！`);
      // 清除旧的模块缓存以便后续 reload
      delete require.cache[require.resolve('./public/recipes-data')];
    } catch (e) { console.log('⚠️ 菜谱导入失败:', e.message); }
  }

  // 同步菜单项 — 按菜谱随机创建
  const mic = db.prepare('SELECT COUNT(*) as c FROM menu_items WHERE recipe_id IS NOT NULL').get();
  if (mic.c < 20) {
    const sampleRecipes = db.prepare('SELECT id, name FROM recipes ORDER BY RANDOM() LIMIT 30').all();
    if (sampleRecipes.length > 0) {
      const insertMenu = db.prepare('INSERT INTO menu_items (name, meal_type, category, recipe_id) VALUES (?,?,?,?)');
      const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
      sampleRecipes.forEach((r, i) => { insertMenu.run(r.name, meals[i % 4], 'home', r.id); });
      console.log(`🍽️ 同步创建了 ${sampleRecipes.length} 个菜单项`);
    }
  }
}

// ==================== Initialize ====================
initDatabase();

// 数据库迁移：确保 recipes 表有 category 列（必须在 seedData 之前执行）
try {
  const cols = db.prepare("PRAGMA table_info(recipes)").all();
  if (!cols.some(c => c.name === 'category')) {
    db.exec("ALTER TABLE recipes ADD COLUMN category TEXT DEFAULT ''");
    console.log('✅ 数据库迁移：recipes 表已添加 category 列');
  }
} catch (e) {
  console.log('⚠️ 数据库迁移跳过:', e.message);
}

// 数据库迁移：确保 menu_items 表有 recipe_id 列
try {
  const miCols = db.prepare("PRAGMA table_info(menu_items)").all();
  if (!miCols.some(c => c.name === 'recipe_id')) {
    db.exec("ALTER TABLE menu_items ADD COLUMN recipe_id INTEGER DEFAULT NULL");
    console.log('✅ 数据库迁移：menu_items 表已添加 recipe_id 列');
  }
  if (!miCols.some(c => c.name === 'flavor_tag')) {
    db.exec("ALTER TABLE menu_items ADD COLUMN flavor_tag TEXT DEFAULT ''");
  }
} catch (e) {
  console.log('⚠️ 菜单表迁移跳过:', e.message);
}

seedData();

// ==================== Middleware ====================
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ==================== EPUB/TXT Parser ====================
function parseEpub(filepath) {
  try {
    const buf = fs.readFileSync(filepath);
    // Find container.xml to get OPF path
    const containerMatch = findInZip(buf, 'META-INF/container.xml');
    if (!containerMatch) return parseAsTxt(filepath);
    const rootfile = (containerMatch.toString().match(/full-path="([^"]+)"/) || [])[1];
    if (!rootfile) return parseAsTxt(filepath);
    const opfContent = findAndInflate(buf, rootfile);
    if (!opfContent) return parseAsTxt(filepath);
    const opf = opfContent.toString();
    // Get title, author
    const title = (opf.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/) || [])[1] || '未知书名';
    const author = (opf.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/) || [])[1] || '';
    // Get spine order
    const items = {};
    const itemRegex = /<item[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*media-type="([^"]+)"/g;
    let m;
    while ((m = itemRegex.exec(opf)) !== null) items[m[1]] = { href: m[2], type: m[3] };
    const spine = [];
    const spineRegex = /<itemref[^>]*idref="([^"]+)"/g;
    while ((m = spineRegex.exec(opf)) !== null) spine.push(m[1]);
    // Get OPF base dir
    const baseDir = rootfile.substring(0, rootfile.lastIndexOf('/') + 1);
    // Extract chapters
    const chapters = [];
    for (const id of spine) {
      const item = items[id];
      if (!item || !item.href) continue;
      const href = baseDir + item.href;
      const content = findAndInflate(buf, href);
      if (!content) continue;
      let text = stripHtml(content.toString());
      if (text.trim()) chapters.push({ id, title: `第${chapters.length + 1}章`, text: text.trim() });
    }
    if (chapters.length === 0) return parseAsTxt(filepath);
    return { title, author, chapters, source: 'epub' };
  } catch (e) { return parseAsTxt(filepath); }
}

function parseAsTxt(filepath) {
  try {
    const text = fs.readFileSync(filepath, 'utf8');
    const name = path.basename(filepath, path.extname(filepath));
    // Split into chunks of ~2000 chars as "chapters"
    const chapters = [];
    for (let i = 0; i < text.length; i += 2000) {
      chapters.push({ id: 'c' + i, title: `段落${Math.floor(i / 2000) + 1}`, text: text.substring(i, i + 2000).trim() });
    }
    return { title: name, author: '', chapters, source: 'txt' };
  } catch (e) { return { title: '未知', author: '', chapters: [{ id: 'c1', title: '', text: '无法读取文件' }], source: 'error' }; }
}

function stripHtml(html) { return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g,'"').replace(/\n{3,}/g, '\n\n').trim(); }

function findInZip(buf, name) {
  let offset = 0;
  while (offset < buf.length - 30) {
    const sig = buf.readUInt32LE(offset);
    if (sig === 0x04034b50) {
      const fnLen = buf.readUInt16LE(offset + 26);
      const exLen = buf.readUInt16LE(offset + 28);
      const compLen = buf.readUInt32LE(offset + 18);
      const fn = buf.subarray(offset + 30, offset + 30 + fnLen).toString();
      const dataStart = offset + 30 + fnLen + exLen;
      if (fn === name) return buf.subarray(dataStart, dataStart + compLen);
      offset = dataStart + compLen;
    } else break;
  }
  return null;
}

function findAndInflate(buf, name) {
  const data = findInZip(buf, name);
  if (!data) return null;
  // Check if compressed
  if (data[0] === 0x78) {
    try { return zlib.inflateRawSync(data); } catch (e) { return zlib.unzipSync(data); }
  }
  return data;
}
const today = () => new Date().toISOString().split('T')[0];

function getQuoteOfDay() {
  // Prefer Korean quotes for learning
  const krQuotes = db.prepare("SELECT * FROM quotes WHERE language='kr'").all();
  if (krQuotes.length > 0) {
    const seed = parseInt(today().replace(/-/g, ''));
    return krQuotes[seed % krQuotes.length];
  }
  const count = db.prepare('SELECT COUNT(*) as c FROM quotes').get().c;
  if (count === 0) return { text: '오늘 하루도 파이팅! — 今天也要加油！', source: '한국어', language: 'kr' };
  const idx = parseInt(today().replace(/-/g,'')) % count;
  return db.prepare('SELECT * FROM quotes LIMIT 1 OFFSET ?').get(idx);
}

// ==================== API Routes ====================

// --- Dashboard ---
app.get('/api/dashboard', (req, res) => {
  const t = today();
  const taskCount = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN completed=1 THEN 1 ELSE 0 END) as done FROM tasks WHERE date=?').get(t);
  const financeSummary = db.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) as income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) as expense
    FROM finances WHERE strftime('%Y-%m', date) = ?
  `).get(t.substring(0, 7));

  // 连续打卡天数
  let streak = 0;
  let checkDate = new Date(t);
  while (true) {
    const ds = checkDate.toISOString().split('T')[0];
    const checkins = db.prepare('SELECT COUNT(*) as c FROM health_checkins WHERE date=?').get(ds);
    if (checkins.c > 0) { streak++; checkDate.setDate(checkDate.getDate() - 1); }
    else break;
  }

  // 考试倒计时
  const exam = db.prepare('SELECT * FROM exam_settings ORDER BY id DESC LIMIT 1').get();
  let examCountdown = null;
  if (exam) {
    const examDate = new Date(exam.exam_date);
    const now = new Date(t);
    const diff = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));
    examCountdown = { name: exam.exam_name, days: diff, targetLevel: exam.target_level };
  }

  // 经期预测
  const lastPeriod = db.prepare('SELECT * FROM period_records ORDER BY start_date DESC LIMIT 1').get();
  let periodPrediction = null;
  if (lastPeriod) {
    const lastStart = new Date(lastPeriod.start_date);
    const nextStart = new Date(lastStart);
    nextStart.setDate(nextStart.getDate() + 28);
    const daysUntil = Math.ceil((nextStart - new Date(t)) / (1000 * 60 * 60 * 24));
    periodPrediction = {
      lastStart: lastPeriod.start_date,
      nextPredicted: nextStart.toISOString().split('T')[0],
      daysUntil,
      inPeriod: daysUntil <= 28 && daysUntil > 28 - (parseInt(lastPeriod.end_date) ? (new Date(lastPeriod.end_date) - lastStart) / (1000*60*60*24) + 1 : 5)
    };
  }

  const quote = getQuoteOfDay();
  res.json({ taskCount, financeSummary, streak, examCountdown, periodPrediction, quote });
});

// --- 今日计划 ---
app.get('/api/tasks', (req, res) => {
  const date = req.query.date || today();
  const tasks = db.prepare('SELECT * FROM tasks WHERE date=? ORDER BY priority DESC, id DESC').all(date);
  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  const { title, description, priority, time_slot, date } = req.body;
  const result = db.prepare('INSERT INTO tasks (title,description,priority,time_slot,date) VALUES (?,?,?,?,?)')
    .run(title || '', description || '', priority || 'medium', time_slot || '', date || today());
  res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/tasks/:id', (req, res) => {
  const { title, description, priority, time_slot, completed } = req.body;
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE tasks SET 
    title=COALESCE(?,title), description=COALESCE(?,description),
    priority=COALESCE(?,priority), time_slot=COALESCE(?,time_slot),
    completed=COALESCE(?,completed), updated_at=datetime('now','localtime')
    WHERE id=?`).run(title, description, priority, time_slot, completed ?? task.completed, req.params.id);
  res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id));
});

app.delete('/api/tasks/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// --- 智能记账 ---
app.get('/api/finances', (req, res) => {
  const month = req.query.month || today().substring(0, 7);
  const records = db.prepare("SELECT * FROM finances WHERE strftime('%Y-%m', date) = ? ORDER BY date DESC, id DESC").all(month);
  const summary = db.prepare(`SELECT 
    COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) as income,
    COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) as expense
    FROM finances WHERE strftime('%Y-%m', date) = ?`).get(month);
  res.json({ records, summary });
});

app.post('/api/finances', (req, res) => {
  const { type, amount, category, note, date } = req.body;
  // 智能分类推荐
  let finalCategory = category;
  if (!finalCategory && note) {
    const kw = note.toLowerCase();
    if (kw.match(/饭|吃|外卖|餐厅|菜|面|米|粥|汤|火锅|烧烤|奶茶|咖啡|饮料|水果/)) finalCategory = '餐饮';
    else if (kw.match(/公交|地铁|打车|出租|油|停车|火车|飞机|高铁/)) finalCategory = '交通';
    else if (kw.match(/衣服|鞋|包|化妆|护肤|洗发|沐浴/)) finalCategory = '购物';
    else if (kw.match(/房租|水电|燃气|物业|网费|话费/)) finalCategory = '居住';
    else if (kw.match(/电影|游戏|音乐|书|演唱会|旅游|景点/)) finalCategory = '娱乐';
    else if (kw.match(/医院|药|挂号|体检|牙/)) finalCategory = '医疗';
    else finalCategory = '其他';
  }
  const result = db.prepare('INSERT INTO finances (type,amount,category,note,date) VALUES (?,?,?,?,?)')
    .run(type, amount, finalCategory || '其他', note || '', date || today());
  res.json(db.prepare('SELECT * FROM finances WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/finances/:id', (req, res) => {
  const { type, amount, category, note, date } = req.body;
  const rec = db.prepare('SELECT * FROM finances WHERE id=?').get(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE finances SET type=COALESCE(?,type), amount=COALESCE(?,amount), category=COALESCE(?,category), note=COALESCE(?,note), date=COALESCE(?,date) WHERE id=?')
    .run(type, amount, category, note, date, req.params.id);
  res.json(db.prepare('SELECT * FROM finances WHERE id=?').get(req.params.id));
});

app.delete('/api/finances/:id', (req, res) => {
  db.prepare('DELETE FROM finances WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// --- 健身 ---
app.get('/api/fitness', (req, res) => {
  const { view, date } = req.query;
  let records;
  if (view === 'month') {
    const month = (date || today()).substring(0, 7);
    records = db.prepare("SELECT * FROM fitness WHERE strftime('%Y-%m', date) = ? ORDER BY date DESC, id DESC").all(month);
  } else if (view === 'week') {
    const d = new Date(date || today());
    const start = new Date(d); start.setDate(d.getDate() - d.getDay());
    const end = new Date(start); end.setDate(start.getDate() + 7);
    records = db.prepare('SELECT * FROM fitness WHERE date >= ? AND date < ? ORDER BY date DESC').all(
      start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
  } else {
    records = db.prepare('SELECT * FROM fitness WHERE date=? ORDER BY id DESC').all(date || today());
  }
  res.json(records);
});

app.post('/api/fitness', (req, res) => {
  const { exercise_type, duration, calories, note, date } = req.body;
  const result = db.prepare('INSERT INTO fitness (exercise_type,duration,calories,note,date) VALUES (?,?,?,?,?)')
    .run(exercise_type, duration || 0, calories || 0, note || '', date || today());
  res.json(db.prepare('SELECT * FROM fitness WHERE id=?').get(result.lastInsertRowid));
});

app.delete('/api/fitness/:id', (req, res) => {
  db.prepare('DELETE FROM fitness WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// --- 韩语陪考 ---
app.get('/api/korean/vocab', (req, res) => {
  const level = req.query.level;
  const sql = level ? 'SELECT * FROM korean_vocab WHERE level=? ORDER BY id' : 'SELECT * FROM korean_vocab ORDER BY level, id';
  const vocab = level ? db.prepare(sql).all(level) : db.prepare(sql).all();
  res.json(vocab);
});

app.get('/api/korean/grammar', (req, res) => {
  const level = req.query.level;
  const sql = level ? 'SELECT * FROM korean_grammar WHERE level=? ORDER BY id' : 'SELECT * FROM korean_grammar ORDER BY level, id';
  const grammar = level ? db.prepare(sql).all(level) : db.prepare(sql).all();
  res.json(grammar);
});

app.get('/api/korean/progress', (req, res) => {
  const { month } = req.query;
  const sql = month
    ? "SELECT * FROM korean_progress WHERE strftime('%Y-%m', date) = ? ORDER BY date"
    : 'SELECT * FROM korean_progress ORDER BY date DESC';
  const records = month ? db.prepare(sql).all(month) : db.prepare(sql).all();
  res.json(records);
});

app.post('/api/korean/progress', (req, res) => {
  const { date, vocab_learned, grammar_learned, study_minutes, note } = req.body;
  const d = date || today();
  const existing = db.prepare('SELECT * FROM korean_progress WHERE date=?').get(d);
  if (existing) {
    db.prepare('UPDATE korean_progress SET vocab_learned=vocab_learned+?, grammar_learned=grammar_learned+?, study_minutes=study_minutes+?, note=COALESCE(?,note) WHERE date=?')
      .run(vocab_learned || 0, grammar_learned || 0, study_minutes || 0, note || null, d);
  } else {
    db.prepare('INSERT INTO korean_progress (date,vocab_learned,grammar_learned,study_minutes,note) VALUES (?,?,?,?,?)')
      .run(d, vocab_learned || 0, grammar_learned || 0, study_minutes || 0, note || '');
  }
  res.json(db.prepare('SELECT * FROM korean_progress WHERE date=?').get(d));
});

// 考试倒计时
app.get('/api/exam', (req, res) => {
  const exam = db.prepare('SELECT * FROM exam_settings ORDER BY id DESC LIMIT 1').get();
  res.json(exam || null);
});

app.post('/api/exam', (req, res) => {
  const { exam_name, exam_date, target_level } = req.body;
  const result = db.prepare('INSERT INTO exam_settings (exam_name,exam_date,target_level) VALUES (?,?,?)')
    .run(exam_name || 'TOPIK', exam_date, target_level || 1);
  res.json(db.prepare('SELECT * FROM exam_settings WHERE id=?').get(result.lastInsertRowid));
});

// --- 电子阅读 ---
app.get('/api/books', (req, res) => {
  const { status } = req.query;
  const sql = status ? 'SELECT * FROM books WHERE status=? ORDER BY id DESC' : 'SELECT * FROM books ORDER BY id DESC';
  const books = status ? db.prepare(sql).all(status) : db.prepare(sql).all();
  res.json(books);
});

app.post('/api/books', (req, res) => {
  const { title, author, total_pages } = req.body;
  const result = db.prepare('INSERT INTO books (title,author,total_pages,status) VALUES (?,?,?,?)')
    .run(title, author || '', total_pages || 0, 'want');
  res.json(db.prepare('SELECT * FROM books WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/books/:id', (req, res) => {
  const { title, author, status, total_pages, current_page, note, start_date, end_date } = req.body;
  const book = db.prepare('SELECT * FROM books WHERE id=?').get(req.params.id);
  if (!book) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE books SET 
    title=COALESCE(?,title), author=COALESCE(?,author), status=COALESCE(?,status),
    total_pages=COALESCE(?,total_pages), current_page=COALESCE(?,current_page),
    note=COALESCE(?,note), start_date=COALESCE(?,start_date), end_date=COALESCE(?,end_date)
    WHERE id=?`).run(title, author, status, total_pages, current_page, note, start_date, end_date, req.params.id);
  res.json(db.prepare('SELECT * FROM books WHERE id=?').get(req.params.id));
});

app.delete('/api/books/:id', (req, res) => {
  db.prepare('DELETE FROM books WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// --- 电子书上传 ---
app.post('/api/books/upload', (req, res) => {
  try {
    const { title, author, total_pages, filename, data, format } = req.body;
    if (!data || !filename) return res.status(400).json({ error: '缺少文件数据' });
    const safeName = Date.now() + '_' + filename.replace(/[^a-zA-Z0-9._\u4e00-\u9fff-]/g, '_');
    const filepath = path.join(BOOKS_DIR, safeName);
    fs.writeFileSync(filepath, Buffer.from(data, 'base64'));

    // Parse book
    const fmt = format || (filename.endsWith('.epub') ? 'epub' : filename.endsWith('.pdf') ? 'pdf' : 'txt');
    let bookInfo;
    if (fmt === 'epub') bookInfo = parseEpub(filepath);
    else bookInfo = parseAsTxt(filepath);

    const bookTitle = title || bookInfo.title || filename;
    const bookAuthor = author || bookInfo.author || '';

    // Create book record
    const br = db.prepare('INSERT INTO books (title,author,status,total_pages,start_date) VALUES (?,?,?,?,?)')
      .run(bookTitle, bookAuthor, 'reading', bookInfo.chapters.length, today());
    const bookId = br.lastInsertRowid;

    // Create book file record
    db.prepare('INSERT INTO book_files (book_id,filename,filepath,format,file_size,chapters) VALUES (?,?,?,?,?,?)')
      .run(bookId, filename, filepath, fmt, Buffer.byteLength(data, 'base64'), JSON.stringify(bookInfo.chapters));

    // Update book
    db.prepare('UPDATE books SET total_pages=? WHERE id=?').run(bookInfo.chapters.length, bookId);

    res.json({
      id: bookId,
      title: bookTitle,
      author: bookAuthor,
      total_pages: bookInfo.chapters.length,
      chapters: bookInfo.chapters.map(c => ({ id: c.id, title: c.title }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- 获取书籍章节内容 ---
app.get('/api/books/:id/read', (req, res) => {
  const bf = db.prepare('SELECT * FROM book_files WHERE book_id=?').get(req.params.id);
  if (!bf) return res.json({ chapters: [] });
  const chapters = JSON.parse(bf.chapters || '[]');
  if (bf.format === 'pdf') return res.json({ format: 'pdf', filepath: '/data/books/' + path.basename(bf.filepath), chapters });
  res.json({ format: bf.format, chapters });
});

// 获取单个章节内容
app.get('/api/books/:id/chapter/:chIdx', (req, res) => {
  const bf = db.prepare('SELECT * FROM book_files WHERE book_id=?').get(req.params.id);
  if (!bf) return res.status(404).json({ error: 'Not found' });
  const chapters = JSON.parse(bf.chapters || '[]');
  const idx = parseInt(req.params.chIdx);
  if (idx < 0 || idx >= chapters.length) return res.status(404).json({ error: 'Chapter not found' });
  res.json({ chapter: chapters[idx], total: chapters.length });
});

// 更新阅读进度
app.put('/api/books/:id/progress', (req, res) => {
  const { current_page } = req.body;
  db.prepare('UPDATE books SET current_page=?, status=CASE WHEN current_page>=total_pages AND total_pages>0 THEN ? ELSE ? END WHERE id=?')
    .run(current_page || 0, 'done', 'reading', req.params.id);
  res.json({ success: true });
});

// --- 笔记 ---
app.get('/api/books/:id/notes', (req, res) => {
  const notes = db.prepare('SELECT * FROM reading_notes WHERE book_id=? ORDER BY position, id').all(req.params.id);
  res.json(notes);
});

app.post('/api/books/:id/notes', (req, res) => {
  const { content, position, chapter, note_type, selected_text } = req.body;
  const r = db.prepare('INSERT INTO reading_notes (book_id,content,position,chapter,note_type,selected_text) VALUES (?,?,?,?,?,?)')
    .run(req.params.id, content, position || 0, chapter || '', note_type || 'highlight', selected_text || '');
  res.json(db.prepare('SELECT * FROM reading_notes WHERE id=?').get(r.lastInsertRowid));
});

app.put('/api/books/:id/notes/:nid', (req, res) => {
  const { content } = req.body;
  db.prepare('UPDATE reading_notes SET content=? WHERE id=? AND book_id=?').run(content || '', req.params.nid, req.params.id);
  res.json({ success: true });
});

app.delete('/api/books/:id/notes/:nid', (req, res) => {
  db.prepare('DELETE FROM reading_notes WHERE id=? AND book_id=?').run(req.params.nid, req.params.id);
  res.json({ success: true });
});

// 提供书籍原始文件（用于PDF）
app.use('/data/books', express.static(BOOKS_DIR));

// --- 随机菜单 ---
app.get('/api/menu', (req, res) => {
  const { meal_type } = req.query;
  const sql = meal_type && meal_type !== 'any' ? 'SELECT * FROM menu_items WHERE meal_type=? OR meal_type=? ORDER BY id'
    : 'SELECT * FROM menu_items ORDER BY id';
  const items = (meal_type && meal_type !== 'any') ? db.prepare(sql).all(meal_type, 'any') : db.prepare(sql).all();
  res.json(items);
});

app.post('/api/menu', (req, res) => {
  const { name, meal_type, category } = req.body;
  const result = db.prepare('INSERT INTO menu_items (name,meal_type,category) VALUES (?,?,?)')
    .run(name, meal_type || 'any', category || 'home');
  res.json(db.prepare('SELECT * FROM menu_items WHERE id=?').get(result.lastInsertRowid));
});

app.delete('/api/menu/:id', (req, res) => {
  db.prepare('DELETE FROM menu_items WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/menu/random', (req, res) => {
  const { meal_type, category, flavor } = req.query;
  // 从菜谱池中随机抽取
  let sql = 'SELECT * FROM recipes WHERE 1=1';
  const params = [];
  if (category && category !== '全部') { sql += ' AND category=?'; params.push(category); }
  if (flavor && flavor !== '全部口味') { sql += ' AND flavor_tags LIKE ?'; params.push(`%${flavor}%`); }
  sql += ' ORDER BY RANDOM() LIMIT 1';
  const recipe = db.prepare(sql).get(...params);
  if (!recipe) return res.json(null);
  res.json(recipe);
});

// --- 家常菜谱 ---
app.get('/api/recipes', (req, res) => {
  const { search, category, flavor } = req.query;
  let sql = 'SELECT * FROM recipes WHERE 1=1';
  const params = [];
  if (search) { sql += ' AND (name LIKE ? OR flavor_tags LIKE ? OR ingredients LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (category && category !== '全部') { sql += ' AND category=?'; params.push(category); }
  if (flavor && flavor !== '全部口味') { sql += ' AND flavor_tags LIKE ?'; params.push(`%${flavor}%`); }
  sql += ' ORDER BY id DESC';
  const recipes = db.prepare(sql).all(...params);
  res.json(recipes);
});

// 获取所有菜谱类别
app.get('/api/recipes/categories', (req, res) => {
  const cats = db.prepare("SELECT DISTINCT category FROM recipes WHERE category != '' ORDER BY category").all();
  const tags = db.prepare("SELECT DISTINCT flavor_tags FROM recipes WHERE flavor_tags != ''").all();
  const allTags = new Set();
  tags.forEach(t => { t.flavor_tags.split(',').forEach(f => { const ft = f.trim(); if (ft) allTags.add(ft); }); });
  res.json({ categories: cats.map(c => c.category), flavors: Array.from(allTags) });
});

app.post('/api/recipes', (req, res) => {
  const { name, ingredients, steps, flavor_tags, difficulty, cook_time, category } = req.body;
  const result = db.prepare('INSERT INTO recipes (name,ingredients,steps,flavor_tags,difficulty,cook_time,category) VALUES (?,?,?,?,?,?,?)')
    .run(name, ingredients || '', steps || '', flavor_tags || '', difficulty || 'medium', cook_time || 30, category || '');
  res.json(db.prepare('SELECT * FROM recipes WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/recipes/:id', (req, res) => {
  const { name, ingredients, steps, flavor_tags, difficulty, cook_time, category } = req.body;
  const rec = db.prepare('SELECT * FROM recipes WHERE id=?').get(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE recipes SET name=COALESCE(?,name), ingredients=COALESCE(?,ingredients),
    steps=COALESCE(?,steps), flavor_tags=COALESCE(?,flavor_tags), difficulty=COALESCE(?,difficulty),
    cook_time=COALESCE(?,cook_time), category=COALESCE(?,category) WHERE id=?`)
    .run(name, ingredients, steps, flavor_tags, difficulty, cook_time, category, req.params.id);
  res.json(db.prepare('SELECT * FROM recipes WHERE id=?').get(req.params.id));
});

app.delete('/api/recipes/:id', (req, res) => {
  db.prepare('DELETE FROM recipes WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// 手动触发种子菜谱重新导入（用于 Railway 等环境部署后初始化数据）
app.post('/api/recipes/reload', (req, res) => {
  try {
    // 清除缓存以确保获取最新版本
    const cachePath = path.join(__dirname, 'recipes-data.js');
    if (require.cache[require.resolve('./public/recipes-data')]) {
      delete require.cache[require.resolve('./public/recipes-data')];
    }
    const recipes = require('./recipes-data');
    const delCount = db.prepare("DELETE FROM recipes WHERE category = '' OR category IS NULL").run().changes;
    const insertRecipe = db.prepare(
      'INSERT INTO recipes (name, category, ingredients, steps, flavor_tags, difficulty, cook_time) VALUES (?,?,?,?,?,?,?)'
    );
    const importAll = db.transaction((rows) => {
      let count = 0;
      for (const r of rows) count += insertRecipe.run(r.name, r.category, r.ingredients, r.steps, r.flavor_tags, r.difficulty, r.cook_time).changes;
      return count;
    });
    const imported = importAll(recipes);
    // 同步菜单项
    db.prepare("DELETE FROM menu_items WHERE recipe_id IS NULL OR recipe_id NOT IN (SELECT id FROM recipes)").run();
    const sampleRecipes = db.prepare('SELECT id, name FROM recipes ORDER BY RANDOM() LIMIT 30').all();
    const insertMenu = db.prepare('INSERT INTO menu_items (name, meal_type, category, recipe_id) VALUES (?,?,?,?)');
    const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
    sampleRecipes.forEach((r, i) => { insertMenu.run(r.name, meals[i % 4], 'home', r.id); });
    res.json({ success: true, deleted: delCount, imported: imported, menuItems: sampleRecipes.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- 待购清单 ---
app.get('/api/shopping', (req, res) => {
  const { show_purchased } = req.query;
  const sql = show_purchased === 'true'
    ? 'SELECT * FROM shopping ORDER BY purchased ASC, priority DESC, id DESC'
    : 'SELECT * FROM shopping WHERE purchased=0 ORDER BY priority DESC, id DESC';
  res.json(db.prepare(sql).all());
});

app.post('/api/shopping', (req, res) => {
  const { name, category, priority } = req.body;
  const result = db.prepare('INSERT INTO shopping (name,category,priority) VALUES (?,?,?)')
    .run(name, category || '其他', priority || 'medium');
  res.json(db.prepare('SELECT * FROM shopping WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/shopping/:id', (req, res) => {
  const { name, category, priority, purchased } = req.body;
  const item = db.prepare('SELECT * FROM shopping WHERE id=?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE shopping SET name=COALESCE(?,name), category=COALESCE(?,category),
    priority=COALESCE(?,priority), purchased=COALESCE(?,purchased) WHERE id=?`)
    .run(name, category, priority, purchased ?? item.purchased, req.params.id);
  res.json(db.prepare('SELECT * FROM shopping WHERE id=?').get(req.params.id));
});

app.delete('/api/shopping/:id', (req, res) => {
  db.prepare('DELETE FROM shopping WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// --- 健康打卡 ---
app.get('/api/health/habits', (req, res) => {
  res.json(db.prepare('SELECT * FROM health_habits ORDER BY id').all());
});

app.post('/api/health/habits', (req, res) => {
  const { name, icon } = req.body;
  const result = db.prepare('INSERT INTO health_habits (name,icon) VALUES (?,?)').run(name, icon || '✅');
  res.json(db.prepare('SELECT * FROM health_habits WHERE id=?').get(result.lastInsertRowid));
});

app.delete('/api/health/habits/:id', (req, res) => {
  db.prepare('DELETE FROM health_checkins WHERE habit_id=?').run(req.params.id);
  db.prepare('DELETE FROM health_habits WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/health/checkins', (req, res) => {
  const { date } = req.query;
  const sql = date ? 'SELECT * FROM health_checkins WHERE date=?' : 'SELECT * FROM health_checkins ORDER BY date DESC';
  const checkins = date ? db.prepare(sql).all(date) : db.prepare(sql).all();
  res.json(checkins);
});

app.post('/api/health/checkins', (req, res) => {
  const { habit_id, date } = req.body;
  try {
    db.prepare('INSERT OR IGNORE INTO health_checkins (habit_id,date) VALUES (?,?)').run(habit_id, date || today());
    res.json({ success: true });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

app.delete('/api/health/checkins', (req, res) => {
  const { habit_id, date } = req.body;
  db.prepare('DELETE FROM health_checkins WHERE habit_id=? AND date=?').run(habit_id, date || today());
  res.json({ success: true });
});

// --- 经期记录 ---
app.get('/api/period', (req, res) => {
  const records = db.prepare('SELECT * FROM period_records ORDER BY start_date DESC').all();

  // 计算统计数据
  let avgCycle = 28;
  let avgDuration = 5;
  const completedCycles = [];
  for (let i = 0; i < records.length - 1; i++) {
    if (records[i].start_date && records[i+1].start_date) {
      const cycle = Math.round((new Date(records[i+1].start_date) - new Date(records[i].start_date)) / (1000*60*60*24));
      completedCycles.push(cycle);
    }
  }
  if (completedCycles.length > 0) {
    avgCycle = Math.round(completedCycles.reduce((a,b) => a+b, 0) / completedCycles.length);
  }
  // 持续时间
  const durations = records.filter(r => r.end_date).map(r => {
    const d = Math.round((new Date(r.end_date) - new Date(r.start_date)) / (1000*60*60*24)) + 1;
    return d;
  });
  if (durations.length > 0) avgDuration = Math.round(durations.reduce((a,b) => a+b, 0) / durations.length);

  // 预测
  let prediction = null;
  if (records.length > 0) {
    const last = records[0];
    const lastStart = new Date(last.start_date);
    const nextStart = new Date(lastStart);
    nextStart.setDate(nextStart.getDate() + avgCycle);
    const ovulation = new Date(nextStart);
    ovulation.setDate(ovulation.getDate() - 14);
    prediction = {
      next_start: nextStart.toISOString().split('T')[0],
      ovulation_date: ovulation.toISOString().split('T')[0],
      avg_cycle: avgCycle,
      avg_duration: avgDuration
    };
  }
  res.json({ records, prediction, avgCycle, avgDuration });
});

app.post('/api/period', (req, res) => {
  const { start_date, end_date, symptoms, mood, note } = req.body;
  const result = db.prepare('INSERT INTO period_records (start_date,end_date,symptoms,mood,note) VALUES (?,?,?,?,?)')
    .run(start_date || today(), end_date || '', symptoms || '', mood || '', note || '');
  res.json(db.prepare('SELECT * FROM period_records WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/period/:id', (req, res) => {
  const { start_date, end_date, symptoms, mood, note } = req.body;
  const rec = db.prepare('SELECT * FROM period_records WHERE id=?').get(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE period_records SET start_date=COALESCE(?,start_date), end_date=COALESCE(?,end_date),
    symptoms=COALESCE(?,symptoms), mood=COALESCE(?,mood), note=COALESCE(?,note) WHERE id=?`)
    .run(start_date, end_date, symptoms, mood, note, req.params.id);
  res.json(db.prepare('SELECT * FROM period_records WHERE id=?').get(req.params.id));
});

app.delete('/api/period/:id', (req, res) => {
  db.prepare('DELETE FROM period_records WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// --- 心情日记 ---
app.get('/api/mood', (req, res) => {
  const { month } = req.query;
  if (month) {
    const records = db.prepare("SELECT * FROM mood_diary WHERE strftime('%Y-%m', date) = ? ORDER BY date").all(month);
    res.json(records);
  } else {
    res.json(db.prepare('SELECT * FROM mood_diary ORDER BY date DESC LIMIT 50').all());
  }
});

app.post('/api/mood', (req, res) => {
  const { date, mood, note } = req.body;
  const d = date || today();
  db.prepare('INSERT OR REPLACE INTO mood_diary (date,mood,note,updated_at) VALUES (?,?,?,datetime(?,?))')
    .run(d, mood, note || '', 'now', 'localtime');
  res.json(db.prepare('SELECT * FROM mood_diary WHERE date=?').get(d));
});

// --- 番茄专注 ---
app.get('/api/pomodoro', (req, res) => {
  const { date, month } = req.query;
  if (date) {
    const record = db.prepare('SELECT * FROM pomodoro WHERE date=?').get(date);
    res.json(record || { date, sessions: 0, total_minutes: 0 });
  } else if (month) {
    const records = db.prepare("SELECT * FROM pomodoro WHERE strftime('%Y-%m', date) = ? ORDER BY date").all(month);
    res.json(records);
  } else {
    res.json(db.prepare('SELECT * FROM pomodoro ORDER BY date DESC LIMIT 30').all());
  }
});

app.post('/api/pomodoro', (req, res) => {
  const { date, sessions, total_minutes } = req.body;
  const d = date || today();
  const existing = db.prepare('SELECT * FROM pomodoro WHERE date=?').get(d);
  if (existing) {
    db.prepare('UPDATE pomodoro SET sessions=sessions+?, total_minutes=total_minutes+? WHERE date=?')
      .run(sessions || 0, total_minutes || 0, d);
  } else {
    db.prepare('INSERT INTO pomodoro (date,sessions,total_minutes) VALUES (?,?,?)').run(d, sessions || 0, total_minutes || 0);
  }
  res.json(db.prepare('SELECT * FROM pomodoro WHERE date=?').get(d));
});

// --- 每日一句 ---
app.get('/api/quotes', (req, res) => {
  res.json(getQuoteOfDay());
});

// --- 灵感便签 ---
app.get('/api/notes', (req, res) => {
  res.json(db.prepare('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC').all());
});

app.post('/api/notes', (req, res) => {
  const { content, color } = req.body;
  const result = db.prepare('INSERT INTO notes (content,color) VALUES (?,?)').run(content, color || '#FFF9C4');
  res.json(db.prepare('SELECT * FROM notes WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/notes/:id', (req, res) => {
  const { content, color, pinned } = req.body;
  const note = db.prepare('SELECT * FROM notes WHERE id=?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE notes SET content=COALESCE(?,content), color=COALESCE(?,color),
    pinned=COALESCE(?,pinned), updated_at=datetime('now','localtime') WHERE id=?`)
    .run(content, color, pinned ?? note.pinned, req.params.id);
  res.json(db.prepare('SELECT * FROM notes WHERE id=?').get(req.params.id));
});

app.delete('/api/notes/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// --- 游戏成绩 ---
app.get('/api/games/scores', (req, res) => {
  const { game } = req.query;
  const sql = game ? 'SELECT * FROM game_scores WHERE game_name=? ORDER BY score_value ASC, moves ASC LIMIT 20'
    : 'SELECT * FROM game_scores ORDER BY date DESC LIMIT 50';
  const scores = game ? db.prepare(sql).all(game) : db.prepare(sql).all();
  // Weekly favorite
  const weekStart = new Date();weekStart.setDate(weekStart.getDate()-7);
  const favSql = 'SELECT game_name, COUNT(*) as cnt FROM game_scores WHERE date >= ? GROUP BY game_name ORDER BY cnt DESC LIMIT 1';
  const fav = db.prepare(favSql).get(weekStart.toISOString().split('T')[0]);
  res.json({ scores, weeklyFavorite: fav || null });
});

app.post('/api/games/scores', (req, res) => {
  const { game_name, score_type, score_value, moves, date } = req.body;
  const result = db.prepare('INSERT INTO game_scores (game_name,score_type,score_value,moves,date) VALUES (?,?,?,?,?)')
    .run(game_name, score_type||'time', score_value, moves||0, date||today());
  res.json(db.prepare('SELECT * FROM game_scores WHERE id=?').get(result.lastInsertRowid));
});

// --- 消消乐进度 ---
app.get('/api/match3/progress', (req, res) => {
  const rows = db.prepare("SELECT * FROM match3_progress WHERE key NOT LIKE 'daily_menu_%' AND key != 'last_reset_date'").all();
  const progress = {};
  rows.forEach(r => {
    try { progress[r.key] = JSON.parse(r.value); } catch(e) { progress[r.key] = r.value; }
  });
  res.json(progress);
});

app.post('/api/match3/progress', (req, res) => {
  const { key, value } = req.body;
  db.prepare('INSERT OR REPLACE INTO match3_progress (key, value) VALUES (?, ?)')
    .run(key, JSON.stringify(value));
  res.json({ success: true });
});

// --- 历史/日历查询 ---

// 健康打卡日历热力图
app.get('/api/health/calendar', (req, res) => {
  const month = req.query.month || today().substring(0, 7);
  const start = month + '-01';
  const end = month + '-31';
  const checkins = db.prepare('SELECT date, habit_id FROM health_checkins WHERE date>=? AND date<=?').all(start, end);
  const habits = db.prepare('SELECT * FROM health_habits').all();
  const map = {};
  checkins.forEach(c => { if (!map[c.date]) map[c.date] = []; map[c.date].push(c.habit_id); });
  res.json({ month, habits, checkins: map, totalHabits: habits.length });
});

// 心情日历
app.get('/api/mood/calendar', (req, res) => {
  const month = req.query.month || today().substring(0, 7);
  const moods = db.prepare('SELECT date, mood, emoji, note FROM mood_diary WHERE date>=? AND date<=?').all(month + '-01', month + '-31');
  const map = {};
  moods.forEach(m => { map[m.date] = { mood: m.mood, emoji: m.emoji, note: m.note }; });
  res.json({ month, moods: map });
});

// 番茄历史统计
app.get('/api/pomodoro/history', (req, res) => {
  const start = req.query.start || today().substring(0, 7) + '-01';
  const end = req.query.end || today();
  const records = db.prepare('SELECT date, SUM(sessions) as sessions, SUM(total_minutes) as minutes FROM pomodoro WHERE date>=? AND date<=? GROUP BY date ORDER BY date DESC').all(start, end);
  const total = db.prepare('SELECT SUM(sessions) as s, SUM(total_minutes) as m FROM pomodoro WHERE date>=? AND date<=?').get(start, end);
  res.json({ records, total: total || { s: 0, m: 0 }, start, end });
});

// 韩语学习日历
app.get('/api/korean/calendar', (req, res) => {
  const month = req.query.month || today().substring(0, 7);
  const records = db.prepare('SELECT date, SUM(vocab_learned) as vocab, SUM(grammar_learned) as grammar, SUM(study_minutes) as minutes FROM korean_progress WHERE date>=? AND date<=? GROUP BY date ORDER BY date').all(month + '-01', month + '-31');
  const map = {};
  records.forEach(r => { map[r.date] = { vocab: r.vocab || 0, grammar: r.grammar || 0, minutes: r.minutes || 0 }; });
  res.json({ month, records: map });
});

// 历史任务（按日期）
app.get('/api/tasks/history', (req, res) => {
  const date = req.query.date || today();
  const tasks = db.prepare('SELECT * FROM tasks WHERE date=? ORDER BY id').all(date);
  res.json(tasks);
});

// 网络信息
app.get('/api/network', (req, res) => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const result = { lan: [], tailscale: null, port: PORT };
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        result.lan.push({ name, address: iface.address });
      }
    }
  }
  for (const name of Object.keys(interfaces)) {
    if (name.toLowerCase().includes('utun')) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && iface.address.startsWith('100.')) {
          result.tailscale = { name, address: iface.address };
        }
      }
    }
  }
  res.json(result);
});

// --- 数据同步 API ---
// 设备间数据同步中继
const syncStore = {}; // 内存中暂时存储同步数据（生产环境应使用持久化存储）
app.post('/api/sync', (req, res) => {
  const { changes, deviceId } = req.body;
  if (!changes || !Array.isArray(changes)) return res.json({ applied: 0 });
  let applied = 0;
  for (const change of changes) {
    if (!syncStore[change.store]) syncStore[change.store] = {};
    if (change.action === 'delete') {
      delete syncStore[change.store][change.id];
    } else {
      syncStore[change.store][change.id] = { ...change.data, _syncedAt: Date.now(), _fromDevice: deviceId };
    }
    applied++;
  }
  res.json({ applied });
});

app.get('/api/sync', (req, res) => {
  const { store, deviceId } = req.query;
  if (!store) return res.json({ items: [] });
  const items = syncStore[store] ? Object.values(syncStore[store])
    .filter(item => item._fromDevice !== deviceId) : [];
  res.json({ items });
});

// --- 数据库备份 ---
app.get('/api/backup', (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.db`);
  db.backup(backupPath);
  res.json({ success: true, path: backupPath });
});

app.get('/api/backup/list', (req, res) => {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
    .map(f => ({ name: f, path: path.join(BACKUP_DIR, f) }))
    .sort((a, b) => b.name.localeCompare(a.name));
  res.json(files);
});

// --- 每日重置 & 每日菜单 ---
app.post('/api/daily-reset', (req, res) => {
  const result = dailyReset();
  const t = today();
  db.prepare("INSERT OR REPLACE INTO match3_progress (key, value) VALUES (?, ?)").run('last_reset_date', t);
  res.json(result);
});

app.get('/api/daily-menu', (req, res) => {
  const t = today();
  const row = db.prepare("SELECT value FROM match3_progress WHERE key=?").get('daily_menu_' + t);
  if (row) {
    res.json(JSON.parse(row.value));
  } else {
    // 如果没有，即时从菜谱中生成
    const meals = ['breakfast', 'lunch', 'dinner'];
    const dailyMenu = {};
    for (const meal of meals) {
      const recipe = db.prepare('SELECT * FROM recipes ORDER BY RANDOM() LIMIT 1').get();
      dailyMenu[meal] = recipe || null;
    }
    db.prepare('INSERT OR REPLACE INTO match3_progress (key, value) VALUES (?, ?)')
      .run('daily_menu_' + t, JSON.stringify(dailyMenu));
    res.json(dailyMenu);
  }
});

// ==================== SPA Fallback ====================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== Start Server ====================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐱 小七的工作台已启动！`);
  console.log(`   本地访问: http://localhost:${PORT}`);
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`   局域网访问: http://${iface.address}:${PORT}`);
      }
    }
  }
});

// ==================== Auto Backup ====================
// 每天凌晨3点自动备份，保留最近7天
cron.schedule('0 3 * * *', () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.db`);
  try {
    db.backup(backupPath);
    console.log(`✅ 数据库自动备份完成: ${backupPath}`);

    // 清理超过7天的备份
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
      .sort();
    while (files.length > 7) {
      fs.unlinkSync(path.join(BACKUP_DIR, files[0]));
      files.shift();
    }
  } catch (e) {
    console.error('❌ 数据库备份失败:', e.message);
  }
});

// ==================== 每日重置逻辑 ====================
function dailyReset() {
  const t = today();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yd = yesterday.toISOString().split('T')[0];

  console.log(`🔄 [每日重置] 开始处理 ${t} ...`);

  try {
    // 1. 结转昨日未完成任务到今日
    const undoneTasks = db.prepare('SELECT * FROM tasks WHERE date=? AND completed=0').all(yd);
    if (undoneTasks.length > 0) {
      const carryOver = db.prepare('INSERT INTO tasks (title,description,priority,time_slot,date) VALUES (?,?,?,?,?)');
      const carryAll = db.transaction((rows) => {
        for (const r of rows) carryOver.run(r.title, r.description, r.priority, r.time_slot, t);
      });
      carryAll(undoneTasks);
      console.log(`  📋 结转 ${undoneTasks.length} 个未完成任务到今日`);
    }

    // 2. 标记昨日已完成任务为历史（不删除，保留记录）
    const doneCount = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE date=? AND completed=1').get(yd);
    if (doneCount.c > 0) {
      console.log(`  ✅ 昨日完成 ${doneCount.c} 个任务`);
    }

    // 3. 清理已购购物清单超过30天的记录（保留近期）
    const oldShop = db.prepare("SELECT COUNT(*) as c FROM shopping WHERE purchased=1 AND created_at < datetime('now','-30 days')").get();
    if (oldShop.c > 0) {
      db.prepare("DELETE FROM shopping WHERE purchased=1 AND created_at < datetime('now','-30 days')").run();
      console.log(`  🛒 清理 ${oldShop.c} 条已购购物记录（>30天）`);
    }

    // 4. 生成每日推荐菜单（三餐，从菜谱中随机选）
    const meals = ['breakfast', 'lunch', 'dinner'];
    const dailyMenu = {};
    for (const meal of meals) {
      const recipe = db.prepare('SELECT * FROM recipes ORDER BY RANDOM() LIMIT 1').get();
      dailyMenu[meal] = recipe || null;
    }

    // 5. 保存每日菜单到 match3_progress 表（复用为 KV 存储）
    db.prepare('INSERT OR REPLACE INTO match3_progress (key, value) VALUES (?, ?)')
      .run('daily_menu_' + t, JSON.stringify(dailyMenu));

    // 6. 更新仪表盘缓存（刷新连续打卡天数等）
    console.log(`  🍽️ 已生成每日推荐菜单`);

    // 7. 检查经期预测提醒
    const lastPeriod = db.prepare('SELECT * FROM period_records ORDER BY start_date DESC LIMIT 1').get();
    if (lastPeriod) {
      const lastStart = new Date(lastPeriod.start_date);
      const nextStart = new Date(lastStart);
      nextStart.setDate(nextStart.getDate() + 28);
      const daysUntil = Math.ceil((nextStart - new Date(t)) / (1000 * 60 * 60 * 24));
      if (daysUntil >= 0 && daysUntil <= 3) {
        console.log(`  📅 经期预测：距下次约 ${daysUntil} 天`);
      }
    }

    console.log(`✅ [每日重置] 完成！`);
    return { success: true, date: t, carriedTasks: undoneTasks.length, dailyMenu };
  } catch (e) {
    console.error(`❌ [每日重置] 失败:`, e.message);
    return { success: false, error: e.message };
  }
}

// 每天凌晨0点执行每日重置
cron.schedule('0 0 * * *', () => {
  dailyReset();
});

// 服务器启动时检查是否需要执行每日重置
function checkDailyResetOnStartup() {
  const t = today();
  const lastReset = db.prepare("SELECT value FROM match3_progress WHERE key=?").get('last_reset_date');
  if (!lastReset || lastReset.value !== t) {
    console.log('🌅 检测到需要执行每日重置（首次启动或跨天）');
    dailyReset();
    db.prepare("INSERT OR REPLACE INTO match3_progress (key, value) VALUES (?, ?)").run('last_reset_date', t);
  } else {
    console.log('✅ 今日每日重置已执行过，跳过');
  }
}

// 手动触发每日重置 API - 已移至 SPA Fallback 之前
// 获取每日推荐菜单 - 已移至 SPA Fallback 之前

// 启动时检查每日重置
checkDailyResetOnStartup();

console.log('📅 自动备份已设置（每天凌晨3:00，保留最近7天）');
console.log('🔄 每日重置已设置（每天凌晨0:00，任务结转+菜单生成）');
